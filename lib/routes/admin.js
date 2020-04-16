const express = require('express');
const asyncHan = require('express-async-handler');

const {getInst} = require('../model/db.js');
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
  await getInst().doTransaction((tr) => tr.updateProjectInfo(id, data));
}));

// Create new project
admin.post('/project', asyncHan(async (req, res) => {
  const data = req.bodySan;
  const db = getInst();

  await db.doTransaction(async (tr) => {
    const id = tr.findUniqueID('Project');
    data.projID = id;
    await tr.insertProjectInfo(id, data);
    return true;
  });
}));

module.exports = r;
