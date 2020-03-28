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
 * This verifies that a DB model is correct and valid.
 * @param {Object} model     the database model to test
 */
function verifyModel(model) {
  before(async () => {
    await loader.loadIntoDB(model);
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
          assert.strictEqual(u[prop], table[uid][prop]);
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
  });
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
