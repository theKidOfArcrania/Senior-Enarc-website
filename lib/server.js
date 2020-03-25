const express = require('express');
const morgan = require('morgan');


const app = express();
const apis = new express.Router();
const port = 3000;

// Use dummy storage data for right now
const db = require('./model/db.js');
db.inst = new db.Database();
require('../test/data/loader.js').loadIntoDB(db.inst);

// Log HTTP requests
app.use(morgan('combined'));

// Parse JSON
app.use(express.json());

// Stores sessions on server
app.use(require('express-session')({
  saveUninitialized: false,
  secret: 'change this secrert!', // Make sure this secret is hidden
  resave: false,
  cookie: {
    path: '/',
    httpOnly: true,
    // secure: false, // change when we get a HTTPS proxy
    maxAge: 60 * 60 * 1000, // 1 hr
  },
}));

// All api calls should fall under /api path
app.use('/api', apis);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json(msg.fail('An internal server error has occurred!'));
});

apis.use(require('./routes/login.js'));


app.listen(port, () => console.log(`Listening on port ${port}`));
