const express = require('express');
const asyncHan = require('express-async-handler');

const {getInst, DBError} = require('../model/db.js');
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
 * @param {Object}  u          the user requesting this team data.
 * @param {Boolean} onlyTeam   whether to only load the team entity.
 * @param {Object}  tid        the team ID to load.
 * @return {Object} the processed data, or null if the user has insufficient
 *     permissions to view anything
 */
async function loadTeam(u, onlyTeam, tid) {
  const db = getInst();
  let members;
  let access;
  let t;

  await db.beginTransaction();
  try {
    try {
      t = await db.loadTeamInfo(tid);
    } catch (e) {
      if (!(e instanceof DBError)) throw e;
      return null;
    }

    access = await teamRestrictionLevel(u, t);
    if (access === null) return null;

    if (onlyTeam) {
      members = [];
    } else {
      const memUids = await db.findMembersOfTeam(t.tid);
      members = memUids.map((uid) => new User(uid));
      await Promise.all(members.map((u) => u.reload()));
    }
  } finally {
    await db.commit();
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
      'uid': null, 'fname': null, 'lname': null}));
  }
  return tret;
}

r.get('/team', util.login, asyncHan(async (req, res) => {
  const u = req.user;

  // If user is a student, choose the team that they are in
  if (u.isUtd && u.utd.uType === utypes.STUDENT) {
    const t = await loadTeam(u, false, u.utd.student.memberOf);
    res.json(msg.success('Success', t));
    return;
  }

  // Find the first team to view.
  for (const tid of u.teams) {
    const t = await loadTeam(u, false, tid);
    if (t) {
      res.json(msg.success('Success', t));
      return;
    }
  }

  res.json(msg.success('You have no teams to view.', null));
  return;
}));

// Obtain a list of teams that the user wants information for
r.post('/team', util.login, asyncHan(async (req, res) => {
  const u = req.user;
  const tids = Array.prototype.slice.call(req.bodySan);
  const teams = {};
  for (const t of await Promise.all(tids.map(loadTeam.bind(null, u, false)))) {
    if (t !== null) {
      teams[t.tid] = t;
    }
  }
  res.json(msg.success('Success', teams));
}));

// Obtain all the teams that this person is associated with
r.get('/team/mylist', util.login, asyncHan(async (req, res) => {
  const tids = req.user.teams;
  res.json(msg.success('Success', tids));
}));

// Obtain the team IDs of all publically visible teams
r.get('/team/list', util.login, asyncHan(async (req, res) => {
  const u = req.user;
  const db = getInst();
  await db.beginTransaction();
  try {
    const teams = (await Promise.all((await db.findAllTeams())
        .map(loadTeam.bind(null, u, true))))
        .filter((t) => t !== null)
        .map((t) => t.tid);
    res.json(msg.success('Success', teams));
  } finally {
    await db.commit();
  }
}));

module.exports = r;
