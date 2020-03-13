const express = require('express');
const app = express();
const apis = new express.Router();
const port = 3000;

const msg = require('./msg.js');

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

// Insert APIs here
apis.get('/checksess', (req, res) => {
  const user = req.session.user;
  if (user) {
    res.json(msg.success({name: user.name}));
  } else {
    res.json(msg.fail('You are not logged in!'));
  }
});

app.listen(port, () => console.log(`Listening on port ${port}`));
