import * as assert from 'assert';
import * as fs from 'fs';
import * as util from '../../lib/util';
import * as tent from '../../lib/model/enttypes';

const insertOrder: tent.Tables[] =
  ['COMPANY', 'USER', 'EMPLOYEE', 'UTD_PERSONNEL', 'FACULTY', 'STUDENT',
    'PROJECT', 'TEAM', 'HELP_TICKET', 'INVITE'];

const foreignKeys = {
  Student: ['memberOf'],
  Company: ['manager'],
  Team: ['leader'],
};

// Load test data
type ArrayElement<T> = T extends (infer Ele)[] ? Ele : T;
type Mapped<T> = {[Tbl in keyof T]?: Map<string|number, ArrayElement<T[Tbl]>>};
const ents: tent.DB = {
  USER: [], PROJECT: [], UTD_PERSONNEL: [], FACULTY: [], STUDENT: [],
  EMPLOYEE: [], COMPANY: [], TEAM: [], HELP_TICKET: [], INVITE: [],
};
export const db: Mapped<tent.DB> = {};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
for (const tbl of insertOrder) {
  const key = tent.getPrimaryKey(tbl);
  ents[tbl] = JSON.parse(fs.readFileSync(`test/data/${tbl}.json`, 'utf8'));
  const t = db[tbl] = new Map();
  for (const ent of ents[tbl]) {
    t.set(ent[key], ent);
    if (tbl === 'PROJECT') {
      (ent as tent.Project).skillsReq.sort(util.caseInsensOrder);
    } else if (tbl === 'TEAM') {
      const t = ent as tent.Team;
      if (!t.choices) t.choices = [];
      t.choices = t.choices.concat(Array(6).fill(null)).slice(0, 6);
    } else if (tbl === 'STUDENT') {
      (ent as tent.Student).skills.sort(util.caseInsensOrder);
    } else if (tbl === 'INVITE') {
      (ent as tent.Invite).expiration =
          new Date((ent as tent.Invite).expiration);
    }
  }
}


/**
 * Load the test sample data into a particular db instance
 * @param dbinst - the DB instance to load into
 */
export default async function loadIntoDB(dbinst): Promise<void> {
  type DeferEnt = [tent.Tables2, {[P: string]: string}];
  const alters: {[P in tent.Tables2]?: DeferEnt[]} = {};
  for (const tbl of Object.keys(foreignKeys)) {
    alters[tbl] = [];
  }

  await dbinst.clear();
  for (const tbl of insertOrder) {
    const name = tent.schemas[tbl].mthname;
    const pkey = tent.getPrimaryKey(tbl);
    if (util.isNull(name)) {
      assert.fail(`Entity ${tbl} does not have a insert function`);
      return;
    }

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
