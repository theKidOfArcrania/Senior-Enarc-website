import * as express from 'express';
import * as fs2 from 'fs';
const {promises: fs} = fs2;
import {asyncHan} from '../util';

import msg from '../msg';
import config from '../config';
import * as auth from './auth';
import * as util from '../util';

const r = express.Router();

// TODO: maybe restrict certain file downloads
r.use('/file', express.static(config.UPLOAD_IDS, {
  setHeaders: function(res, path): void {
    let file = decodeURIComponent(fs2.realpathSync(path)
        .split('/').slice(-1)[0]).replace(/[\\"]/g, (x) => '\\' + x);
    file = file.slice(0, file.lastIndexOf('_'));
    res.set('Content-Disposition', `attachment; filename="${file}"`);
    util.log(file);
  },
  index: false,
  fallthrough: false,
}));

// TODO: total file upload limit
r.post('/upload', auth.login, asyncHan(async (req, res): Promise<void> => {
  if (!req.files || !req.files.file) {
    res.json(msg.fail('No files were uploaded.', 'nofile'));
    return;
  }

  if (util.isArray(req.files.file)) {
    res.json(msg.fail('Please upload one file at a time.', 'multifile'));
    return;
  }

  const file = req.files.file;
  const id = util.randomID();
  const path = `${config.UPLOAD_PATH}/${req.user.userID}/` +
      `${encodeURIComponent(file.name)}_${id}`;
  await fs.symlink(path, config.UPLOAD_IDS + '/' + id);
  await file.mv(path);
  res.json(msg.success('File uploaded!', {name: id}));
}));

module.exports = r;
