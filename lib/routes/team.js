const express = require('express');
const asyncHan = require('express-async-handler');

const {getInst} = require('../model/db.js');
const {User, UTDPersonnel} = require('../model/user.js');
const utypes = UTDPersonnel.types;
const util = require('../util.js');
const msg = require('../msg.js');

const r = new express.Router();

/**
 * Obtains a restriction level for a particular team and user.
 * @param {Object} u   the user.
 * @param {Object} t   the team
 * @return {Boolean/Null} true if the user can get full access, false if the
 *   user can get restricted access (view public team info), null if user cannot
 *   get any access.
 */
async function teamRestrictionLevel(u, t) {
  let access = false; // Default access level

  // Teams with a password protection will be restricted
  if (t.password) access = null;

  if (u.isUtd) {
    const utd = u.utd;
    switch (utd.uType) {
      case utypes.STUDENT:
        // Once a student selects a team, they don't see any other teams
        if (utd.student.memberOf !== null) access = null;
        break;
      case utypes.STAFF:
        // Staff by default have full read access
        access = true;
        break;
      default: // Faculty get no access by default
        access = null;
    }

    // Admins gets full access
    if (utd.isAdmin) access = true;
  } else {
    // Non UTD people by default get no access to any teams.
    access = null;
  }

  // Teams that the user is in get full access
  if (u.teams.includes(t.tid)) access = true;

  return access;
}

/**
 * Loads the team, loading all aggregate data that is allowed for this user.
 * @param {Transaction} tr     the transaction object
 * @param {Object}  u          the user requesting this team data.
 * @param {Boolean} onlyTeam   whether to only load the team entity.
 * @param {Object}  tid        the team ID to load.
 * @return {Object} the processed data, or null if the user has insufficient
 *     permissions to view anything
 */
async function loadTeam(tr, u, onlyTeam, tid) {
  let members;
  let t;

  try {
    t = await tr.loadTeamInfo(tid);
  } catch (e) {
    if (e.dberror) return null;
    else throw e;
  }

  const access = await teamRestrictionLevel(u, t);
  if (access === null) return null;

  if (onlyTeam) {
    members = [];
  } else {
    const memUids = await tr.findMembersOfTeam(t.tid);
    members = memUids.map((uid) => new User(uid));
    await Promise.all(members.map((u) => u.reload(tr)));
  }

  let tret;
  if (access) {
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
    tret = util.copyAttribs({}, t, {'tid': null, 'leader': null});
    tret.members = members.map((m) => utils.copyAttribs({}, m, {
      'uid': null, 'fname': null, 'lname': null, 'email': null}));
  }
  return tret;
}

r.get('/team', util.login, asyncHan(async (req, res) => {
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
r.post('/team', util.login, asyncHan(async (req, res) => {
  const u = req.user;
  const tids = Array.prototype.slice.call(req.bodySan);
  const teams = {};

  await getInst().doRTransaction(async (tr) => {
    for (const t of await Promise.all(tids.map(
        loadTeam.bind(null, tr, u, false)))) {
      if (t !== null) {
        teams[t.tid] = t;
      }
    }
  });

  res.json(msg.success('Success', teams));
}));

r.post('/team/join', util.login, util.student, asyncHan(async (req, res) => {
  const s = req.student;
  if (s.memberOf !== null) {
    res.json(msg.fail('You are already part of a team. Leave this team ' +
      'to join the other team.', 'alreadyjoin'));
    return;
  }

  let m = msg.fail('An unknown error occurred!', 'internal');
  const success = await getInst().doTransaction(async (tr) => {
    const {team: tid, password} = req.bodySan;
    try {
      team = await tr.loadTeamInfo(tid);
    } catch (e) {
      m = msg.fail('That team does not exist', 'badteam');
      return false;
    }

    if (team.password !== null) {
      if (!password) {
        m = msg.fail('This team requires a password', 'badteampass');
        return false;
      }

      if (util.chkPassword(password, team.password)) {
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

r.put('/team', util.student, asyncHan(async (req, res) => {
  const alters = req.bodySan;
  const choices = alters.choices;
  const setLeader = alters.leader;
  delete alters.choices;

  let m = msg.fail('An unknown error occurred!', 'internal');
  const success = await getInst().doTransaction(async (tr) => {
    const tid = s.memberOf;
    const team = await tr.loadTeamInfo(tid);
    const members = await tr.findMembersOfTeam(tid);
    if (team.leader !== s.uid) {
      m = msg.fail('You must be the team leader', 'notteamleader');
      return false;
    }

    if (setLeader !== undefined && !members.includes(setLeader)) {
      m = msg.fail('New leader should be in the team', 'notinteam');
      return false;
    }

    if (choices) {
      const used = new Set(...choices);
      if (used.size !== choices.length) {
        m = msg.fail('Duplicate project choices!', 'duplicatechoice');
        return false;
      }

      try {
        await Promise.all(choices.map(tr.loadProjectInfo.bind(tr)));
      } catch (e) {
        m = msg.fail('Invalid project choice', 'invalidproject');
        return false;
      }

      await tr.setChoices(tid, choices);
    }

    await tr.alterTeamInfo(tid, alters);
  });

  if (success) {
    m = msg.success('You have successfully made changes to the team!');
  }
  res.json(m);
}));

r.post('/team/leave', util.student, asyncHan(async (req, res) => {
  const s = req.student;
  let m = msg.fail('An unknown error occurred!', 'internal');
  const success = await getInst().doTransaction(async (tr) => {
    const tid = s.memberOf;
    const team = await tr.loadTeamInfo(tid);
    const members = await tr.findMembersOfTeam(tid);
    if (team.leader === s.uid) {
      if (members.length > 1) {
        m= msg.fail('Make someone else the leader of this team.', 'teamleader');
        return false;
      } else {
        if (!(await (tr.alterTeamInfo(tid, {leader: null})))) return false;
      }
    }

    return tr.alterStudentInfo(s.uid, {memberOf: null});
  });

  if (success) m = msg.success('You have successfully left the team!');
  res.json(m);
}));

// Obtain all the teams that this person is associated with
r.get('/team/mylist', util.login, asyncHan(async (req, res) => {
  const tids = req.user.teams;
  res.json(msg.success('Success', tids));
}));

// Obtain the team IDs of all publically visible teams
r.get('/team/list', util.login, asyncHan(async (req, res) => {
  const u = req.user;
  await getInst().doRTransaction(async (tr) => {
    const teams = (await Promise.all((await tr.findAllTeams())
        .map(loadTeam.bind(null, tr, u, true))))
        .filter((t) => t !== null)
        .map((t) => t.tid);
    res.json(msg.success('Success', teams));
  }, 500);
}));

module.exports = r;
