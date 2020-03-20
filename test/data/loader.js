const fs = require('fs');
const user = require('../../lib/model/user.js');
const utypes = user.UTDPersonnel.types;

// Load test data
db = {};
for (const ent of ['COMPANY', 'PROJECT', 'TEAM', 'USER']) {
  db[ent] = JSON.parse(fs.readFileSync(`test/data/${ent}.json`, 'utf8'));
}

uids = [];
for (const u of db.USER) {
  uids.push(u.userId);
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

/**
 * Load the test sample data into a particular db instance
 * @param {Object} dbinst      the DB instance to load into
 */
function loadIntoDB(dbinst) {
  dbinst.clear();
  for (const u of db.USER) {
    const uid = u.userId;
    dbinst.insertUserInfo(uid, u);
    if (u.isUtd) {
      const utd = db2.UTD_PERSONNEL[uid];
      dbinst.insertUTDInfo(uid, utd);
      switch (utd.uType) {
        case utypes.STUDENT:
          dbinst.insertStudentInfo(uid, db2.STUDENT[uid]);
          break;
        case utypes.STAFF:
          break;
        case utypes.FACULTY:
          dbinst.insertFacultyInfo(uid, db2.FACULTY[uid]);
          break;
        default:
          assert.fail('bad uType');
      }
    }

    if (u.isEmployee) {
      dbinst.insertEmployeeInfo(uid, db2.EMPLOYEE[uid]);
    }
  }

  // TODO: insert projects and other stuff
}

exports.db = db2;
exports.users = uids;
exports.loadIntoDB = loadIntoDB;