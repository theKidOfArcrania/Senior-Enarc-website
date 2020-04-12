const fs = require('fs');

const tables = [
  ['COMPANY', 'Company', 'name'],
  ['USER', 'User', 'userId'],
  ['EMPLOYEE', 'Employee', 'euid'],
  ['UTD_PERSONNEL', 'UTD', 'uid'],
  ['FACULTY', 'Faculty', 'fuid'],
  ['STUDENT', 'Student', 'suid'],
  ['PROJECT', 'Project', 'projID'],
  ['TEAM', 'Team', 'tid'],
  ['HELP_TICKET', 'HelpTicket', 'hid']];

// Load test data
ents = {};
db = {
  USER: {}, PROJECT: {}, UTD_PERSONNEL: {}, FACULTY: {},
  STUDENT: {}, EMPLOYEE: {}, COMPANY: {}, TEAM: {},
  HELP_TICKET: {},
};


for (const [tbl, _, key] of tables) { // eslint-disable-line no-unused-vars
  ents[tbl] = JSON.parse(fs.readFileSync(`test/data/${tbl}.json`, 'utf8'));
  const t = db[tbl] = new Map();
  for (const ent of ents[tbl]) {
    t.set(ent[key], ent);
  }
}

/**
 * Load the test sample data into a particular db instance
 * @param {Object} dbinst      the DB instance to load into
 */
async function loadIntoDB(dbinst) {
  await dbinst.clear();
  for (const [tbl, name, pkey] of tables) {
    for (const ent of ents[tbl]) {
      await dbinst['insert' + name + 'Info'](ent[pkey], ent);
    }
  }
}

exports.db = db;
exports.users = Array(...db.USER.keys());
exports.loadIntoDB = loadIntoDB;
