const express = require('express');
const asyncHan = require('express-async-handler');

const {getInst, ProjectStatus} = require('../model/db.js');
const {User, UTDPersonnel} = require('../model/user.js');
const utypes = UTDPersonnel.types;
const util = require('../util.js');
const msg = require('../msg.js');

const r = new express.Router();

/**
 * Obtains a list of projects that this user is a member of or manages.
 * @param {Transaction} tr   the transaction object
 * @param {Object}      u   the user.
 * @return {Integer[]} a list of project IDs.
 */
async function partOfProjs(tr, u) {
  const pids = new Set(await tr.findManagesProject(u.userId));
  for (const tid of u.teams) {
    const proj = (await tr.loadTeamInfo(tid)).assignedProj;
    if (proj !== null) pids.add(proj);
  }
  return [...pids];
}

/**
 * Obtains a restriction level for a particular project and user.
 * @param {Transaction} tr  the transaction object
 * @param {Object}      u   the user.
 * @param {Object}      p   the project
 * @return {Boolean/Null} true if the user can get full access, false if the
 *   user can get restricted access (view public info), null if user cannot
 *   get any access.
 */
async function projectRestrictionLevel(tr, u, p) {
  let access = false; // Default access level

  // Projects that are explicitly marked invisible are restricted
  if (!p.visible) access = null;

  // If the status prohibits visiblity, set access to null.
  if (!ProjectStatus.ofString(p.status).visible) access = null;

  if (u.isUtd) {
    const utd = u.utd;
    switch (utd.uType) {
      case utypes.STUDENT:
        // Once a student selects a project, they don't see any other projects
        // TODO: also check if team is assigned a project
        if (utd.student.memberOf !== null) access = null;
        break;
      case utypes.STAFF:
        // Staff by default have full read access
        access = true;
        break;
      case utypes.FACULTY: // faculty only get PUBLIC access.
        break;
    }

    // Admins gets full access
    if (utd.isAdmin) access = true;
  } else {
    // Non UTD people by default get no access to any projects
    access = null;
  }

  // Employees see all created projects of their own company
  if (u.isEmployee && u.employee.worksAt === p.company) access = true;
  if ([p.advisor, p.sponsor, p.mentor].includes(u.userId)) access = true;

  // Users in a team that is assigned that project get full access
  const tid = await tr.findProjectAssignedTeam(p.projID);
  if (tid !== null && u.teams.includes(tid)) access = true;

  return access;
}

/**
 * Loads the public information of a user
 * @param {Transaction} tr  the transaction object
 * @param {Integer}     uid the uid of the user. If null, this will return null
 * @return {Object} the user object that can be JSON'ed.
 */
async function loadUser(tr, uid) {
  if (uid === null) return null;

  const u = new User(uid);
  await u.reload(tr);
  return util.copyAttribs({}, u, {'uid': null, 'fname': null, 'lname': null,
    'email': null});
}

/**
 * Loads the team, loading all aggregate data that is allowed for this user.
 * @param {Transaction} tr   the transaction object
 * @param {Object}      u    the user requesting this project data.
 * @param {Integer}     pid  the project ID to load.
 * @return {Object} the processed data, or null if the user has insufficient
 *     permissions to view anything
 */
async function loadProject(tr, u, pid) {
  let p;

  try {
    p = await tr.loadProjectInfo(pid);
  } catch (e) {
    if (!e.dberror) throw e;
    return null;
  }

  const access = await projectRestrictionLevel(tr, u, p);
  if (access === null) return null;

  p.mentor = await loadUser(tr, p.mentor);
  p.sponsor = await loadUser(tr, p.sponsor);
  p.advisor = await loadUser(tr, p.advisor);

  let pret;
  if (access) {
    // Full access
    pret = p;
  } else {
    // Public access
    pret = util.copyAttribs({}, p, {'projID': null, 'pName': null,
      'image': null, 'pDesc': null, 'sponsor': null, 'advisor': null});
  }
  return pret;
}

r.get('/project', util.login, asyncHan(async (req, res) => {
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
    res.json(msg.fail('You have no projects to view.', 'noproj'));
  });
}));

r.post('/project/submit', util.login, util.employee,
    asyncHan(async (req, res) => {
      const e = req.employee;
      let m = msg.fail('Unable to add the project.', 'internal');
      const success = await getInst().doTransaction(async (tr) => {
        const comp = await tr.loadCompanyInfo(e.worksAt);
        if (comp.manager !== e.uid) {
          m = msg.fail('You are not allowed to submit project ' +
            'proposals. Please contact your manager or a server admin for ' +
            'information.', 'notmanager');
          return false;
        }

        const proj = req.bodySan;
        proj.projID = await tr.findUniqueID('Project');
        proj.status = ProjectStatus.SUBMITTED.toString();
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

r.put('/project', util.login, util.employee, asyncHan(async (req, res) => {
  const e = req.employee;
  let m = msg.fail('Unable to add the project.', 'internal');
  const success = await getInst().doTransaction(async (tr) => {
    let proj;
    try {
      proj = await tr.loadProjectInfo(tr.projID);
    } catch (e) {
      m = msg.fail('Project does not exist', 'badproject');
      return false;
    }

    const comp = await tr.loadCompanyInfo(proj.company);
    if (![proj.mentor, proj.sponsor, comp.manager].includes(e.uid)) {
      m = msg.fail('You do not have permissions to edit this project',
          'nopermproj');
      return false;
    }

    if (!ProjectStatus.ofString(proj.status).modifiable) {
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
r.post('/project', util.login, asyncHan(async (req, res) => {
  const u = req.user;
  const pids = Array.prototype.slice.call(req.bodySan);
  const projs = {};
  await getInst().doRTransaction(async (tr) => {
    for (const p of await Promise.all(pids.map(
        loadProject.bind(null, tr, u)))) {
      if (p !== null) {
        projs[p.projID] = p;
      }
    }
  });
  res.json(msg.success('Success', projs));
}));

// Obtain all the teams that this person is associated with
r.get('/project/mylist', util.login, asyncHan(async (req, res) => {
  const pids = await getInst().doRTransaction((tr) =>
    partOfProjs(tr, req.user));
  res.json(msg.success('Success', pids));
}));

// Obtain the project IDs of all publically visible projects
r.get('/project/list', util.login, asyncHan(async (req, res) => {
  const u = req.user;
  await getInst().doRTransaction(async (tr) => {
    const projs = (await Promise.all((await tr.findAllProjects())
        .map(loadProject.bind(null, tr, u))))
        .filter((p) => p !== null)
        .map((p) => p.projID);
    res.json(msg.success('Success', projs));
  });
}));

module.exports = r;
