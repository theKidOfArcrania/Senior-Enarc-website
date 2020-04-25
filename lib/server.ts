import * as express from 'express';
import * as morgan from 'morgan';
import {asyncHan} from './util';
import {promises as fs} from 'fs';
import * as session from 'express-session';
import type * as http from 'http';

const FileStore = require('session-file-store').session;

import msg from './msg';
import config from './config';
import * as util from './util';
import * as user from './model/user';

import MemDatabase, {getInst, setInst} from './model/db.js';

/**
 * Initializes the server;
 */
async function initServer(): Promise<http.Server> {
  const app = express();
  const apis = express.Router();

  // Use dummy storage data for right now
  setInst(new MemDatabase());
  await getInst().doTransaction(async (tr) => {
    await require('../test/data/loader.js').loadIntoDB(tr);
    return true;
  });

  // Make upload directories
  const cwd = process.cwd() + '/';
  config.UPLOAD_PATH = cwd + config.UPLOAD_PATH;
  config.UPLOAD_IDS = cwd + config.UPLOAD_IDS;
  await fs.mkdir(config.UPLOAD_PATH, {recursive: true});
  await fs.mkdir(config.UPLOAD_IDS, {recursive: true});

  // Log HTTP requests
  if (!config.TESTING) {
    app.use(morgan('combined'));
  }

  // Parse JSON
  app.use(express.json());

  // Stores sessions on server
  app.use(session({
    ...config.SESSION_CONFIG,
    store: new FileStore(config.FILE_STORE_CONFIG),
  }));
  app.use(asyncHan(async (req: Express.Request, res: Express.Response, next):
      Promise<void> => {
    const uid = req.session.uid;
    if (uid !== undefined) {
      const u = new user.User(uid);
      await getInst().doRTransaction((t) => u.reload(t));
      req.user = u;
      req.session.touch();
    } else {
      req.user = undefined;
    }
    next();
  }));

  app.use(express.static('static'));

  // All api calls should fall under /api/v1 path
  app.use('/api/v1', apis);

  // Parse upload files only on /upload
  /* eslint-disable @typescript-eslint/no-var-requires */
  apis.use('/upload', require('express-fileupload')(config.UPLOAD));

  // Insert routes here
  apis.use(require('./routes/sanity.js')); // Do sanity type-checks first
  apis.use(require('./routes/upload.js'));
  apis.use(require('./routes/admin.js'));
  apis.use(require('./routes/login.js'));
  apis.use(require('./routes/team.js'));
  apis.use(require('./routes/project.js'));
  /* eslint-enable */

  app.use((err, req, res, next) => {
    if (!err.statusCode || err.statusCode >= 500) {
      delete err.dberror;
      console.error(err);
      res.json(msg.fail('An internal server error has occurred!', 'internal'));
    } else {
      res.status(err.statusCode).end();
    }
  });

  const iface = config.IFACE;
  const server = await new Promise<http.Server>(function(resolve) {
    const ret = app.listen(iface.port, iface.host, () => resolve(ret));
  });

  if (!config.TESTING) {
    util.log(`Listening on port ${iface.port}`);
  }
  return server;
}

if (!config.TESTING) {
  initServer().catch(function(err) {
    console.error(err);
  });
}

module.exports = initServer;
