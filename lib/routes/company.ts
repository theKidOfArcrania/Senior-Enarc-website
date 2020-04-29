import * as express from 'express';
import {asyncHan} from '../util';

import {getInst} from '../model/db';
import msg from '../msg';
import * as auth from './auth';
import {Some, isNull} from '../util';
import * as util from '../util';
import * as ent from '../model/enttypes';
import {User} from '../model/usertypes';
import {User as CUser} from '../model/user';
import type {DatabaseTransaction as DBTrans} from '../model/dbtypes';

import {UTDType as utypes} from '../model/enttypes';

const r = express.Router();
const comp = express.Router();

r.use('/company', auth.login, auth.employee);
r.use('/company', comp);

// Get a single employee
comp.get('/people', asyncHan(async function(req, res) {
  const id = parseInt(req.query.id as string);
  if (Number.isNaN(id)) {
    res.json(msg.fail('Requires id query', 'badformat'));
    return;
  }

  const m = await getInst().doRTransaction(async (tr) => {
    const u: User = new CUser(id);
    try {
      await u.reload(tr);
      if (!u.isEmployee || u.employee.worksAt !== req.employee.worksAt) {
        return msg.success('Cannot find user', null);
      }
      return msg.success('Success!', u.normalize());
    } catch (e) {
      return msg.success('Cannot find user', null);
    }
  });
  res.json(m);
}));

// Create a new employee
comp.post('/people', asyncHan(async function(req, res) {
  let m = msg.fail('Unknown error occurred', 'internal');
  const success = await getInst().doTransaction(async (tr) => {
    const comp = await tr.loadCompanyInfo(req.employee.worksAt);
    const emp = req.bodySan as (ent.Employee & ent.Users);

    if (isNull(comp)) return false;

    if (isNull(comp.manager) || comp.manager !== req.user.userID) {
      m = msg.fail('Not company employee', 'notmanager');
      return false;
    }

    if (!isNull(await tr.searchUserByEmail(emp.email))) {
      m = msg.fail('Email already exists', 'bademail');
      return false;
    }

    const password = util.randomBase64(15);
    const id = await tr.findUniqueID('User');

    emp.isEmployee = true;
    emp.isUtd = false;
    emp.oneTimePass = true;
    emp.password = await util.hashPassword(password);
    emp.worksAt = req.employee.worksAt;

    if (!(await tr.insertUserInfo(id, emp))) return false;
    if (!(await tr.insertEmployeeInfo(id, emp))) return false;
    return {id, password};
  });

  if (success) m = msg.success('Success!', success);
  res.json(m);
}));

export = r;
