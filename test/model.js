const assert = require('assert');
const user = require('../lib/model/user.js');
const dbinst = require('../lib/model/db.js');
const sqldb = require('../lib/model/sqldb.js');

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
 * @param {Object} model     the database model to test
 */
function verifyModel(model) {
  describe('query', function() {
    before(async function() {
      this.timeout(30000);
      await model.beginTransaction();
      await loader.loadIntoDB(model);
    });
    after(async function() {
      await model.rollback();
    });

    beforeEach(() => dbinst.inst = model);

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
            pms.push(uu.reload().then((_) => {
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
          pms = [];
          for (const u of loader.users) {
            let uu = new user.User(u);
            pms.push(uu.reload().then((_) => {
              uu = filt(uu);
              if (uu) return 1;
              else return 0;
            }));
          }
          assert.notEqual(0, (await Promise.all(pms)).reduce((a, b) => a + b));
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
            if (should[prop] instanceof Array) {
              equalsList(u[prop], table[uid][prop]);
            } else {
              assert.strictEqual(u[prop], table[uid][prop]);
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
        const maybe = ['employee', 'utd', 'uid'];
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
        const maybe = ['uid'];
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
          assert.strictEqual(uid, -1);
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
    let hid;
    before(async function() {
      this.timeout(30000);
      await model.beginTransaction();
      await loader.loadIntoDB(model);

      hid = await model.findUniqueID('HelpTicket');
      await model.insertHelpTicketInfo(hid, {
        hStatus: 'Testing',
        hDescription: 'I\'m a dinosaur',
        requestor: 0,
      });
    });

    after(async function() {
      await model.rollback();
    });

    alters = [
      ['Company', 'Shufflebeat', {logo: 'abcde'}],
      ['Employee', 1, {password: 'abcde'}],
      ['Faculty', 1, {tid: 102}],
      ['HelpTicket', hid, {requestor: 1}],
      ['Project', 0, {advisor: 1}],
      ['Student', 0, {advisor: 1}],
      ['Team', 0, {leader: 0}],
      ['UTD', 1, {isAdmin: true}],
      ['User', 0, {fname: 'John'}],
    ];

    for (const [mth, uid, changes] of alters) {
      describe(mth, function() {
        it('can partial update', async function() {
          const init = Object.assign({},
              await model['load' + mth + 'Info'](uid));
          await model['alter' + mth + 'Info'](uid, changes);
          const after = Object.assign({},
              await model['load' + mth + 'Info'](uid));

          Object.assign(init, changes);
          assert.deepStrictEqual(after, init);
        });
        it('should error on invalid ID', async function() {
          try {
            await model['alter' + mth + 'Info'](1337, changes);
          } catch (e) {
            assert.strictEqual(e.constructor, Error);
            assert(e.message.includes('No match'), 'Invalid error message');
          }
        });
      });
    }
  });

  // TODO: insert test cases for properly loading other entities here
};

describe('model', async function() {
  const basic = new dbinst.Database();
  describe('basic', verifyModel.bind(undefined, basic));

  const sqlconn = new sqldb.SQLDatabase({
    //  Change Login Information as required
    host: 'localhost',
    user: 'dbuser',
    password: 'thisisasecurepassword',
    database: 'CSProjectSystem',
    multipleStatements: true, // Only allow this for testing!!
  });
  before(async function() {
    await sqlconn.connect();
  });
  after(() => {
    sqlconn.close();
  });
  this.timeout(30000);
  describe('mysql', verifyModel.bind(this, sqlconn));
});

// TODO: test partial updates
