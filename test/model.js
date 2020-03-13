const assert = require('assert');
const user = require('../lib/model/user.js');
const fs = require('fs');
const dbinst = require('../lib/model/db.js');

const utypes = user.UTDPersonnel.types;

// Load test data
db = {};
for (const ent of ['COMPANY', 'PROJECT', 'TEAM', 'USER']) {
  db[ent] = JSON.parse(fs.readFileSync(`test/data/${ent}.json`, 'utf8'));
}

// Somewhat normalized USER entity (with some redundancy)
db2 = {
  USER: {}, PROJECT: {}, UTD_PERSONNEL: {}, FACULTY: {},
  STUDENT: {}, EMPLOYEE: {}, COMPANY: {}, FACULTY_OR_TEAM: {}, TEAM: {},
  CHOICE: {}, HELP_TICKET: {},
};

// Normalize USER entity
for (const ent of db.USER) {
  if (ent.isUtd) {
    db2.UTD_PERSONNEL[ent.userId] = ent.utd;
    delete ent.utd['uid'];
    switch (ent.utd.uType) {
      case utypes.STUDENT:
        delete ent.student['suid'];
        db2.STUDENT[ent.userId] = ent.student;
        break;
      case utypes.STAFF:
        break;
      case utypes.FACULTY:
        delete ent.faculty['fuid'];
        db2.FACULTY[ent.userId] = ent.faculty;
        db2.FACULTY_OR_TEAM[ent.faculty.tid] = {
          teamId: ent.faculty.tid,
          isRegTeam: false,
        };
        break;
      default:
        assert.fail('bad uType');
    }
  }

  if (ent.isEmployee) {
    db2.EMPLOYEE[ent.userId] = ent.employee;
  }

  delete ent['utd'];
  delete ent['faculty'];
  delete ent['employee'];
  delete ent['student'];
  db2.USER[ent.userId] = ent;
}

// Set primary key on PROJECT + COMPANY
for (const ent of db.PROJECT) {
  db2.PROJECT[ent.projId] = ent;
}

for (const ent of db.COMPANY) {
  db2.COMPANY[ent.name] = ent;
}

// Normalize TEAM
for (const ent of db.TEAM) {
  db2.TEAM[ent.tid] = ent;
  db2.FACULTY_OR_TEAM[ent.tid] = {
    teamId: ent.tid,
    isRegTeam: true,
  };
}


dbinst.inst = new dbinst.Database(db2);

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
 */
function verifyModel() {
  describe('user', function() {
    // Various filters to see different views of a user
    const utdFilt = filter((uu) => (uu.isUtd && uu.utd));
    const empFilt = filter((uu) => (uu.isEmployee && uu.employee));
    const stuFilt = utdFilt.then((utd) =>
      (utd.uType == utypes.STUDENT && utd.student));
    const facFilt = utdFilt.then((utd) =>
      (utd.uType == utypes.FACULTY && utd.faculty));
    const staffFilt = utdFilt.then((utd) =>
      (utd.uType == utypes.STAFF && utd.staff));

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
        for (const u of db.USER) {
          let uu = new user.User(u.userId);
          pms.push(uu.reload().then((_) => {
            uu = filter(uu);
            if (uu) {
              action(u.userId, uu);
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
        assert.equal(val.uid, uid);
        assert.equal(val.constructor, type);
      });
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
          assert.equal(u[prop], table[uid][prop]);
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
      checkUserProps(it, stuFilt, db2.STUDENT, should, maybe);
    });

    describe('Faculty', function() {
      const should = ['tid'];
      const maybe = ['uid'];
      checkUserProps(it, facFilt, db2.FACULTY, should, maybe);
    });

    describe('Staff', function() {
      const should = [];
      const maybe = ['uid'];
      checkUserProps(it, staffFilt, db2.STAFF, should, maybe);
    });
  });
};

// TODO: also verify that the model works for all other backend db's
describe('model', verifyModel);
