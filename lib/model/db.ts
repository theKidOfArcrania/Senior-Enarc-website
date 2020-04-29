import {copyAttribs, range, Reentrant, deepJSONCopy, Some, isNullOrUndefined}
  from '../util';

import * as typ from './dbtypes';
import * as ent from './enttypes';

// Simulating foreign keys
const foreignKeys: { [P: string]: [string, string, null|boolean][]} = {
  PROJECT: [
    ['TEAM', 'assignedProj', null],
    ['CHOICE', 'pid', null],
  ],
  USER: [
    ['EMPLOYEE', 'euid', true],
    ['UTD_PERSONNEL', 'uid', true],
    ['HELP_TICKET', 'requestor', null],
  ],
  UTD_PERSONNEL: [
    ['FACULTY', 'fuid', true],
    ['STUDENT', 'suid', true],
  ],
  STUDENT: [
    ['TEAM', 'leader', null],
  ],
  FACULTY_OR_TEAM: [
    ['FACULTY', 'tid', true],
    ['TEAM', 'tid', true],
    ['CHOICE', 'tid', true],
  ],
  FACULTY: [
    ['PROJECT', 'advisor', null],
  ],
  EMPLOYEE: [
    ['PROJECT', 'mentor', null],
    ['PROJECT', 'sponsor', null],
    ['COMPANY', 'manager', null],
  ],
  COMPANY: [
    ['EMPLOYEE', 'worksAt', false],
    ['PROJECT', 'company', true],
  ],
  TEAM: [
    ['STUDENT', 'memberOf', null],
  ],
};

const foreignKeysR = {};
for (const [tblPri, fkeys] of Object.entries(foreignKeys)) {
  for (const [tblFgn, fkey, dmode] of fkeys) {
    if (!(tblFgn in foreignKeysR)) foreignKeysR[tblFgn] = [];
    foreignKeysR[tblFgn].push([fkey, tblPri, dmode]);
  }
}

type OurTables = keyof ent.DB | 'CHOICE' | 'FACULTY_OR_TEAM';

type DBTable = {[P: string]: any};
type MemDB = {[P in OurTables]: DBTable};

type Savepoints = [string, MemDB][] & {names: {[P: string]: number}};

/**
 * This represents a memory based transaction object, the actual DB instance is
 * just the inmemory representation.
 */
class MemDBTrans extends typ.DatabaseTransaction<MemDB> {
  private _sps: Savepoints;

  /**
   * Initializes a new database transaction, this is called internally by the
   * database instance object.
   *
   * @param  dbinst - the database that created this transaction.
   * @param  db - the current database state
   */
  constructor(dbinst: typ.Database<MemDB>, db: MemDB) {
    super(dbinst, db);
    this._sps = [] as Savepoints;
    this._sps.names = {};
  }

  /**
   * Does the actual commiting
   */
  async _commit(): Promise<void> {
    const dbinst = this._dbinst as MemDatabase;
    dbinst._db = this._db;
    await dbinst._lock.unlock();
  }

  /**
   * Does the actual rollback
   */
  async _rollback(): Promise<void> {
    await (this._dbinst as MemDatabase)._lock.unlock();
  }

  /**
   * Actually makes a savepoint.
   * @param spname - the savepoint name to save under.
   */
  async _saveSP(spname: string): Promise<void> {
    this._sps.names[spname] = this._sps.length;
    this._sps.push([spname, deepJSONCopy(this._db)]);
  }

  /**
   * Restores a savepoint from a provided name. Should be overriden by a
   * subclass. This may cause an error if the specific savepoint name does not
   * exist.
   * @param spname - the savepoint to restore from.
   */
  async _restoreSP(spname: string): Promise<void> {
    if (!(spname in this._sps.names)) {
      throw new typ.DBError('Not a valid savepoint');
    }

    // Restore our db to that savepoint
    const start = this._sps.names[spname];
    this._db = this._sps[start][1];

    // Remove all later savepoints
    const names = this._sps.names;
    for (const ind of range(start, this._sps.length)) {
      const name = this._sps[ind][0];
      if (names[name] === ind) delete names[name];
    }
    this._sps = this._sps.slice(0, start) as Savepoints;
    this._sps.names = names;
  }

  /**
   * Releases a savepoint from a provided name, without restoring the database.
   * Should be overriden by a subclass.  This may cause an error if the specific
   * savepoint name does not exist.
   * @param spname - the savepoint to restore from.
   */
  async _releaseSP(spname: string): Promise<void> {
    if (!(spname in this._sps.names)) {
      throw new typ.DBError('Not a valid savepoint');
    }
    delete this._sps.names[spname];
  }

  /* ************************************
   * BULK OPERATIONS
   * ************************************/

  /**
   * Sets all accepted projects to archived
   */
  async archiveAllProjects(): Promise<void> {
    await this.checkValid();
    for (const proj of Object.values(this._db.PROJECT)) {
      if (proj.status === 'accepted') {
        proj.status = 'archived';
      }
    }
  }

  /**
   * Clears the database
   */
  async clear(): Promise<void> {
    await this.checkValid();
    this._db = {} as MemDB;
    for (const key of Object.keys(ent.schemas)) {
      this._db[key] = {};
    }
  }

  /** Fast method for deleting all student users. */
  async deleteAllStudents(): Promise<void> {
    await this.checkValid();
    await this.pushSP();
    try {
      for (const id of Object.keys(this._db.STUDENT)) {
        await this.deleteUser(parseInt(id));
      }
    } catch (e) {
      await this.popSP();
      throw e;
    }
    await this.releaseSP();
  }

  /* ************************************
   * FIND ALL ENTITIES
   * ************************************/

  /**
   * Finds all the entities in the database of a specific type
   * @param entity - the name of the entity
   */
  async _findAllEntities(entity): Promise<string[]> {
    let ret = Object.keys(this._db[entity]);
    if (entity === 'INVITE') {
      ret = ret.filter((k) =>
        new Date(this._db.INVITE[k].expiration).valueOf() >= Date.now());
    }
    return ret;
  }

  /* ************************************
   * FIND AGGREGATES
   * ************************************/

  /**
   * Finds all the employees that reside at a company
   * @param company - the company to search from
   * @returns a list of user IDs
   */
  async findEmployeesAt(company: string): Promise<number[]> {
    const ret: number[] = [];
    for (const emp of Object.values(this._db.EMPLOYEE)) {
      if (emp.worksAt === company) ret.push(emp.euid);
    }
    return ret;
  }

  /**
   * Searches for the user ID's of all students that are on this team
   * @param teamId - the team ID to search on
   */
  async findMembersOfTeam(teamId): Promise<number[]> {
    await this.checkValid();
    const uids: number[] = [];
    for (const stuId in this._db.STUDENT) {
      if (this._db.STUDENT[stuId].memberOf === teamId) {
        uids.push(parseInt(stuId));
      }
    }
    return uids;
  }

  /**
   * Finds all the projects that a particular user mentors/sponsors/advises.
   * @param uid - the user ID to search on
   */
  async findManagesProject(uid): Promise<number[]> {
    await this.checkValid();
    const pids: number[] = [];
    for (const projId of Object.keys(this._db.PROJECT)) {
      if (this._db.PROJECT[projId].mentor === uid ||
          this._db.PROJECT[projId].sponsor === uid ||
          this._db.PROJECT[projId].advisor === uid) {
        pids.push(parseInt(projId));
      }
    }
    return pids;
  }

  /**
   * Finds all the projects a team has ranked
   * @param tid - the team ID to search on
   */
  async findTeamChoices(tid): Promise<number[]> {
    await this.checkValid();
    const choice: number[] = [];
    if (!(tid in this._db.CHOICE)) return [];
    for (const rank of range(6)) {
      choice[rank] = this._db.CHOICE[tid][rank];
    }
    return choice;
  }

  /**
   * Gets all the skills of a student.
   * @param suid - the student ID
   */
  async getSkills(suid: number): Promise<string[]> {
    if (!(suid in this._db.STUDENT)) return [];
    return this._db.STUDENT[suid].skills || [];
  }

  /**
   * Gets the skill requisites of a project.
   * @param pid - the project ID
   */
  async getSkillsReq(pid: number): Promise<string[]> {
    if (!(pid in this._db.PROJECT)) return [];
    return this._db.PROJECT[pid].skillsReq || [];
  }

  /* ************************************
   * FIND OR SEARCHES
   * ************************************/

  /**
   * Finds the team assigned to the project, if it exists.
   * @param pid - the project ID
   */
  async findProjectAssignedTeam(pid): Promise<Some<number>> {
    await this.checkValid();
    for (const tid of Object.keys(this._db.TEAM)) {
      if (this._db.TEAM[tid].assignedProj === pid) {
        return parseInt(tid);
      }
    }
    return null;
  }

  /**
   * Search a user by an email, returns the respective user ID.
   * @param email - the email to search on
   */
  async searchUserByEmail(email): Promise<Some<number>> {
    await this.checkValid();
    for (const uid of Object.keys(this._db.USER)) {
      const nuid = parseInt(uid);
      if (this._db.USER[nuid].email === email) {
        return nuid;
      }
    }
    return null;
  }

  /**
   * Searches a team by its common name, returning the respective team ID.
   * @param name - the name of the team.
   */
  async searchTeamByName(name): Promise<Some<number>> {
    await this.checkValid();
    for (const tid of Object.keys(this._db.TEAM)) {
      const ntid = parseInt(tid);
      if (this._db.TEAM[ntid].name === name) {
        return ntid;
      }
    }
    return null;
  }

  /**
   * Adds some skills to the student. This does not complain if it a
   * particular skill is already added, it will just quietly ignore repeated
   * skills.
   * @param suid - the student user id
   * @param skills - some vararg list of skills to add
   */
  async addSkills(suid, ...skills): Promise<void> {
    await this.checkValid();
    const stu = this._db.STUDENT[suid];
    if (!stu.skills) stu.skills = [];
    for (const s of skills) {
      if (!stu.skills.includes(s)) stu.skills.push(s);
    }
  }

  /**
   * Adds some required skills to a project. This does not complain if it a
   * particular skill is already added, it will just quietly ignore repeated
   * skills.
   * @param pid - the project id
   * @param skills - some vararg list of skills to add
   */
  async addSkillsReq(pid, ...skills): Promise<void> {
    await this.checkValid();
    const p = this._db.PROJECT[pid];
    if (!p.skillsReq) p.skillsReq = [];
    for (const s of skills) {
      if (!p.skillsReq.includes(s)) p.skillsReq.push(s);
    }
  }

  /**
   * Replaces a set of choices for a particular team (or faculty). This will
   * quietly overwrite over the team's previous choices.
   *
   * @param tid - the team id to search for
   * @param choices - the new set of choices for a team.
   */
  async setChoices(tid, choices): Promise<void> {
    await this.checkValid();
    if (!this._db.CHOICE[tid]) this._db.CHOICE[tid] = [];
    const ch = this._db.CHOICE[tid];
    choices.slice(0, 6).map((pid, i) => ch[i] = pid);
  }

  // ################# DELETE #######################
  /**
   * Generic delete entity. This should be overriden by subclasses. If id is
   * NULL then that will delete EVERY SINGLE entity. (This should be used with
   * caution).
   *
   * This will return true if something is deleted.
   *
   * @param tableName - the table entity name
   * @param id - the id
   */
  async _deleteEntity(tableName, id): Promise<boolean> {
    if (id === null) {
      await this.pushSP();
      try {
        for (const id2 of Object.keys(this._db[tableName])) {
          let id3: ent.ID = id2;
          if (tableName !== 'COMPANY') id3 = parseInt(id2);
          await this._deleteEntity(tableName, id3);
        }
      } catch (e) {
        await this.popSP();
        throw e;
      }
      await this.releaseSP();
      return true;
    }

    if (id in this._db[tableName]) {
      await this.pushSP();
      const old = this._db[tableName][id];
      delete this._db[tableName][id];

      // Emulate cascade deletes, since the mysql version will do that
      const fkeys = foreignKeys[tableName] || [];
      try {
        for (const [tbl, fkey, dmode] of fkeys) {
          for (const [kk, v] of Object.entries(this._db[tbl])) {
            let k: ent.ID = kk;
            if (tbl !== 'COMPANY') k = parseInt(kk);
            if (v[fkey] === id) {
              if (dmode === null) { // ON DELETE SET NULL
                v[fkey] = null;
              } else if (dmode === true) { // ON DELETE CASCADE
                await this._deleteEntity(tbl, k);
              } else { // ERROR
                throw new typ.DBError('Foreign key constraint failure on ' +
                  `\`${tbl}\`.\`${fkey}\``);
              }
            } else {
              if (v[fkey] == id) throw new Error(JSON.stringify([v[fkey], id]));
            }
          }
        }

        // Other triggers
        if (tableName === 'FACULTY') {
          await this._deleteEntity('FACULTY_OR_TEAM', old.tid);
        }
      } catch (e) {
        await this.popSP();
        throw e;
      }
      await this.releaseSP();
      return true;
    } else {
      return false;
    }
  }

  // ################# INSERT #######################
  /**
   * Generic insert entity. This should be overriden by subclasses, returns true
   * if the insert is successful
   *
   * @param tableName - the table entity name
   * @param id - the id
   * @param info - the attributes of the entity
   */
  async _insertEntity(tableName: ent.Tables, id, info): Promise<boolean> {
    info = copyAttribs({}, info, ent.getFields(tableName,
        ent.FieldType.REGULAR));
    info[ent.getPrimaryKey(tableName)] = id;
    if (id in this._db[tableName]) {
      return false;
    } else {
      const fkeys = foreignKeysR[tableName] || [];
      for (const [fkey, tblPri, _] of fkeys) { // eslint-disable-line
        if (isNullOrUndefined(info[fkey])) continue;
        if (!(info[fkey] in this._db[tblPri])) {
          throw new typ.DBError('Foreign key constraint error on ' +
            `\`${tableName}\`.\`${fkey}\``);
        }
      }
      this._db[tableName][id] = info;
      return true;
    }
  }

  // ############# LOAD ENTITIES ################
  /**
   * Generic load entity from table name.
   * @param id - of the entity
   * @param tblname - table name
   * @param errmsg - error message to throw if entry not found
   */
  async _loadEntity(id, tblname): Promise<Some<typ.Entity>> {
    const tbl = this._db[tblname];
    if (id in tbl) {
      const ret = Object.assign({}, tbl[id]);
      if (tblname === 'INVITE') ret.expiration = new Date(ret.expiration);
      return ret;
    } else {
      return null;
    }
  }

  // ############# ALTER ENTITIES ################

  /**
   * Alters entity information associated with ID given a changes to be filtered
   * with a given whitelist and given the entity's name and the name of its ID
   * If successful, this will return true
   *
   * @param entity - name of the entity being modified
   * @param ID - value of ID being search for
   * @param changes - key/value pairs of attributes and new values
   */
  async _alterEntity(entity, ID, changes):
      Promise<boolean> {
    const acceptedChanges = {};
    let hasChanges = false;
    for (const key of ent.getFields(entity, ent.FieldType.REGULAR)) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
        hasChanges = true;
      }
    }
    if (!hasChanges) return false;
    if (!this._db[entity][ID]) return false;
    Object.assign(this._db[entity][ID], acceptedChanges);
    return true;
  }
}

/**
 * This represents a memory-based database
 */
export default class MemDatabase extends typ.Database<MemDB> {
  _lock: Reentrant;
  _db: MemDB;

  /**
   * Initializes a new database instance
   */
  constructor() {
    super();

    this._lock = new Reentrant();
    this._db = {} as MemDB;
    for (const key of Object.keys(ent.schemas)) {
      this._db[key] = {};
    }
  }

  /**
   * Begins an atomic transaction, returning a transaction object, should be
   * overriden by a subclass.
   *
   * @param timeout - the timeout in milliseconds
   */
  async beginTransaction(timeout = 1000): Promise<MemDBTrans> {
    if (!(await this._lock.tryLock(timeout))) {
      throw new typ.DBError('Timeout exceeded');
    }
    return new MemDBTrans(this, deepJSONCopy(this._db));
  }

  /**
   * Closes all transactions/connections
   */
  close(): Promise<void> {
    return Promise.resolve(undefined);
  }
}

let inst: typ.Database<any> = null;
export const getInst = (): typ.Database<any> => inst;
export const setInst = (i: typ.Database<any>): void => (inst = i, undefined);
export const DBError = typ.DBError;

