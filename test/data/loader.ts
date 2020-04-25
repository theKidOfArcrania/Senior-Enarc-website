const assert = require('assert');
const fs = require('fs');
const util = require('../../lib/util.js');

const tables = [
  ['COMPANY', 'Company', 'name'],
  ['USER', 'User', 'userID'],
  ['EMPLOYEE', 'Employee', 'euid'],
  ['UTD_PERSONNEL', 'UTD', 'uid'],
  ['FACULTY', 'Faculty', 'fuid'],
  ['STUDENT', 'Student', 'suid'],
  ['PROJECT', 'Project', 'projID'],
  ['TEAM', 'Team', 'tid'],
  ['HELP_TICKET', 'HelpTicket', 'hid'],
  ['INVITE', 'Invite', 'inviteID']];

const foreignKeys = {
  Student: ['memberOf'],
  Company: ['manager'],
  Team: ['leader'],
};

// Load test data
ents = {};
db = {
  USER: {}, PROJECT: {}, UTD_PERSONNEL: {}, FACULTY: {},
  STUDENT: {}, EMPLOYEE: {}, COMPANY: {}, TEAM: {},
  HELP_TICKET: {}, INVITE: {},
};


for (const [tbl, _, key] of tables) { // eslint-disable-line no-unused-vars
  ents[tbl] = JSON.parse(fs.readFileSync(`test/data/${tbl}.json`, 'utf8'));
  const t = db[tbl] = new Map();
  for (const ent of ents[tbl]) {
    t.set(ent[key], ent);
    if (tbl === 'PROJECT') {
      ent.skillsReq.sort(util.caseInsensOrder);
    } else if (tbl === 'TEAM') {
      if (!ent.choices) ent.choices = [];
      ent.choices = ent.choices.concat(Array(6).fill(null)).slice(0, 6);
    } else if (tbl === 'STUDENT') {
      ent.skills.sort(util.caseInsensOrder);
    } else if (tbl === 'INVITE') {
      ent.expiration = new Date(ent.expiration);
    }
  }
}


/**
 * Load the test sample data into a particular db instance
 * @param {Object} dbinst      the DB instance to load into
 */
async function loadIntoDB(dbinst) {
  alters = {};
  for (const tbl of Object.keys(foreignKeys)) {
    alters[tbl] = [];
  }

  await dbinst.clear();
  for (const [tbl, name, pkey] of tables) {
    for (const ent of ents[tbl]) {
      const ent2 = Object.assign({}, ent);
      if (name in foreignKeys) {
        alt = {};
        for (const fk of foreignKeys[name]) {
          if (ent2[fk] !== null && ent2[fk] !== undefined) alt[fk] = ent2[fk];
          delete ent2[fk];
        }
        if (Object.keys(alt).length) {
          alters[name].push([ent[pkey], alt]);
        }
      }
      assert(await dbinst['insert' + name + 'Info'](ent[pkey], ent2));
    }
  }

  // Add values that depend on previous foreign keys
  for (const name of Object.keys(alters)) {
    for (const [id, set] of alters[name]) {
      assert(await dbinst['alter' + name + 'Info'](id, set));
    }
  }
}

exports.db = db;
exports.users = Array(...db.USER.keys());
exports.loadIntoDB = loadIntoDB;
