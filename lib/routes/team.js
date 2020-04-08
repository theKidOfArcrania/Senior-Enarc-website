const express = require('express');
const asyncHan = require('express-async-handler');

const getInst = require('../model/db.js').getInst;
const user = require('../model/user.js');
const utypes = user.UTDPersonnel.types;
const util = require('../util.js');
const msg = require('../msg.js');

const r = new express.Router();

/**
 * Processes a team (loading all aggregate data) from the raw database info.
 * @param {Boolean} restricted  whether to restrict to public team information
 * @param {Object}  t           the raw team object data from database.
 * @return {Object} the processed data
 */
async function loadTeam(restricted, t) {
  let tret;

  if (restricted) {
    tret = util.copyAttribs({}, t, {'tid': null, 'leader': null});
  } else {
    tret = t;
  }

  const memUids = await db.findMembersOfTeam(tret.tid);
  const members = memUids.map((uid) => new user.User(uid));
  await Promise.all(members.map((u) => u.reload()));
  // TODO: maybe make this more efficient by making a direct query

  if (restricted) {
    tret.members = members.map((m) => utils.copyAttribs({}, m, {
      'uid': null, 'fname': null, 'lname': null}));
  } else {
    tret.members = members.map((m) => m.normalize());
  }
  return tret;
}

r.get('/team', util.login, asyncHan(async (req, res) => {
  const u = req.user;
  const db = getInst();
  if (!u.isUtd || u.utd.uType !== utypes.STUDENT) {
    // TODO: faculty/sponsors can view this page?
    res.json(msg.fail('Must be a student to view your team'));
    return;
  }

  if (!u.memberOf) {
    res.json(msg.fail('You are not a member of a team!'));
    return;
  }

  res.json(await loadTeam(false, db.loadTeamInfo(u.memberOf)));
}));

r.get('/team/list', util.login, asyncHan(async (req, res) => {
  const u = req.user;
  const db = getInst();
  if (!u.isUtd || u.utd.uType !== utypes.STUDENT) {
    res.json(msg.fail('Must be a student to view teams list'));
    return;
  }

  const tids = await db.findAllTeams();
  let teams = await Promise.all(tids.map((v) => db.loadTeamInfo(v)));

  // Filter teams that have a password protection thing
  teams = teams.filter((t) => !t.password);

  // Only select tid, leader, and all members
  teams = await Promise.all(teams.map(loadTeam.bind(null, true)));

  res.json(teams);
}));

module.exports = r;
