import * as assert from 'assert';
import * as fs from 'fs';
import * as util from '../../lib/util.js';
import type * as tents from '../../lib/model/enttypes';
import type * as typ from '../../lib/model/dbtypes';

const tables: [keyof tents.DB, typ.Tables2, string][] = [
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
type ArrayElement<T> = T extends (infer Ele)[] ? Ele : T;
type Mapped<T> = {[Tbl in keyof T]?: Map<string|number, ArrayElement<T[Tbl]>>};
const ents: tents.DB = {
  USER: [], PROJECT: [], UTD_PERSONNEL: [], FACULTY: [], STUDENT: [],
  EMPLOYEE: [], COMPANY: [], TEAM: [], HELP_TICKET: [], INVITE: [],
};
export const db: Mapped<tents.DB> = {};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
for (const [tbl, _, key] of tables) {
  ents[tbl] = JSON.parse(fs.readFileSync(`test/data/${tbl}.json`, 'utf8'));
  const t = db[tbl] = new Map();
  for (const ent of ents[tbl]) {
    t.set(ent[key], ent);
    if (tbl === 'PROJECT') {
      (ent as tents.Project).skillsReq.sort(util.caseInsensOrder);
    } else if (tbl === 'TEAM') {
      const t = ent as tents.Team;
      if (!t.choices) t.choices = [];
      t.choices = t.choices.concat(Array(6).fill(null)).slice(0, 6);
    } else if (tbl === 'STUDENT') {
      (ent as tents.Student).skills.sort(util.caseInsensOrder);
    } else if (tbl === 'INVITE') {
      (ent as tents.Invite).expiration =
          new Date((ent as tents.Invite).expiration);
    }
  }
}


/**
 * Load the test sample data into a particular db instance
 * @param dbinst - the DB instance to load into
 */
export default async function loadIntoDB(dbinst): Promise<void> {
  const alters: {[P in typ.Tables2]?: [typ.Tables2, {[P: string]: string}][]} =
    {};
  for (const tbl of Object.keys(foreignKeys)) {
    alters[tbl] = [];
  }

  await dbinst.clear();
  for (const [tbl, name, pkey] of tables) {
    for (const ent of ents[tbl]) {
      const ent2 = Object.assign({}, ent);
      if (name in foreignKeys) {
        const alt = {};
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

export const users = [...db.USER.keys()];
