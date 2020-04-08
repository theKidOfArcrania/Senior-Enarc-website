const express = require('express');

// Handles errors inside promises for express routes
const asyncHan = require('express-async-handler');

const inst = require('../model/db.js').getInst;
const user = require('../model/user.js');
const util = require('../util.js');
const msg = require('../msg.js');

const r = new express.Router();

// Check whether if a user is logged in at this point
r.get('/checksess', (req, res) => {
  const user = req.session.user;
  if (user) {
    res.json(msg.success('You are logged in!',
        {
          name: user.lname + ', ' + user.fname,
          admin: user.isUtd && user.utd.isAdmin,
          utd: user.isUtd,
          employee: user.isEmployee,
        }));
  } else {
    res.json(msg.fail('You are not logged in!'));
  }
});

// Sponsor login
r.post('/login', asyncHan(async (req, res) => {
  // Lookup user's email credentials
  const uid = await inst().searchUserByEmail(data.email);
  if (uid === -1) {
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
    req.session.user = u;
    res.json(msg.success('You have successfully logged in!'));
  } else {
    res.json(msg.fail('Invalid email or password!'));
    console.log(data.email + ': Invalid password attempt');
  }
}));

// UTD login
r.post('/utdlogin', asyncHan(async (req, res) => {
  // TODO: SSO login
  // For now just give me a email and i'll give you a user.

  data = JSON.parse(req.data);
  const uid = await inst().searchUserByEmail(data.email);
  if (uid === -1) {
    res.json(msg.fail('Invalid username or password!'));
    return;
  }

  // Load user
  const u = new user.User(uid);
  await u.reload();

  req.session.user = u;
  res.json(msg.success('You have successfully logged in!'));
}));

r.post('/logout', (req, res) => {
  req.session.destroy();
  res.json(msg.success('You have been logged out!'));
});

module.exports = r;
