const express = require('express');
const crypto = require('crypto');
const asyncHan = require('express-async-handler');

const getDB = require('../model/db.js').getInst;
const user = require('../model/user.js');
const util = require('../util.js');
const msg = require('../msg.js');

const r = new express.Router();
const admin = new express.Router();

r.use('/admin/', asyncHan(async (req, res, next) => {
  const u = req.session.user;
  if (!u) {
    res.json(msg.fail('You are not logged in!'));
    return;
  }

  await u.reload();
  if (u.isUtd && u.utd.isAdmin) {
    next();
  } else {
    res.json(msg.fail('You are not an admin!'));
  }
}));

r.use('/admin/', admin);

// TODO: file upload, and check name (for character whitelist + file exists)
// Update project information
admin.put('/project', asyncHan(async (req, res) => {
  const data = req.bodySan;
  const id = data.projID;
  delete data.projID;
  await getDB().updateProjectInfo(id, data);
}));

// Create new project
admin.post('/project', asyncHan(async (req, res) => {
  const data = req.bodySan;
  const db = getDB();

  await db.beginTransaction();
  const id = db.findUniqueID('Project');
  db.projID = id;
  await db.insertProjectInfo(id, data);
  await db.commit();
}));

module.exports = r;
