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

/**
 * Obtains a list of projects that this user is a member of or manages.
 * @param tr - the transaction object
 * @param u - the user.
 */
async function partOfProjs<T>(tr: DBTrans<T>, u: User): Promise<number[]> {
  const pids = new Set<number>(await tr.findManagesProject(u.userID));
  for (const tid of u.teams) {
    const team = await tr.loadTeamInfo(tid);
    if (isNull(team)) continue;
    const proj = team.assignedProj;
    if (!isNull(proj)) pids.add(proj);
  }
  return [...pids];
}

enum Access {
  NONE, RESTRICTED, FULL
}

/**
 * Obtains a restriction level for a particular project and user. This returns a
 * tri-state determining the access level.
 *
 * @param tr -  the transaction object
 * @param u - the user.
 * @param p - the project
 */
async function projectRestrictionLevel<T>(tr: DBTrans<T>, u: User,
    p: ent.Project): Promise<Access> {
  let access = Access.RESTRICTED; // Default access level

  // Projects that are explicitly marked invisible are restricted
  if (!p.visible) access = Access.NONE;

  // If the status prohibits visiblity, no access is allowed
  if (!ent.projectStatuses.get(p.status).visible) access = Access.NONE;

  if (u.isUtd) {
    const utd = u.utd;
    switch (utd.uType) {
      case utypes.STUDENT:
        // Once a student selects a project, they don't see any other projects
        // TODO: also check if team is assigned a project
        if (utd.student.memberOf !== null) access = Access.NONE;
        break;
      case utypes.STAFF:
        // Staff by default have full read access
        access = Access.FULL;
        break;
      case utypes.FACULTY: // faculty only get PUBLIC access.
        break;
    }

    // Admins gets full access
    if (utd.isAdmin) access = Access.FULL;
  } else {
    // Non UTD people by default get no access to any projects
    access = Access.NONE;
  }

  // Employees see all created projects of their own company
  if (u.isEmployee && u.employee.worksAt === p.company) access = Access.FULL;
  if ([p.advisor, p.sponsor, p.mentor].includes(u.userID)) access = Access.FULL;

  // Users in a team that is assigned that project get full access
  const tid = await tr.findProjectAssignedTeam(p.projID);
  if (!isNull(tid) && u.teams.includes(tid)) access = Access.FULL;

  return access;
}

/**
 * Loads the public information of a user
 * @param tr -  the transaction object
 * @param uid - the uid of the user. If null, this will return null
 */
async function loadUser<T>(tr: DBTrans<T>, uid: Some<number>):
    Promise<Some<ent.Users>> {
  if (uid === null) return null;

  const u = new CUser(uid);
  await u.reload(tr);
  return util.copyAttribs({}, u, {'uid': null, 'fname': null, 'lname': null,
    'email': null}) as ent.Users;
}

/**
 * Loads the team, loading all aggregate data that is allowed for this user.
 * @param tr - the transaction object
 * @param u - the user requesting this project data.
 * @param pid - the project ID to load.
 */
async function loadProject<T>(tr: DBTrans<T>, u: User, pid: number):
    Promise<Some<ent.Project>> {
  const p = await tr.loadProjectInfo(pid);
  if (isNull(p)) return null;

  const access = await projectRestrictionLevel(tr, u, p);
  if (access === Access.NONE) return null;

  // Yes this a huge type violation but we are returning objects not numbers!
  p.mentor = (await loadUser(tr, p.mentor)) as Some<number>;
  p.sponsor = (await loadUser(tr, p.sponsor) as Some<number>);
  p.advisor = (await loadUser(tr, p.advisor) as Some<number>);

  let pret;
  if (access === Access.FULL) {
    pret = p;
  } else {
    pret = util.copyAttribs({}, p, {'projID': null, 'pName': null,
      'image': null, 'pDesc': null, 'sponsor': null, 'advisor': null});
  }
  return pret;
}

r.get('/project', auth.login, asyncHan(async (req, res) => {
  const u = req.user;
  await getInst().doRTransaction(async (tr) => {
    const pids = await partOfProjs(tr, u);
    pids.nsort();
    // Find the first project to view...
    for (const pid of pids) {
      const p = await loadProject(tr, u, pid);
      if (p) {
        res.json(msg.success('Success', p));
        return;
      }
    }
    res.json(msg.success('You have no projects to view.', null));
  });
}));

r.post('/project/submit', auth.login, auth.employee,
    asyncHan(async (req, res) => {
      const e = req.employee;
      let m = msg.fail('Unable to add the project.', 'internal');
      const success = await getInst().doTransaction(async (tr) => {
        const proj = req.bodySan;
        proj.projID = await tr.findUniqueID('Project');
        proj.status = ent.ProjectStatus.SUBMITTED.toString();
        proj.visible = false;
        proj.advisor = null;
        proj.company = e.worksAt;

        return await tr.insertProjectInfo(proj.projID, proj);
      });
      if (success) {
        m = msg.success('Project successfully added. Your proposal ' +
          'will now be promptly reviewed by a staff or admin.');
      }
      res.json(m);
    }));

r.put('/project', auth.login, auth.employee, asyncHan(async (req, res) => {
  const e = req.employee;
  let m = msg.fail('Unable to add the project.', 'internal');
  const success = await getInst().doTransaction(async (tr) => {
    const proj = await tr.loadProjectInfo(req.bodySan.projID);
    if (isNull(proj)) {
      m = msg.fail('Project does not exist', 'badproj');
      return false;
    }

    const comp = await tr.loadCompanyInfo(proj.company);
    const mgr = isNull(comp) ? null : comp.manager;
    if (![proj.mentor, proj.sponsor, mgr].includes(e.uid)) {
      m = msg.fail('You do not have permissions to edit this project',
          'nopermproj');
      return false;
    }

    if (!ent.projectStatuses.get(proj.status).modifiable) {
      m = msg.fail('This project is currently not modifiable', 'badstatus');
      return false;
    }

    return await tr.alterProjectInfo(proj.projID, req.bodySan);
  });

  if (success) {
    m = msg.success('Project successfully modified');
  }
  res.json(m);
}));

// Obtain a list of projects that the user wants information for
r.post('/project', auth.login, asyncHan(async (req, res) => {
  const u = req.user;
  const pids = Array.prototype.slice.call(req.bodySan);
  const projs = {};
  await getInst().doRTransaction(async (tr) => {
    for (const pid of pids) {
      const p = await loadProject(tr, u, pid);
      if (!isNull(p)) projs[p.projID] = p;
    }
  });
  res.json(msg.success('Success', projs));
}));

// Obtain all the teams that this person is associated with
r.get('/project/mylist', auth.login, asyncHan(async (req, res) => {
  const pids = await getInst().doRTransaction((tr) =>
    partOfProjs(tr, req.user));
  res.json(msg.success('Success', pids));
}));

// Obtain the project IDs of all publically visible projects
r.get('/project/list', auth.login, asyncHan(async (req, res) => {
  const u = req.user;
  await getInst().doRTransaction(async (tr) => {
    const projs: number[] = [];
    for (const pid of await tr.findAllProjects()) {
      if (isNull(await loadProject(tr, u, pid))) continue;
      projs.push(pid);
    }
    res.json(msg.success('Success', projs));
  });
}));

module.exports = r;
