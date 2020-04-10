const express = require('express');
const asyncHan = require('express-async-handler');
const fs = require('fs').promises;

const msg = require('../msg.js');
const util = require('../util.js');
const config = require('../config.js');

const r = new express.Router();

// TODO: total file upload limit
r.post('/upload', util.login, asyncHan(async (req, res) => {
  if (!req.files || !req.files.file) {
    res.json(msg.fail('No files were uploaded.'));
    return;
  }

  const file = req.files.file;
  const id = util.randomID();
  const path = `${config.UPLOAD_PATH}/${req.user.userId}/` +
      `${encodeURIComponent(file.name)}_${id}`;
  await fs.symlink(path, config.UPLOAD_IDS + '/' + id);
  await file.mv(path);
  res.json(msg.success('File uploaded!', {name: id}));
}));

module.exports = r;
