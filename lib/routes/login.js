const express = require('express');
const asyncHan = require('express-async-handler');

const config = require('../config.js');
const inst = require('../model/db.js').getInst;
const user = require('../model/user.js');
const utypes = user.UTDPersonnel.types;
const util = require('../util.js');
const msg = require('../msg.js');

const r = new express.Router();

// Check whether if a user is logged in at this point
r.get('/checksess', util.login, asyncHan(async (req, res) => {
  const user = req.user;

  let utype = null;
  if (user.isUtd) {
    switch (user.utd.uType) {
      case utypes.STUDENT: utype = 'student'; break;
      case utypes.STAFF: utype = 'staff'; break;
      case utypes.FACULTY: utype = 'faculty'; break;
    }
  }

  res.json(msg.success('You are logged in!',
      {
        name: user.lname + ', ' + user.fname,
        admin: user.isUtd && user.utd.isAdmin,
        utd: user.isUtd,
        utype: utype,
        employee: user.isEmployee,
      }));
}));

// Sponsor login
r.post('/login', asyncHan(async (req, res) => {
  const data = req.bodySan;

  // Lookup user's email credentials
  const uid = await inst().searchUserByEmail(data.email);
  if (uid === null) {
    res.json(msg.fail('Invalid email or password!'));
    console.log(data.email + ': User not found');
    return;
  }

  // Load user
  const u = new user.User(uid);
  await u.reload();

  // Deny non employees
  if (!u.isEmployee) {
    res.json(msg.fail('Invalid email or password!'));
    console.log(data.email + ': Non-employee user');
    return;
  }

  // Finally check the password that the user gave vs the hash.
  if (await util.chkPassword(data.password, u.employee.password)) {
    req.session.uid = uid;
    res.json(msg.success('You have successfully logged in!'));
  } else {
    res.json(msg.fail('Invalid email or password!'));
    console.log(data.email + ': Invalid password attempt');
  }
}));

// Test login
if (config.TESTING) {
  r.post('/testlogin', asyncHan(async (req, res) => {
    const uid = await inst().searchUserByEmail(req.bodySan.email);
    if (uid === null) {
      res.json(msg.fail('Invalid username or password!'));
      return;
    }

    req.session.uid = uid;
    res.json(msg.success('You have successfully logged in!'));
  }));
}

// UTD login
r.post('/utdlogin', asyncHan(async (req, res) => {
  // TODO: SSO login
  // For now just give me a email and i'll give you a user.

  const uid = await inst().searchUserByEmail(req.bodySan.email);
  if (uid === null) {
    res.json(msg.fail('Invalid username or password!'));
    return;
  }

  req.session.uid = uid;
  res.json(msg.success('You have successfully logged in!'));
}));

r.post('/logout', (req, res) => {
  req.session.destroy();
  res.json(msg.success('You have been logged out!'));
});

module.exports = r;
