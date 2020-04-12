const express = require('express');
const asyncHan = require('express-async-handler');

const getDB = require('../model/db.js').getInst;
const msg = require('../msg.js');
const util = require('../util.js');

const r = new express.Router();
const admin = new express.Router();

r.use('/admin/', util.login, (req, res, next) => {
  const u = req.user;
  if (u.isUtd && u.utd.isAdmin) {
    next();
  } else {
    res.json(msg.fail('You are not an admin!', 'notadmin'));
  }
});

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
