const fs = require('fs');
const user = require('../../lib/model/user.js');
const utypes = user.UTDPersonnel.types;
const bcrypt = require('bcrypt');

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

let nextUid = 0;

// Normalize USER entity
for (const ent of db.USER) {
  ent.userId = nextUid;
  nextUid ++;
  if (ent.isUtd) {
    db2.UTD_PERSONNEL[ent.userId] = ent.utd;
    delete ent.utd['uid'];
    switch (ent.utd.uType) {
      case utypes.STUDENT:
        delete ent.student['suid'];
        db2.STUDENT[ent.userId] = ent.student;
        ent.student.memberOf = ent.student.memberOf.substr(1);
        break;
      case utypes.STAFF:
        break;
      case utypes.FACULTY:
        delete ent.faculty['fuid'];
        const id = parseInt(ent.faculty.tid.substr(1)) + 100;
        db2.FACULTY[ent.userId] = ent.faculty;
        db2.FACULTY_OR_TEAM[id] = {
          teamId: id,
          isRegTeam: false,
        };
        ent.faculty.tid = id;
        break;
      default:
        assert.fail('bad uType');
    }
  }

  if (ent.isEmployee) {
    // Generate bcrypt hash for password
    ent.employee.password = bcrypt.hashSync(ent.employee.password, 5);
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
  const id = ent.tid.substr(1);
  ent.tid = id;
  db2.TEAM[id] = ent;
  db2.FACULTY_OR_TEAM[id] = {
    teamId: id,
    isRegTeam: true,
  };
}

/**
 * Load the test sample data into a particular db instance
 * @param {Object} dbinst      the DB instance to load into
 */
async function loadIntoDB(dbinst) {
  await dbinst.clear();

  for (const t of db.TEAM) {
    await dbinst.insertTeamInfo(t.tid, t);
  }

  for (const u of db.USER) {
    const uid = u.userId;
    await dbinst.insertUserInfo(uid, u);
    if (u.isUtd) {
      const utd = db2.UTD_PERSONNEL[uid];
      await dbinst.insertUTDInfo(uid, utd);
      switch (utd.uType) {
        case utypes.STUDENT:
          await dbinst.insertStudentInfo(uid, db2.STUDENT[uid]);
          break;
        case utypes.STAFF:
          break;
        case utypes.FACULTY:
          await dbinst.insertFacultyInfo(uid, db2.FACULTY[uid]);
          break;
        default:
          assert.fail('bad uType');
      }
    }

    if (u.isEmployee) {
      await dbinst.insertEmployeeInfo(uid, db2.EMPLOYEE[uid]);
    }
  }

  // TODO: insert projects and other stuff
}

exports.db = db2;
exports.users = uids;
exports.loadIntoDB = loadIntoDB;
