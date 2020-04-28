import * as assert from 'assert';

import config from '../lib/config';
config.TESTING = true;

import * as user from '../lib/model/user';
import Database from '../lib/model/db';
import SQLDatabase from '../lib/model/sqldb';
import * as util from '../lib/util';

import * as dtyp from '../lib/model/dbtypes';
import * as utyp from '../lib/model/usertypes';
import * as etyp from '../lib/model/enttypes';
import {UTDType as utypes} from '../lib/model/enttypes';

import * as loader from './data/loader';
import loadIntoDB from './data/loader';
import {isNull} from '../lib/util';

const db2 = loader.db;

/**
 * Asserts that the expected list equals the actual list, after disregarding
 * order of elements
 * @param actual - the actual elements found
 * @param expected - the expected elements
 */
function equalsList<T extends any[]>(actual: T, expected: T): void {
  const act = Array.prototype.slice.call(actual).sort();
  const exp = Array.prototype.slice.call(expected).sort();
  assert.deepStrictEqual(act, exp);
}


/* eslint-disable no-invalid-this */

/**
 * This verifies that a DB model is correct and valid.
 * @param db - the db object model to test
 */
function verifyModel<DB>(db: dtyp.Database<DB>): void {
  let model: dtyp.DatabaseTransaction<DB>;
  before(async function() {
    this.timeout(30000);
    model = await db.beginTransaction();
    await loadIntoDB(model);
  });

  after(async function() {
    if (model) {
      await model.rollback();
    }
    await db.close();
  });

  // beforeEach(() => setInst(model));

  describe('nested transactions', function() {
    it('begin with commit will keep changes', async function() {
      const help = {
        hid: 61337,
        hStatus: 'open',
        hDescription: 'Hello world!',
        requestor: 0,
      };
      await model.pushSP();
      await model.insertHelpTicketInfo(help.hid, help);
      await model.pushSP();
      await model.alterHelpTicketInfo(help.hid, {hStatus: 'resolved'});
      help.hStatus = 'resolved';
      await model.popSP();
      await model.popSP();
      assert.deepStrictEqual(help, await model.loadHelpTicketInfo(help.hid));
    });

    it('restore only respective SP', async function() {
      const help = {
        hid: 31337,
        hStatus: 'open',
        hDescription: 'Hello world!',
        requestor: 0,
      };
      await model.pushSP();
      await model.insertHelpTicketInfo(help.hid, help);
      await model.pushSP();
      await model.restoreSP();
      assert.deepStrictEqual(await model.loadHelpTicketInfo(help.hid), help);
      await model.restoreSP();
      assert(!(await model.alterHelpTicketInfo(help.hid, {hStatus: 'closed'})));
    });
  });

  describe('query', function() {
    const loads = [
      ['COMPANY', 'Company'],
      ['EMPLOYEE', 'Employee'],
      ['HELP_TICKET', 'HelpTicket'],
      ['PROJECT', 'Project'],
      ['STUDENT', 'Student'],
      ['TEAM', 'Team'],
      ['UTD_PERSONNEL', 'UTD'],
      ['USER', 'User'],
    ];

    for (const [tbl, mthName] of loads) {
      describe('table ' + tbl, function() {
        it('has correct value', async function() {
          const tb = db2[tbl];
          for (const [pkey, ent] of tb) {
            const actual = await model['load' + mthName + 'Info'](pkey);
            assert.deepStrictEqual(actual, ent);
          }
        });
      });
    }

    type UserFilt<T> = (u: utyp.User) => T;
    describe('user', function() {
      // Various filters to see different views of a user
      const utdFilt = (uu: utyp.User) => (uu.isUtd && uu.utd);
      const empFilt = (uu: utyp.User) => (uu.isEmployee && uu.employee);
      const stuFilt = (uu: utyp.User) => (uu.isUtd &&
        uu.utd.uType == utypes.STUDENT && uu.utd.student);
      const facFilt = (uu: utyp.User) => (uu.isUtd &&
        uu.utd.uType == utypes.FACULTY && uu.utd.faculty);
      const staffFilt = (uu: utyp.User) => (uu.isUtd &&
        uu.utd.uType == utypes.STAFF && uu.utd.staff);

      /**
       * Iterate through each user, filtering/modifying each user based on the
       * filter function, and then running the aaction function on the user.
       *
       * @param filter - a filter that modifies/removes the user object
       * @param action - the action to run per user
       */
      function forEachUsersB<T>(filter: UserFilt<T>,
          action: (arg1: number, arg2: T) => void) {
        return async function(): Promise<void> {
          for (const uid of loader.users) {
            const u = new user.User(uid);
            await u.reload(model);
            const filt = filter(u);
            if (filt) action(uid as number, filt);
          }
        };
      }

      /**
       * Checks that a particular view of the user object has a proper type.
       * @param filt - the filter to set the view of the user object
       * @param type - the expected type of this struct
       */
      function checkType<T extends utyp.Uent>(filt: UserFilt<T>, type):
          () => Promise<void> {
        return forEachUsersB<T>(filt, (uid, val) => {
          assert.strictEqual(val.uid, uid);
          assert.strictEqual(val.constructor, type);
        });
      }

      /**
       * Checks whether if there exists a user that fits this filter
       * @param filt - the filter to set the view of the user object
       */
      function exists<T extends utyp.Uent>(filt: UserFilt<T>) {
        return async function(): Promise<void> {
          for (const uid of loader.users) {
            const u = new user.User(uid);
            await u.reload(model);
            if (filt(u)) return;
          }
          assert.fail('Does not exist');
        };
      }

      /**
       * Checks that a particular view in user has the right properties.
       * @param it - the context to test from
       * @param filter - the filter to modify user object
       * @param table - the table object to check properties against
       * @param should - a list of properties that SHOULD be defined
       * @param maybe - a list of properties that maybe is defined
       */
      function checkUserProps<T>(it: Mocha.TestFunction,
          filter: UserFilt<T>,
          table: Map<string|number, any>,
          should: string[],
          maybe: string[]): void {
        for (const prop of should) {
          it(`should have .${prop}`, forEachUsersB(filter, (uid, u) => {
            assert(prop in u, `${prop} does not exist.`);
            if (util.isArray(u[prop])) {
              equalsList(u[prop], table.get(uid)[prop]);
            } else {
              assert.strictEqual(u[prop], table.get(uid)[prop]);
            }
          }));
        }

        it(`shouldn't have other properties other than [${maybe}]`,
            forEachUsersB(filter, (uid, u) => {
              for (const prop of Object.getOwnPropertyNames(u)) {
                if (!should.includes(prop) && !maybe.includes(prop)) {
                  assert.fail(`Has property .${prop}!`);
                }
              }
            }));
      }

      describe('User', function() {
        it('should have a .utd object associated with it if .isUtd',
            checkType(utdFilt, user.UTDPersonnel));
        it('should have a .employee object associated with it if .isEmployee',
            checkType(empFilt, user.Employee));

        const should = ['fname', 'lname', 'email', 'address', 'isUtd',
          'isEmployee', 'userID'];
        const maybe = ['employee', 'utd', 'uid', 'teams'];
        checkUserProps(it, (x) => x, db2.USER, should, maybe);
      });

      describe('UTDPersonnel', function() {
        it('should exist', exists(utdFilt));
        it('should have .student if uType = STUDENT',
            checkType(stuFilt, user.Student));
        it('should have .faculty if uType = FACULTY',
            checkType(facFilt, user.Faculty));
        it('should have .staff if uType = STAFF',
            checkType(staffFilt, user.Staff));

        const should = ['uType', 'netID', 'isAdmin'];
        const maybe = ['student', 'faculty', 'staff', 'uid'];
        checkUserProps(it, utdFilt, db2.UTD_PERSONNEL, should, maybe);
      });

      describe('Student', function() {
        const should = ['major', 'resume', 'memberOf', 'skills'];
        const maybe = ['uid'];
        it('should exist', exists(stuFilt));
        checkUserProps(it, stuFilt, db2.STUDENT, should, maybe);
      });

      describe('Faculty', function() {
        const should = ['tid'];
        const maybe = ['uid', 'choices'];
        it('should exist', exists(facFilt));
        checkUserProps(it, facFilt, db2.FACULTY, should, maybe);
      });

      describe('Employee', function() {
        const should = ['worksAt', 'password', 'oneTimePass'];
        const maybe = ['uid'];
        it('should exist', exists(empFilt));
        checkUserProps(it, empFilt, db2.EMPLOYEE, should, maybe);
      });

      describe('Email searches', function() {
        it('should get userID from valid email', async function() {
          const uid = (await model.searchUserByEmail(
              'pvanarsdalld@smh.com.au'));
          assert.strictEqual(uid, 13);
        });

        // NOTE THAT case unsensitivity/sEnsitivity is undefined

        it('should get invalid userID from invalid email', async function() {
          const uid = (await model.searchUserByEmail(
              'pvanarsdalld@smh.com.auu'));
          assert.strictEqual(uid, null);
        });
      });

      describe('Team members', function() {
        it('should contain all students', async function() {
          const ids = await model.findMembersOfTeam(39);
          equalsList([0, 3], ids);
        });
        it('or return empty list', async function() {
          const ids = await model.findMembersOfTeam(42);
          equalsList([], ids);
        });
        it('invalid teams return empty list', async function() {
          const ids = await model.findMembersOfTeam(1337);
          equalsList([], ids);
        });
      });
    });
  });
  describe('update', function() {
    type AlterSpec = [etyp.Tables2, string|number, {[P: string]: any}];
    const alters: AlterSpec[] = [
      ['Company', 'Shufflebeat', {logo: 'abcde'}],
      ['Employee', 1, {password: 'abcde'}],
      ['HelpTicket', 1, {requestor: 1}],
      ['Project', 1, {advisor: 1}],
      ['Student', 0, {major: 'no nonsense'}],
      ['Team', 39, {leader: 3}],
      ['UTD', 1, {isAdmin: true}],
      ['User', 0, {fname: 'John'}],
      ['Invite', 1337, {managerEmail: 'test@gmail.com'}],
    ];

    // beforeEach(async function() {
    //   await loadIntoDB(model);
    // });

    for (const [mth, uid, changes] of alters) {
      const load = `load${mth}Info`;
      const alter = `alter${mth}Info`;

      describe(mth, function() {
        it('can partial update', async function() {
          const init = Object.assign({}, await model[load](uid));
          assert(await model[alter](uid, changes), 'No changes made!');
          const after = Object.assign({}, await model[load](uid));

          Object.assign(init, changes);
          assert.deepStrictEqual(after, init);
        });
        it('should not change if invalid ID', async function() {
          const init = Object.assign({}, await model[load](uid));
          const bad = (util.isNumber(uid) ? 9001 : '9001');
          assert(!(await model[alter](bad, changes)), 'Changes made!');
          const after = Object.assign({}, await model[load](uid));
          assert.deepStrictEqual(after, init);
        });
        it('should not change if invalid fields', async function() {
          const init = Object.assign({}, await model[load](uid));
          assert(!(await model[alter](uid, {fake: 'fake'})), 'Changes made!');
          const after = Object.assign({}, await model[load](uid));
          assert.deepStrictEqual(after, init);
        });
      });
    }
  });
  describe('delete', function() {
    type AlterSpec = [dtyp.Tables2, string|number];
    const alters: AlterSpec[] = [
      ['Company', 'Shufflebeat'],
      ['Employee', 1],
      ['HelpTicket', 1],
      ['Project', 1],
      ['Student', 0],
      ['Team', 39],
      ['UTD', 1],
      ['User', 0],
      ['Faculty', 1],
      ['Invite', 1337],
    ];

    // beforeEach(async function() {
    //   await loadIntoDB(model);
    // });

    for (const [mth, uid] of alters) {
      const deleteFunc = `delete${mth}`;
      const load = `load${mth}Info`;
      describe(mth, function() {
        it('should not delete if invalid ID', async function() {
          const bad = (util.isNumber(uid) ? 9001 : '9001');
          assert(!(await model[deleteFunc](bad)));
        });
        it('should delete if valid ID', async function() {
          await model.doNestedTransaction(async () => {
            assert((await model[load](uid)));
            assert((await model[deleteFunc](uid)));
            assert(isNull((await model[load](uid))));
            return false;
          });
        });
        it('should delete all if null is passed', async function() {
          await model.doNestedTransaction(async () => {
            assert((await model[load](uid)));
            assert((await model[deleteFunc](null)));
            assert(isNull((await model[load](uid))));
            return false;
          });
        });
      });
    }
  });
  describe('findAll', function() {
    type AlterSpec = [dtyp.Tables2, string|number];
    const alters: AlterSpec[] = [
      ['Company', 'Shufflebeat'],
      ['Employee', 1],
      ['HelpTicket', 1],
      ['Project', 1],
      ['Student', 0],
      ['Team', 39],
      ['UTD', 1],
      ['User', 0],
      ['Faculty', 1],
      ['Invite', 1337],
    ];

    // beforeEach(async function() {
    //   await loadIntoDB(model);
    // });

    for (const [mth, uid] of alters) {
      const deleteFunc = `delete${mth}`;
      const findAll = `findAll${mth}s`;
      describe(mth, function() {
        it('should not be empty', async function() {
          const findAllRes = await model[findAll]();
          assert(findAllRes.length);
        });
        it('should be empty after null purge', async function() {
          await model.doNestedTransaction(async () => {
            assert((await model[deleteFunc](null)));
            const postDelete = await model[findAll]();
            assert(!(postDelete.length));
            return false;
          });
        });
      });
    }
  });
}

describe('model', async function() {
  const basic = new Database();
  describe('basic', verifyModel.bind(undefined, basic));

  // Only allow this for testing
  config.SQLCREDS.multipleStatements = true;
  const sqldb = new SQLDatabase(config.SQLCREDS);
  after(async () => {
    await sqldb.close();
  });
  this.timeout(30000);

  describe('mysql', verifyModel.bind(this, sqldb));
});
// TODO: test partial updates
