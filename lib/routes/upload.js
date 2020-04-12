const express = require('express');
const asyncHan = require('express-async-handler');
const fs = require('fs').promises;
const fs2 = require('fs');

const msg = require('../msg.js');
const util = require('../util.js');
const config = require('../config.js');

const r = new express.Router();

// TODO: maybe restrict certain file downloads
r.use('/file', express.static(config.UPLOAD_IDS, {
  setHeaders: function(res, path, stat) {
    let file = decodeURIComponent(fs2.realpathSync(path)
        .split('/').slice(-1)).replace(/[\\"]/g, (x) => '\\' + x);
    file = file.slice(0, file.lastIndexOf('_'));
    res.set('Content-Disposition', `attachment; filename="${file}"`);
    util.log(file);
  },
  index: false,
  fallthrough: false,
}));

// TODO: total file upload limit
r.post('/upload', util.login, asyncHan(async (req, res) => {
  if (!req.files || !req.files.file) {
    res.json(msg.fail('No files were uploaded.', 'nofile'));
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
