const express = require('express');
const morgan = require('morgan');

const config = require('./config.js');

const app = express();
const apis = new express.Router();

// Use dummy storage data for right now
const db = require('./model/db.js');
db.inst = new db.Database();
require('../test/data/loader.js').loadIntoDB(db.inst);

// Log HTTP requests
app.use(morgan('combined'));

// Parse JSON
app.use(express.json());

// Stores sessions on server
app.use(require('express-session')(config.SESSION_CONFIG));

// All api calls should fall under /api path
app.use('/api', apis);

// Insert routes here
apis.use(require('./routes/sanity.js')); // Do sanity type-checks first
apis.use(require('./routes/admin.js'));
apis.use(require('./routes/login.js'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json(msg.fail('An internal server error has occurred!'));
});

const iface = config.IFACE;
app.listen(iface.port, iface.host,
    () => console.log(`Listening on port ${iface.port}`));
