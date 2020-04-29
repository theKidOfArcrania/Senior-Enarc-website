import * as express from 'express';
import {asyncHan} from '../util';

import {getInst} from '../model/db';
import msg from '../msg';
import * as auth from './auth';
import {Some, isNull} from '../util';
import * as util from '../util';
import * as ent from '../model/enttypes';
import {User, Employee} from '../model/usertypes';
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
      // TODO: should we allow oneTimePass
      return msg.success('Success!', u.normalize());
    } catch (e) {
      return msg.success('Cannot find user', null);
    }
  });
  res.json(m);
}));

/**
 * Check whether if the employee specified is a company manager.
 * @param tr - the database transaction object
 * @param emp - the employee in question
 */
async function chkCompMmgr<T>(tr: DBTrans<T>, emp: Employee):
Promise<Some<msg>> {
  const comp = await tr.loadCompanyInfo(emp.worksAt);
  if (isNull(comp)) return msg.fail('Unknown error occurred', 'internal');
  if (isNull(comp.manager) || comp.manager !== emp.uid) {
    return msg.fail('Not company manager', 'notmanager');
  }
  return null;
}

// Create a new employee
comp.post('/people', asyncHan(async function(req, res) {
  let m = msg.fail('Unknown error occurred', 'internal');
  const success = await getInst().doTransaction(async (tr) => {
    const emp = req.bodySan as Employee & User;
    const mm = await chkCompMmgr(tr, req.employee);
    if (!isNull(mm)) {
      m = mm;
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

// Modify a employee
comp.put('/people', asyncHan(async function(req, res) {
  let m = msg.fail('Unknown error occurred', 'internal');
  const success = await getInst().doTransaction(async (tr) => {
    // Check manager
    const mm = await chkCompMmgr(tr, req.employee);
    if (!isNull(mm)) {
      m = mm;
      return false;
    }

    // Check whether if this is a valid employee at same company
    const newEmp = req.bodySan as User;
    const oldEmp = await tr.loadEmployeeInfo(newEmp.userID);
    if (isNull(oldEmp)) {
      m = msg.fail('Invalid employee', 'baduid');
      return false;
    }

    if (oldEmp.worksAt !== req.employee.worksAt) {
      m = msg.fail('Invalid employee', 'baduid');
      return false;
    }

    // Check if this would fail unique email constraint
    const found = await tr.searchUserByEmail(newEmp.email);
    if (!isNull(found) && found !== newEmp.userID) {
      m = msg.fail('Email already exists', 'bademail');
      return false;
    }

    // Do actual modification
    m = msg.fail('Empty modification', 'empty');
    return tr.alterUserInfo(newEmp.userID, newEmp);
  });

  if (success) m = msg.success('Success!');
  res.json(m);
}));

// List all employees
comp.get('/people/list', asyncHan(async function(req, res) {
  const m = await getInst().doRTransaction(async (tr) => {
    const ids = await tr.findEmployeesAt(req.employee.worksAt);
    return msg.success('Success!', ids);
  });
  res.json(m);
}));

// Get info on some employees
comp.post('/people/list', asyncHan(async function(req, res) {
  await getInst().doRTransaction(async (tr) => {
    const ids = await tr.findEmployeesAt(req.employee.worksAt);
    const users: {[ID: number]: ent.Users} = {};
    for (const id of req.bodySan) {
      if (!ids.includes(id)) continue;
      const u = new CUser(id);
      try {
        await u.reload(tr);
        users[id] = u.normalize();
      } catch (e) {
        continue;
      }
    }
    res.json(msg.success('Success!', users));
  });
}));

// Get info on some employees
comp.delete('/people/list', asyncHan(async function(req, res) {
  let m = msg.fail('Unknown error occurred', 'internal');
  const success = await getInst().doTransaction(async (tr) => {
    // Check manager
    const mm = await chkCompMmgr(tr, req.employee);
    if (!isNull(mm)) {
      m = mm;
      return false;
    }

    const ids = await tr.findEmployeesAt(req.employee.worksAt);
    const dels: number[] = [];
    for (const id of req.bodySan) {
      if (!ids.includes(id)) continue;
      if (id === req.employee.uid) continue;
      if (await tr.deleteUser(id)) dels.push(id);
    }
    return dels;
  });

  if (success) m = msg.success('Success!', success);
  res.json(m);
}));

export = r;
