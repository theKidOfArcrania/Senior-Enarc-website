import * as express from 'express';
import {asyncHan} from '../util';

import config from '../config';
import {getInst} from '../model/db';
import msg from '../msg';
import * as auth from './auth';
import {Some, isNull} from '../util';
import * as util from '../util';
import {User} from '../model/user';

const r = express.Router();

// Check whether if a user is logged in at this point
r.get('/checksess', auth.login, asyncHan(async (req, res): Promise<void> => {
  const user = req.user;
  res.json(msg.success('You are logged in!', user.normalize()));
}));

// Sponsor login
r.post('/login', asyncHan(async (req, res): Promise<void> => {
  const data = req.bodySan;

  // Lookup user's email credentials
  const ret = await getInst().doRTransaction(async (tr):
      Promise<[User, number]|false> => {
    const uid = await tr.searchUserByEmail(data.email);
    if (isNull(uid)) {
      res.json(msg.fail('Invalid email or password!', 'nouser'));
      util.log(data.email + ': User not found');
      return false;
    }

    // Load user
    const u = new User(uid);
    await u.reload(tr);
    return [u, uid];
  }, 100);
  if (!ret) return;
  const [u, uid] = ret;

  // Deny non employees
  if (!u.isEmployee) {
    res.json(msg.fail('Invalid email or password!', 'notemployee'));
    util.log(data.email + ': Non-employee user');
    return;
  }

  // Finally check the password that the user gave vs the hash.
  if (await util.chkPassword(data.password, u.employee.password)) {
    req.session.uid = uid;
    res.json(msg.success('You have successfully logged in!'));
  } else {
    res.json(msg.fail('Invalid email or password!', 'badpassword'));
    util.log(data.email + ': Invalid password attempt');
  }
}));

// Test login
if (config.TESTING) {
  r.post('/testlogin', asyncHan(async (req, res): Promise<void> => {
    const uid = await getInst().doRTransaction((tr): Promise<Some<number>> =>
      tr.searchUserByEmail(req.bodySan.email), 100);
    if (isNull(uid)) {
      res.json(msg.fail('Invalid username or password!', 'nouser'));
      return;
    }

    req.session.uid = uid;
    res.json(msg.success('You have successfully logged in!'));
  }));
}

// UTD login
r.post('/utdlogin', asyncHan(async (req, res): Promise<void> => {
  // TODO: SSO login
  // For now just give me a email and i'll give you a user.

  const uid = await getInst().doRTransaction((tr) =>
    tr.searchUserByEmail(req.bodySan.email), 100);
  if (uid === null) {
    res.json(msg.fail('Invalid username or password!', 'nouser'));
    return;
  }

  req.session.uid = uid;
  res.json(msg.success('You have successfully logged in!'));
}));

r.post('/logout', async (req, res) => {
  await util.promisify(req.session.destroy);
  res.json(msg.success('You have been logged out!'));
});

module.exports = r;
