const express = require('express');
const morgan = require('morgan');
const asyncHan = require('express-async-handler');
const fs = require('fs').promises;
const session = require('express-session');
const FileStore = require('session-file-store')(session);

const config = require('./config.js');
const util = require('./util.js');

const msg = require('./msg.js');
const user = require('./model/user.js');

const {getInst, setInst, Database} = require('./model/db.js');

/**
 * Initializes the server;
 */
async function initServer() {
  const app = express();
  const apis = new express.Router();

  // Use dummy storage data for right now
  setInst(new Database());
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
  app.use(asyncHan(async (req, res, next) => {
    const uid = req.session.uid;
    if (uid !== undefined) {
      const u = new user.User(uid);
      await getInst().doRTransaction((t) => u.reload(t));
      req.user = u;
    } else {
      req.user = undefined;
    }
    next();
  }));

  app.use(express.static('static'));

  // All api calls should fall under /api/v1 path
  app.use('/api/v1', apis);

  // Parse upload files only on /upload
  apis.use('/upload', require('express-fileupload')(config.UPLOAD));

  // Insert routes here
  apis.use(require('./routes/sanity.js')); // Do sanity type-checks first
  apis.use(require('./routes/upload.js'));
  apis.use(require('./routes/admin.js'));
  apis.use(require('./routes/login.js'));
  apis.use(require('./routes/team.js'));
  apis.use(require('./routes/project.js'));

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
  const server = await new Promise(function(resolve, error) {
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
