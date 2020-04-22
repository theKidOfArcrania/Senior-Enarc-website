// const danglingTest = require('../lib/dangling.js');
// if (!process.env['DANGLING_TEST']) danglingTest.disable();

const config = require('../lib/config.js');
config.TESTING = true;

const assert = require('assert');
const user = require('../lib/model/user.js');
const {Database} = require('../lib/model/db.js');
const sql = require('../lib/model/sqldb.js');
const util = require('../lib/util.js');

const utypes = user.UTDPersonnel.types;

const loader = require('./data/loader.js');

const db2 = loader.db;

/**
 * Transforms a function into a filter function.
 * @param {Function} fn    the function
 * @return {Function} the transformed version.
 */
function filter(fn) {
  fn.then = function(thenFilt) {
    return filter(function(x) {
      x = fn(x);
      return x && thenFilt(x);
    });
  };
  return fn;
}

/**
 * Asserts that the expected list equals the actual list, after disregarding
 * order of elements
 * @param {String[]} actual      the actual elements found
 * @param {String[]} expected    the expected elements
 */
function equalsList(actual, expected) {
  const act = Array.prototype.slice.call(actual).sort();
  const exp = Array.prototype.slice.call(expected).sort();
  assert.deepStrictEqual(act, exp);
}


/**
 * This verifies that a DB model is correct and valid.
 * @param {Object} db   the db object model to test
 */
function verifyModel(db) {
  let model;
  before(async function() {
    this.timeout(30000);
    model = await db.beginTransaction();
    await loader.loadIntoDB(model);
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
      help = {
        hid: 61337,
        hStatus: 'none',
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
      help = {
        hid: 31337,
        hStatus: 'none',
        hDescription: 'Hello world!',
        requestor: 0,
      };
      await model.pushSP();
      await model.insertHelpTicketInfo(help.hid, help);
      await model.pushSP();
      await model.restoreSP();
      assert.deepStrictEqual(await model.loadHelpTicketInfo(help.hid), help);
      await model.restoreSP();
      assert(!(await model.alterHelpTicketInfo(help.hid, {hStatus: 'test'})));
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
          tb = db2[tbl];
          for (const [pkey, ent] of tb) {
            const actual = await model['load' + mthName + 'Info'](pkey);
            assert.deepStrictEqual(actual, ent);
          }
        });
      });
    }

    describe('user', function() {
      // Various filters to see different views of a user
      const utdFilt = filter((uu) => (uu.isUtd && uu.utd));
      const empFilt = filter((uu) => (uu.isEmployee && uu.employee));
      const stuFilt = utdFilt.then((utd) =>
        (utd.uType === utypes.STUDENT && utd.student));
      const facFilt = utdFilt.then((utd) =>
        (utd.uType === utypes.FACULTY && utd.faculty));
      const staffFilt = utdFilt.then((utd) =>
        (utd.uType === utypes.STAFF && utd.staff));

      /**
       * Iterate through each user, filtering/modifying each user based on the
       * filter function, and then running the aaction function on the user.
       *
       * @param {Function} filter    a filter that modifies/removes the user
       *                             object
       * @param {Function} action    the action to run per user
       * @return {Function} a function that iterates through all users
       */
      function forEachUsersB(filter, action) {
        return function() {
          pms = [];
          for (const u of loader.users) {
            let uu = new user.User(u);
            pms.push(uu.reload(model).then((_) => {
              uu = filter(uu);
              if (uu) {
                action(u, uu);
              }
            }));
          }
          return Promise.all(pms);
        };
      }

      /**
       * Checks that a particular view of the user object has a proper type.
       * @param {Function} filt    the filter to set the view of the user object
       * @param {Function} type    the expected type of this struct
       * @return {Function} a function that checks all user types
       */
      function checkType(filt, type) {
        return forEachUsersB(filt, (uid, val) => {
          assert.strictEqual(val.uid, uid);
          assert.strictEqual(val.constructor, type);
        });
      }

      /**
       * Checks whether if there exists a user that fits this filter
       * @param {Function} filt    the filter to set the view of the user object
       * @return {Function} a function that checks existence
       */
      function exists(filt) {
        return async function() {
          pms = loader.users.map(async (u) => {
            u = new user.User(u);
            await u.reload(model);
            u = filt(u);
            if (u) return 1;
            else return 0;
          });
          assert.notEqual(0, (await Promise.all(pms)).reduce(
              (a, b) => a + b, 0));
        };
      }

      /**
       * Checks that a particular view in user has the right properties.
       * @param {Function} it      the context to test from
       * @param {Function} filter  the filter to modify user object
       * @param {Object}   table   the table object to check properties against
       * @param {Array}    should  a list of properties that SHOULD be defined
       * @param {Array}    maybe   a list of properties that maybe is defined
       */
      function checkUserProps(it, filter, table, should, maybe) {
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
          'isEmployee', 'userId'];
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

      describe('Staff', function() {
        const should = [];
        const maybe = ['uid'];
        it('should exist', exists(staffFilt));
        checkUserProps(it, staffFilt, db2.STAFF, should, maybe);
      });

      describe('Employee', function() {
        const should = ['worksAt', 'password'];
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
    const alters = [
      ['Company', 'Shufflebeat', {logo: 'abcde'}],
      ['Employee', 1, {password: 'abcde'}],
      ['HelpTicket', 1, {requestor: 1}],
      ['Project', 1, {advisor: 1}],
      ['Student', 0, {major: 'no nonsense'}],
      ['Team', 39, {leader: 3}],
      ['UTD', 1, {isAdmin: true}],
      ['User', 0, {fname: 'John'}],
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
          const bad = (util.isNumber(uid) ? 1337 : '1337');
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
};

describe('model', async function() {
  const basic = new Database();
  describe('basic', verifyModel.bind(undefined, basic));

  before(require('./danglingTest.js').before);

  // Only allow this for testing
  config.SQLCREDS.multipleStatements = true;
  const sqldb = new sql.SQLDatabase(config.SQLCREDS);
  after(async () => {
    await sqldb.close();
  });
  this.timeout(30000);

  describe('mysql', verifyModel.bind(this, sqldb));
});

describe('dangling promises', require('./danglingTest.js'));

// TODO: test partial updates
