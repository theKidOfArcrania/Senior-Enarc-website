const express = require('express');
const morgan = require('morgan');
const asyncHan = require('express-async-handler');
const fs = require('fs');

const config = require('./config.js');

const app = express();
const apis = new express.Router();
const msg = require('./msg.js');
const user = require('./model/user.js');

// Use dummy storage data for right now
const db = require('./model/db.js');
db.inst = new db.Database();
require('../test/data/loader.js').loadIntoDB(db.inst);

// Make upload directories
const cwd = process.cwd() + '/';
config.UPLOAD_PATH = cwd + config.UPLOAD_PATH;
config.UPLOAD_IDS = cwd + config.UPLOAD_IDS;
fs.mkdirSync(config.UPLOAD_PATH, {recursive: true});
fs.mkdirSync(config.UPLOAD_IDS, {recursive: true});

// Log HTTP requests
app.use(morgan('combined'));

// Parse JSON
app.use(express.json());

// Stores sessions on server
app.use(require('express-session')(config.SESSION_CONFIG));
app.use(asyncHan(async (req, res, next) => {
  const uid = req.session.uid;
  if (uid !== undefined) {
    const u = new user.User(uid);
    await u.reload();
    req.user = u;
  } else {
    req.user = undefined;
  }
  next();
}));

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

app.use((err, req, res, next) => {
  console.error(err);
  res.json(msg.fail('An internal server error has occurred!'));
});

const iface = config.IFACE;
app.listen(iface.port, iface.host,
    () => console.log(`Listening on port ${iface.port}`));
