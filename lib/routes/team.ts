import * as express from 'express';
import {asyncHan} from '../util';

import {getInst} from '../model/db';
import msg from '../msg';
import * as auth from './auth';
import {Some, isNull} from '../util';
import * as util from '../util';
import * as ent from '../model/enttypes';
import {User} from '../model/usertypes';
import {User as CUser} from '../model/user';
import type {DatabaseTransaction as DBTrans} from '../model/dbtypes';

import {UTDType as utypes} from '../model/enttypes';

const r = express.Router();

enum Access {
  NONE, RESTRICTED, FULL
}

/**
 * Obtains a restriction level for a particular team and user. This returns a
 * tri-state determining the access level.
 *
 * @param u - the user.
 * @param t - the team
 */
function teamRestrictionLevel(u: User, t: ent.Team): Access {
  let access = Access.RESTRICTED; // Default access level

  // Teams with a password protection will be restricted
  if (t.password) access = Access.NONE;

  if (u.isUtd) {
    const utd = u.utd;
    switch (utd.uType) {
      case utypes.STUDENT:
        // Once a student selects a team, they don't see any other teams
        if (utd.student.memberOf !== null) access = Access.NONE;
        break;
      case utypes.STAFF:
        // Staff by default have full read access
        access = Access.FULL;
        break;
      default: // Faculty get no access by default
        access = Access.NONE;
    }

    // Admins gets full access
    if (utd.isAdmin) access = Access.FULL;
  } else {
    // Non UTD people by default get no access to any teams.
    access = Access.NONE;
  }

  // Teams that the user is in get full access
  if (u.teams.includes(t.tid)) access = Access.FULL;

  return access;
}

/**
 * Wraps the common code for loading a team from a memberOf relation into a
 * Check monad. If succesful, returns the team and members of that team,
 * otherwise returns a message detailing the failure.
 *
 * @param tr - the DB transaction
 * @param tid - the team ID used to load team (this is usually the memberOf
 *              property of student). If this is null, it will fail.
 * @param reqLeader - whether if this uid specified should be the leader. If
 *                    null is given here, no check will be made
 */
async function checkLoadTeam<T>(tr: DBTrans<T>, tid: Some<number>,
    reqLeader: Some<number>): Promise<util.Check<[ent.Team, number[]], msg>> {
  if (isNull(tid)) {
    return util.Fail(msg.fail('You are not in a team!', 'notinteam'));
  }

  const team = await tr.loadTeamInfo(tid);
  if (isNull(team)) {
    // Should never happen
    return util.Fail(msg.fail('Error loading team info', 'internal'));
  }

  if (!util.isNull(reqLeader) && team.leader !== reqLeader) {
    return util.Fail(msg.fail('You must be the team leader', 'notteamleader'));
  }

  const members = await tr.findMembersOfTeam(tid);
  return util.Success([team, members]);
}

/**
 * Loads the team, loading all aggregate data that is allowed for this user.
 * @param tr - the transaction object
 * @param u - the user requesting this team data.
 * @param onlyTeam - whether to only load the team entity.
 * @param tid - the team ID to load.
 */
async function loadTeam<DB>(tr: DBTrans<DB>, u: User, onlyTeam: boolean,
    tid: Some<number>): Promise<Some<ent.Team>> {
  let members;

  if (isNull(tid)) return null;

  const t = await tr.loadTeamInfo(tid);
  if (isNull(t)) return null;

  const access = await teamRestrictionLevel(u, t);
  if (access === Access.NONE) return null;

  if (onlyTeam) {
    members = [];
  } else {
    const memUids = await tr.findMembersOfTeam(t.tid);
    members = memUids.map((uid) => new CUser(uid));
    await Promise.all(members.map((u) => u.reload(tr)));
  }

  let tret;
  if (access === Access.FULL) {
    // Full access
    tret = t;
    tret.members = members.map((m) => {
      m = m.normalize();
      delete m.password; // Don't leak password!
      return m;
    });
  } else {
    // TODO: maybe make this more efficient by making a direct query
    // Public access
    tret = util.copyAttribs({}, t, ['tid', 'leader', 'comments', 'name',
      'membLimit']);
    tret.members = members.map((m) => util.copyAttribs({}, m, ['uid',
      'fname', 'lname', 'email']));
  }
  return tret;
}

r.get('/team', auth.login, asyncHan(async (req, res) => {
  const u = req.user;

  await getInst().doRTransaction(async (tr) => {
    // If user is a student, choose the team that they are in
    if (u.isUtd && u.utd.uType === utypes.STUDENT) {
      const t = await loadTeam(tr, u, false, u.utd.student.memberOf);
      res.json(msg.success('Success', t));
      return;
    }

    // Find the first team to view.
    for (const tid of u.teams) {
      const t = await loadTeam(tr, u, false, tid);
      if (t) {
        res.json(msg.success('Success', t));
        return;
      }
    }

    res.json(msg.success('You have no teams to view.', null));
    return;
  });
}));

// Obtain a list of teams that the user wants information for
r.post('/team', auth.login, asyncHan(async (req, res) => {
  const u = req.user;
  const tids = Array.prototype.slice.call(req.bodySan);
  const teams = {};

  await getInst().doRTransaction(async (tr) => {
    for (const tid of tids) {
      const t = await loadTeam(tr, u, false, tid);
      if (!isNull(t)) teams[t.tid] = t;
    }
  });

  res.json(msg.success('Success', teams));
}));

r.post('/team/join', auth.login, auth.student, asyncHan(async (req, res) => {
  const s = req.student;
  if (s.memberOf !== null) {
    res.json(msg.fail('You are already part of a team. Leave this team ' +
      'to join the other team.', 'alreadyjoin'));
    return;
  }

  let m = msg.fail('An unknown error occurred!', 'internal');
  const success = await getInst().doTransaction(async (tr) => {
    const {team: tid, password} = req.bodySan;
    const team = await tr.loadTeamInfo(tid);
    if (isNull(team)) {
      m = msg.fail('That team does not exist', 'badteam');
      return false;
    }

    const members = (await tr.findMembersOfTeam(team.tid)).length;
    if (members >= team.membLimit) {
      m = msg.fail('That team is already full', 'teamfull');
      return false;
    }

    if (!isNull(team.password)) {
      if (!password) {
        m = msg.fail('This team requires a password', 'noteampass');
        return false;
      }

      if (!(await util.chkPassword(password, team.password))) {
        m = msg.fail('Invalid team password', 'badteampass');
        return false;
      }
    }

    if (team.leader === null) {
      if (!(await tr.alterTeamInfo(tid, {leader: s.uid}))) return false;
    }

    return await tr.alterStudentInfo(s.uid, {memberOf: tid});
  });

  if (success) m = msg.success('You have successfully joined the team!');
  res.json(m);
}));

r.put('/team', auth.student, asyncHan(async (req, res) => {
  const alters = req.bodySan;
  const s = req.student;
  const {choices, leader: setLeader, password: setPassword,
    name: setName} = alters;

  let m = msg.fail('An unknown error occurred!', 'internal');
  const success = await getInst().doTransaction(async (tr) => {
    const loading = await checkLoadTeam(tr, s.memberOf, s.uid);
    if (!util.isSuccess(loading)) {
      m = loading[1];
      return false;
    }

    const [team, members] = loading[1];
    if (setName !== undefined) {
      const hasName = await tr.searchTeamByName(setName);
      if (hasName !== team.tid && !util.isNull(hasName)) {
        m = msg.fail('Team name already exist', 'badteamname');
        return false;
      }
    }

    if (setLeader !== undefined && !members.includes(setLeader)) {
      m = msg.fail('New leader should be in the team', 'notinteam');
      return false;
    }

    if (choices) {
      const used = new Set<number>(choices);
      if (used.size !== choices.length) {
        m = msg.fail('Duplicate project choices!', 'duplicatechoice');
        return false;
      }

      for (const pid of used) {
        if (isNull(await tr.loadProjectInfo(pid))) {
          m = msg.fail('Invalid project choice', 'badproj');
          return false;
        }
      }
    }

    if (setPassword !== undefined && setPassword !== null) {
      alters.password = await util.hashPassword(setPassword);
    }

    m = msg.fail('Empty modification', 'empty');
    return await tr.alterTeamInfo(team.tid, alters);
  });

  if (success) {
    m = msg.success('You have successfully made changes to the team!');
  }
  res.json(m);
}));

// Remove a member from a team
r.delete('/team/member', auth.student, asyncHan(async (req, res) => {
  let m = msg.fail('An unknown error occurred!', 'internal');
  const s = req.student;
  const uids = Array.prototype.slice.call(req.bodySan);
  const success = await getInst().doTransaction(async (tr) => {
    const loading = await checkLoadTeam(tr, s.memberOf, s.uid);
    if (!util.isSuccess(loading)) {
      m = loading[1];
      return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [team, members] = loading[1];
    if (uids.includes(s.uid)) {
      m = msg.fail('You cannot remove yourself', 'teamremoveself');
      return false;
    }

    for (const u of uids) {
      if (!members.includes(u)) {
        m = msg.fail('User to remove is not in team', 'notinteam');
        return false;
      }
      if (!(await tr.alterStudentInfo(u, {memberOf: null}))) return false;
    }
    return true;
  });

  if (success) {
    m = msg.success('You have successfully made changes to the team!');
  }
  res.json(m);
}));

// Leave the team
r.post('/team/leave', auth.student, asyncHan(async (req, res) => {
  const s = req.student;
  let m = msg.fail('An unknown error occurred!', 'internal');
  const success = await getInst().doTransaction(async (tr) => {
    const loading = await checkLoadTeam(tr, s.memberOf, null);
    if (!util.isSuccess(loading)) {
      m = loading[1];
      return false;
    }

    const [team, members] = loading[1];
    if (team.leader === s.uid) {
      if (members.length > 1) {
        m= msg.fail('Make someone else the leader of this team.', 'teamleader');
        return false;
      } else {
        if (!(await (tr.alterTeamInfo(team.tid, {leader: null})))) return false;
      }
    }

    return tr.alterStudentInfo(s.uid, {memberOf: null});
  });

  if (success) m = msg.success('You have successfully left the team!');
  res.json(m);
}));

// Obtain all the teams that this person is associated with
r.get('/team/mylist', auth.login, asyncHan(async (req, res) => {
  const tids = req.user.teams;
  res.json(msg.success('Success', tids));
}));

// Obtain the team IDs of all publically visible teams
r.get('/team/list', auth.login, asyncHan(async (req, res) => {
  const u = req.user;
  await getInst().doRTransaction(async (tr) => {
    const teams: number[] = [];
    for (const tid of await tr.findAllTeams()) {
      if (isNull(await loadTeam(tr, u, true, tid))) continue;
      teams.push(tid);
    }
    res.json(msg.success('Success', teams));
  }, 500);
}));

module.exports = r;
