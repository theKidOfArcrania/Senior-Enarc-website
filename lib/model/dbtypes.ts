import * as crypto from 'crypto';
import {promisify, Some, isNull} from '../util';
import type * as ent from './enttypes';

export type Tables = 'USER' | 'PROJECT' | 'UTD_PERSONNEL' | 'FACULTY' |
  'STUDENT' | 'EMPLOYEE' | 'COMPANY' | 'FACULTY_OR_TEAM' | 'TEAM' | 'CHOICE' |
  'HELP_TICKET' | 'INVITE';

export type Tables2 = 'User' | 'Project' | 'UTD' | 'Faculty' | 'Student' |
  'Employee' | 'Company' | 'FacultyOrTeam' | 'Team' | 'Choice' | 'HelpTicket' |
  'Invite';

export type Entity = {[P: string]: any};

/**
 * Represents an error during some database transaction
 */
export class DBError extends Error {
  dberror: boolean;

  /**
   * Creates a new error
   * @param msg - the message
   */
  constructor(msg: string) {
    super(msg);
    this.dberror = true;
  }
}

/**
 * This is the abstract superclass of a database instance. In order to make
 * queries you must first create a separate connection, and when you are done
 * commit back to this master database. This represents a in-memory database of
 * all the entities. This should be overwritten for other database backends.
 */
export abstract class Database<DB> {
  /**
   * Begin an atomic transaction, returning a Database transaction object that
   * can be used to query/modify data. This will guarantee ACID compliance (i.e.
   * this will not allow any concurrent modifications/views to the affected
   * table(s), that may result in undefined behavior until the transaction has
   * been issued a commit()/rollback().
   *
   * This should be overriden by a subclass.
   *
   * There is also a timeout used to cap the amount of initial waiting time
   * (depending on the particular implementation, the beginTransaction may wait
   * for until all other transactions are completed).
   *
   * To nest transactions within a transaction, the database transaction object
   * allows savepoints to be used, and an abstraction on top of that (pushSP and
   * popSP).
   *
   * @param timeout - a timeout in milliseconds, denotes the time to wait for a
   *                  transaction to begin. A negative value results in waiting
   *                  indefinitely
   */
  abstract async beginTransaction(timeout?: number):
      Promise<DatabaseTransaction<DB>>;

  /**
   * Closes all transactions/connections
   */
  abstract close(): void;

  /**
   * Executes a transaction carried out by some function. This function should
   * return a truey/falsy value for whether if the action was successful or
   * not. This function will then return that value.
   *
   * If an error is thrown, that will be thrown instead. In the case of a falsy
   * or error thrown, this function will automatically rollback the entire
   * transaction. Otherwise, it will commit it. You should treat this as the
   * same as beginTransaction, i.e. do NOT call this within a nested
   * beginTrasaction, use doNestedTransaction for that.
   *
   * @param fn - the function (possibly async) that will return
   *             a value determining its success.
   * @param timeout - a timeout in milliseconds, see beginTransaction
   * @param args - a vararg list of args to pass to the function, before the
   *               transaction object.
   */
  async doTransaction<Args extends any[], Ret>(
      fn: (tr: DatabaseTransaction<DB>, ...fnargs: Args) => Ret,
      timeout = 1000,
      ...args: Args): Promise<Ret> {
    const tr = await this.beginTransaction(timeout);
    try {
      const retval = await fn(tr, ...args);
      if (retval) {
        await tr.commit();
      } else {
        await tr.rollback();
      }
      return retval;
    } catch (e) {
      try {
        await tr.rollback();
      } catch (ee) {
        e.suppressed = ee;
      }
      throw e;
    }
  }

  /**
   * Executes a read-only transaction carried out by some function. This
   * function can return any value, but this will never commit any changes made
   * by this function, i.e. always abort.
   *
   * @param fn - the function (possibly async) that will return a value
   *             determining its success.
   * @param timeout - a timeout in milliseconds, see beginTransaction
   * @param args - a vararg list of args to pass to the function,
   *                             before the transaction object.
   */
  async doRTransaction<Args extends any[], Ret>(
      fn: (tr: DatabaseTransaction<DB>, ...fnargs: Args) => Ret,
      timeout = 1000,
      ...args: Args): Promise<Ret> {
    let ret: Ret;
    await this.doTransaction(async (tr, ...args: Args) => {
      ret = await fn(tr, ...args);
      return false;
    }, timeout, ...args);
    return ret;
  }
}

/**
 * This is the abstract superclass of a database transaction instance. This
 * represents a single atomic transaction (and won't be committed until the
 * commit is called. After that point any other calls to modify this DB is
 * useless.
 *
 * These transaction are atomic to each other despite the single threading model
 * of javascript since each transaction creates a new thread.
 */
export abstract class DatabaseTransaction<DB> {
  protected _cursp: number;
  protected _dbinst: Database<DB>;
  protected _db: DB;

  /**
   * Initializes a new database transaction, this is called internally by the
   * database instance object.
   *
   * @param  dbinst - the database that created this transaction.
   * @param  db - the database state representing the current state of this
   *              transaction. In the most basic case this contains the actual
   *              db information, but may as well represent the current state.
   */
  constructor(dbinst: Database<DB>, db: DB) {
    this._cursp = 0;
    this._dbinst = dbinst;
    this._db = db;
  }

  /**
   * Checks whether if this transaction is still a valid transaction. If this
   * has already been aborted/commited, this will throw an error. This should
   * ALWAYS be called for all public facing functions that change the database
   * in any way.
   */
  async checkValid(): Promise<void> {
    await promisify(setImmediate)();
    if (this._dbinst === undefined) {
      throw new Error('Already commited or aborted');
    }
  }

  /* ************************************
   * TRANSACTIONS
   * ************************************/

  /**
   * Commits all changes. This will render the transaction invalid if
   * successful.
   */
  async commit(): Promise<void> {
    await this.checkValid();
    this._cursp = undefined;

    await this._commit();
    await this._destroy();
  }

  /**
   * Rolls back all changes made within the transaction. Any savepoints made
   * during this transaction are discarded. Any further querys/updates to this
   * DB will be refused.
   */
  async rollback(): Promise<void> {
    await this.checkValid();
    await this._rollback();
    await this._destroy();
  }

  /** Does the actual commit */
  abstract async _commit();
  /** Does the actual rollback */
  abstract async _rollback();

  /**
   * Destroys this database transaction
   */
  async _destroy(): Promise<void> {
    this._dbinst = undefined;
    this._db = undefined;
  }

  /**
   * Executes a nested transaction carried out by some function. This function
   * should return a truey/falsy value for whether if the action was successful
   * or not. This function will then return that value.
   *
   * If an error is thrown, that will be thrown instead. In the case of a falsy
   * or error thrown, this function will automatically rollback the entire
   * transaction. Otherwise, it will commit it.
   *
   * This should be treated like a pushSP/popSP pair. You should use this ONLY
   * as a nested transaction, i.e. this will error out if you attempt to use
   * this as a top level transaction.
   *
   * @param  fn - the function (possibly async) that will return a value
   *              determining its success.
   * @param  args - a vararg list of args to pass to the function.
   */
  async doNestedTransaction<Args extends any[], Ret>(
      fn: (...fnargs: Args) => Ret,
      ...args: Args): Promise<Ret> {
    await this.checkValid();
    const cursp = this._cursp;
    const sp = await this.pushSP();
    try {
      const retval = await fn(...args);
      if (retval) {
        await this._releaseSP(sp);
      } else {
        await this._restoreSP(sp);
      }
      return retval;
    } catch (e) {
      try {
        await this._restoreSP(sp);
      } catch (ee) {
        e.suppressed = ee;
      }
      throw e;
    } finally {
      this._cursp = cursp;
    }
  }

  /**
   * Pushes a new save point onto our stack. This is an abstraction to the
   * low-level savepoint function call. This serves as a nested transaction
   */
  async pushSP(): Promise<string> {
    await this.checkValid();
    await this._saveSP('sp' + this._cursp++);
    return 'sp' + (this._cursp - 1);
  }

  /**
   * An alias to releaseSP
   */
  async popSP(): Promise<void> {
    await this.releaseSP();
  }

  /**
   * Releases the current save point without restoring it. This serves as a
   * nested transaction commit.
   */
  async releaseSP(): Promise<void> {
    await this.checkValid();
    await this._releaseSP('sp' + --this._cursp);
  }

  /**
   * Restores the current save point. This serves as a nested transaction
   * rollback.
   */
  async restoreSP(): Promise<void> {
    await this.checkValid();
    await this._restoreSP('sp' + --this._cursp);
  }

  /**
   * Actually makes a savepoint. Should be overriden by a subclass. If a
   * savepoint already exists with that name, _savepoint will quietly overwrite
   * it
   *
   * @param spname - the savepoint name to save under.
   */
  abstract async _saveSP(spname: string): Promise<void>;

  /**
   * Restores a savepoint from a provided name. Should be overriden by a
   * subclass. This may cause an error if the specific savepoint name does not
   * exist.
   * @param spname - the savepoint to restore from.
   */
  abstract async _restoreSP(spname: string): Promise<void>;


  /**
   * Releases a savepoint from a provided name, without restoring the database.
   * Should be overriden by a subclass.  This may cause an error if the specific
   * savepoint name does not exist.
   * @param spname - the savepoint to restore from.
   */
  abstract async _releaseSP(spname: string): Promise<void>;

  /* ************************************
   * BULK OPERATIONS
   * ************************************/

  /** Clears the database */
  abstract async clear(): Promise<void>;

  /** Sets all accepted projects to archived */
  abstract async archiveAllProjects(): Promise<void>;

  /** Fast method for deleting all student users. */
  async deleteAllStudents(): Promise<void> {
    for (const id of await this.findAllStudents()) {
      await this.deleteStudent(id);
    }
  }

  /* ************************************
   * FIND ALL ENTITIES
   * ************************************/

  /**
   * Finds all the entities in the database of a specific type
   * @param entity - the name of the entity
   */
  abstract async _findAllEntities(entity: Tables): Promise<string[]>;

  /**
   * Finds all the project IDs that exist in the database.
   */
  async findAllProjects(): Promise<number[]> {
    await this.checkValid();
    return (await this._findAllEntities('PROJECT')).map((v) => parseInt(v));
  }

  /**
   * Finds all the team IDs that exist in the database.
   */
  async findAllTeams(): Promise<number[]> {
    await this.checkValid();
    return (await this._findAllEntities('TEAM')).map((v) => parseInt(v));
  }

  /**
   * Finds all the listed companies in the database. Note the spelling error is
   * intentional (so that way it is easier to call this function in admin).
   */
  async findAllCompanys(): Promise<string[]> {
    await this.checkValid();
    return (await this._findAllEntities('COMPANY'));
  }

  /**
   * Finds all the help ticket IDs in the database
   */
  async findAllHelpTickets(): Promise<number[]> {
    await this.checkValid();
    return (await this._findAllEntities('HELP_TICKET')).map((v) => parseInt(v));
  }

  /**
   * Finds all the existing (non-expired) invite IDs in the database
   */
  async findAllInvites(): Promise<number[]> {
    await this.checkValid();
    return (await this._findAllEntities('INVITE')).map((v) => parseInt(v));
  }

  /**
   * Finds all the users in the database
   */
  async findAllUsers(): Promise<number[]> {
    await this.checkValid();
    return (await this._findAllEntities('USER')).map((v) => parseInt(v));
  }

  /**
   * Finds all the employees in the database
   */
  async findAllEmployees(): Promise<number[]> {
    await this.checkValid();
    return (await this._findAllEntities('EMPLOYEE')).map((v) => parseInt(v));
  }

  /**
   * Finds all the UTD personnels in the database
   */
  async findAllUTDs(): Promise<number[]> {
    await this.checkValid();
    return (await this._findAllEntities('UTD_PERSONNEL'))
        .map((v) => parseInt(v));
  }

  /**
   * Finds all the students in the database
   */
  async findAllStudents(): Promise<number[]> {
    await this.checkValid();
    return (await this._findAllEntities('STUDENT')).map((v) => parseInt(v));
  }

  /**
   * Finds all the faculty members in the database
   */
  async findAllFacultys(): Promise<number[]> {
    await this.checkValid();
    return (await this._findAllEntities('FACULTY')).map((v) => parseInt(v));
  }

  /* ************************************
   * FIND AGGREGATES
   * ************************************/

  /**
   * Searches for the user ID's of all students that are on this team
   * @param teamId - the team ID to search on
   */
  abstract async findMembersOfTeam(teamId: number): Promise<number[]>;

  /**
   * Finds all the projects that a particular user mentors/sponsors/advises.
   * @param uid - the user ID to search on
   */
  abstract async findManagesProject(uid: number): Promise<number[]>;

  /**
   * Finds all the projects a team has ranked
   * @param tid - the team ID to search on
   */
  abstract async findTeamChoices(tid: number): Promise<number[]>;

  /**
   * Gets all the skills of a student.
   * @param suid - the student ID
   */
  abstract async getSkills(suid: number): Promise<string[]>;

  /**
   * Gets the skill requisites of a project.
   * @param pid - the project ID
   */
  abstract async getSkillsReq(pid: number): Promise<string[]>;

  /* ************************************
   * FIND OR SEARCHES
   * ************************************/

  /**
   * Finds the team assigned to the project, if it exists.
   * @param pid - the project ID
   */
  abstract async findProjectAssignedTeam(pid: number): Promise<Some<number>>;

  /**
   * Search a user by an email, returns the respective user ID.
   * @param email - the email to search on
   */
  abstract async searchUserByEmail(email: string): Promise<Some<number>>;
  /**
   * Searches a team by its common name, returning the respective team ID.
   * @param name - the name of the team.
   */
  abstract async searchTeamByName(name): Promise<Some<number>>;

  /**
   * Attempts to generate a unique ID for a specific table by checking if the ID
   * exists in the table before hand. Note that this function does not guarentee
   * atomicity. This should be wrapped inside a beginTransaction block!
   *
   * @param table -  the name of the table to find a unique ID.
   */
  async findUniqueID(table): Promise<number> {
    await this.checkValid();
    if (typeof this['load' + table + 'Info'] !== 'function') {
      throw new DBError('Not a valid table name!');
    }

    for (;;) {
      const id = crypto.randomBytes(4).readInt32LE();
      if (id <= 0) continue;

      try {
        await this['load' + table + 'Info'](id);
      } catch (e) {
        if (!e.dberror) throw e;
        return id;
      }
    }
  }

  /* ************************************
   * MODIFY AGGREGATE
   * ************************************/
  // TODO: remove skills

  /**
   * Adds some skills to the student. This does not complain if it a
   * particular skill is already added, it will just quietly ignore repeated
   * skills.
   * @param suid - the student user id
   * @param skills - some vararg list of skills to add
   */
  abstract async addSkills(suid: number, ...skills: string[]): Promise<void>;

  /**
   * Adds some required skills to a project. This does not complain if it a
   * particular skill is already added, it will just quietly ignore repeated
   * skills.
   * @param pid - the project id
   * @param skills - some vararg list of skills to add
   */
  abstract async addSkillsReq(pid: number, ...skills: string[]): Promise<void>;

  /**
   * Replaces a set of choices for a particular team (or faculty). This will
   * quietly overwrite over the team's previous choices.
   *
   * @param tid - the team id to search for
   * @param choices - the new set of choices for a team.
   */
  abstract async setChoices(tid: number, choices: number[]): Promise<void>;

  /* ************************************
   * DELETE
   * ************************************/

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
  abstract async _deleteEntity(tableName: Tables, id: Some<number|string>):
      Promise<boolean>;

  /**
   * Delete Project
   * @param projID - the projID to delete.
   */
  async deleteProject(projID: number): Promise<boolean> {
    await this.checkValid();
    return this._deleteEntity('PROJECT', projID);
  }

  /**
   * Delete a user from database.
   * @param uid - the user id to delete.
   */
  async deleteUser(uid: number): Promise<boolean> {
    await this.checkValid();
    return this._deleteEntity('USER', uid);
  }

  /**
   * Delete a UTD personnel from database.
   * @param uid - the user id to delete.
   */
  async deleteUTD(uid: number): Promise<boolean> {
    await this.checkValid();
    return this._deleteEntity('UTD_PERSONNEL', uid);
  }

  /**
   * Delete a student from the database.
   * @param uid - the user id to delete
   */
  async deleteStudent(uid: number): Promise<boolean> {
    await this.checkValid();
    return this._deleteEntity('STUDENT', uid);
  }

  /**
   * Delete a faculty into the database.
   * @param uid - the user id to delete.
   */
  async deleteFaculty(uid: number): Promise<boolean> {
    await this.checkValid();

    // This will cascade delete into faculty! This will also initialize a
    // trigger that will delete FACULTY_OR_TEAM entry
    return this._deleteEntity('FACULTY', uid);
  }

  /**
   * Delete a employee from the database.
   * @param uid - the user id to delete
   */
  async deleteEmployee(uid: number): Promise<boolean> {
    await this.checkValid();
    return this._deleteEntity('EMPLOYEE', uid);
  }

  /**
   * Delete team from the database
   * @param tid - the team id to delete
   */
  async deleteTeam(tid: number): Promise<boolean> {
    await this.checkValid();
    return this._deleteEntity('FACULTY_OR_TEAM', tid);
  }

  /**
   * Deletes a company
   * @param cName - the company name
   */
  async deleteCompany(cName: string): Promise<boolean> {
    await this.checkValid();
    return this._deleteEntity('COMPANY', cName);
  }

  /**
   * Deletes a help ticket
   * @param hid - the help ticket id
   */
  async deleteHelpTicket(hid: number): Promise<boolean> {
    await this.checkValid();
    return this._deleteEntity('HELP_TICKET', hid);
  }

  /**
   * Delets an invite information
   * @param inviteID - the invite id
   */
  async deleteInvite(inviteID: number): Promise<boolean> {
    await this.checkValid();
    return this._deleteEntity('INVITE', inviteID);
  }

  /* ************************************
   * INSERT
   * ************************************/

  /**
   * Generic insert entity. This should be overriden by subclasses, returns true
   * if the insert is successful
   *
   * @param tableName - the table entity name
   * @param attribs - a key-value dict of attributes and default vals.
   * @param pkey - the name of the primary key
   * @param id - the id
   * @param info - the attributes of the entity
   */
  abstract async _insertEntity(tableName: Tables, attribs: object,
      pkey: string, id: string|number, info: object): Promise<boolean>;

  /**
   * Inserts Project
   * @param projID - the projID to insert at.
   * @param projInfo - the attributes of the project
   */
  async insertProjectInfo(projID, projInfo): Promise<boolean> {
    await this.checkValid();
    if (!(await this._insertEntity('PROJECT', {pName: null, image: null,
      pDesc: null, mentor: null, sponsor: null, advisor: null, status: null,
      visible: null, projDoc: null, company: null}, 'projID', projID,
    projInfo))) return false;
    if (projInfo.skillsReq && projInfo.skillsReq.length) {
      await this.addSkillsReq(projID, ...projInfo.skillsReq);
    }
    return true;
  }

  /**
   * Insert a user into the database.
   * @param uid - the user id to insert at.
   * @param userinfo - the attributes of the user
   */
  async insertUserInfo(uid, userinfo): Promise<boolean> {
    await this.checkValid();
    return this._insertEntity('USER', {fname: null, lname: null,
      email: null, address: null, isUtd: null, isEmployee: null}, 'userID',
    uid, userinfo);
  }

  /**
   * Insert a UTD personnel into the database.
   * @param uid - the user id to insert at.
   * @param userinfo - the attributes of the user
   */
  async insertUTDInfo(uid, userinfo): Promise<boolean> {
    await this.checkValid();
    return this._insertEntity('UTD_PERSONNEL', {uType: null, netID: null,
      isAdmin: null}, 'uid', uid, userinfo);
  }

  /**
   * Insert a student into the database.
   * @param uid - the user id to insert at.
   * @param userinfo - the attributes of the user
   */
  async insertStudentInfo(uid, userinfo): Promise<boolean> {
    await this.checkValid();
    if (!(await this._insertEntity('STUDENT', {major: null, resume: null,
      memberOf: null}, 'suid', uid, userinfo))) return false;
    if (userinfo.skills && userinfo.skills.length) {
      await this.addSkills(uid, ...userinfo.skills);
    }
    return true;
  }

  /**
   * Insert a faculty into the database.
   * @param uid - the user id to insert at.
   * @param userinfo - the attributes of the user
   */
  async insertFacultyInfo(uid, userinfo): Promise<boolean> {
    await this.checkValid();
    return this.doNestedTransaction(async (_this) => {
      if (!(await _this._insertEntity('FACULTY_OR_TEAM', {isRegTeam: false},
          'teamID', userinfo.tid, {}))) return false;

      if (!(await this._insertEntity('FACULTY', {tid: null}, 'fuid',
          uid, userinfo))) return false;

      await this.setChoices(userinfo.tid, Array(6).fill(null));
      return true;
    }, this);
  }

  /**
   * Insert a employee into the database.
   * @param uid - the user id to insert at.
   * @param userinfo - the attributes of the user
   */
  async insertEmployeeInfo(uid, userinfo): Promise<boolean> {
    await this.checkValid();
    return this._insertEntity('EMPLOYEE', {worksAt: null,
      password: null},
    'euid', uid, userinfo);
  }

  /**
   * Inserts team
   * @param tid - the team id to insert at.
   * @param teamInfo - the attributes of the team
   */
  async insertTeamInfo(tid, teamInfo): Promise<boolean> {
    await this.checkValid();
    return this.doNestedTransaction(async (_this) => {
      if (!(await _this._insertEntity('FACULTY_OR_TEAM', {isRegTeam: true},
          'teamID', tid, {}))) return false;

      if (!(await _this._insertEntity('TEAM', {assignedProj: null,
        budget: 0, leader: null, tid: null, password: null, comments: null,
        name: null, membLimit: 5},
      'tid', tid, teamInfo))) return false;

      const choices = teamInfo.choices.concat(Array(6).fill(null)).slice(0, 6);
      await _this.setChoices(tid, choices);
      return true;
    }, this);
  }

  /**
   * Inserts a company
   * @param cName - the company name
   * @param compInfo - the attributes of the team
   */
  async insertCompanyInfo(cName, compInfo): Promise<boolean> {
    await this.checkValid();
    return this._insertEntity('COMPANY', {logo: null, manager: null},
        'name', cName, compInfo);
  }

  /**
   * Inserts a help ticket
   * @param hid - the help ticket id
   * @param ticketInfo - the attributes of the ticket
   */
  async insertHelpTicketInfo(hid, ticketInfo): Promise<boolean> {
    await this.checkValid();
    return this._insertEntity('HELP_TICKET', {hStatus: null,
      hDescription: null, requestor: null}, 'hid', hid, ticketInfo);
  }

  /**
   * Inserts an invite information
   * @param inviteID - the new id
   * @param inviteInfo - the attributes of the invite
   */
  async insertInviteInfo(inviteID, inviteInfo): Promise<boolean> {
    await this.checkValid();
    return this._insertEntity('INVITE', {expiration: null, company: null,
      managerFname: null, managerLname: null, managerEmail: null}, 'inviteID',
    inviteID, inviteInfo);
  }

  /* ************************************
   * LOAD ENTITY
   * ************************************/

  /**
   * Generic load entity from table name. This will throw an error if it sees an
   * invalid id.
   *
   * @param id - unique identifier for the entity
   * @param tblname - table name
   */
  abstract async _loadEntity(id: number|string, tblname: Tables):
    Promise<Some<Entity>>;

  /**
   * Loads the team info associated with the tid.
   * @param tid - the team id to search for.
   */
  async loadTeamInfo(tid: number): Promise<Some<ent.Team>> {
    await this.checkValid();
    const ret = await this._loadEntity(tid, 'TEAM') as Some<ent.Team>;
    if (isNull(ret)) return null;
    ret.choices = await this.findTeamChoices(tid);
    return ret;
  }

  /**
   * Loads the user info associated with the uid.
   * @param uid - the user id to search for.
   */
  async loadUserInfo(uid: number): Promise<Some<ent.Users>> {
    await this.checkValid();
    const res = await this._loadEntity(uid, 'USER') as Some<ent.Users>;
    if (isNull(res)) return null;
    res.isUtd = !!res.isUtd;
    res.isEmployee = !!res.isEmployee;
    return res;
  }

  /**
   * Loads the project info associated with the pid.
   * @param pid - the project id to search for.
   */
  async loadProjectInfo(pid: number): Promise<Some<ent.Project>> {
    await this.checkValid();
    const val = await this._loadEntity(pid, 'PROJECT') as Some<ent.Project>;
    if (isNull(val)) return null;
    if (!val.skillsReq) val.skillsReq = [];
    val.visible = !!val.visible;
    return val;
  }
  /**
   * Loads the employee info associated with the uid.
   * @param uid - the user id to search for.
   */
  async loadEmployeeInfo(uid: number): Promise<Some<ent.Employee>> {
    await this.checkValid();
    return this._loadEntity(uid, 'EMPLOYEE') as Promise<Some<ent.Employee>>;
  }

  /**
   * Loads the utd personnel info associated with the uid.
   * @param uid - the user id to search for.
   */
  async loadUTDInfo(uid: number): Promise<Some<ent.UTDPersonnel>> {
    await this.checkValid();
    const res = await this._loadEntity(uid, 'UTD_PERSONNEL') as
        Some<ent.UTDPersonnel>;
    if (isNull(res)) return null;
    res.isAdmin = !!res.isAdmin;
    return res;
  }

  /**
   * Loads the student info associated with the uid.
   * @param uid - the user id to search for.
   */
  async loadStudentInfo(uid: number): Promise<Some<ent.Student>> {
    await this.checkValid();
    return this._loadEntity(uid, 'STUDENT') as Promise<Some<ent.Student>>;
  }

  /**
   * Loads the company info associated with the name.
   * @param name - the name to search for.
   */
  async loadCompanyInfo(name: string): Promise<Some<ent.Company>> {
    await this.checkValid();
    return this._loadEntity(name, 'COMPANY') as Promise<Some<ent.Company>>;
  }

  /**
   * Loads the invitation info associated with the ID.
   * @param inviteID - the ID to search for.
   */
  async loadInviteInfo(inviteID: number): Promise<Some<ent.Invite>> {
    await this.checkValid();
    const ret = await this._loadEntity(inviteID, 'INVITE') as Some<ent.Invite>;
    if (isNull(ret)) return null;
    if (ret.expiration.valueOf() < Date.now()) return null;
    return ret;
  }

  /**
   * Loads the help ticket info associated with the hid.
   * @param hid - the help ticket id to search for.
   */
  async loadHelpTicketInfo(hid: number): Promise<Some<ent.HelpTicket>> {
    await this.checkValid();
    return this._loadEntity(hid, 'HELP_TICKET') as
        Promise<Some<ent.HelpTicket>>;
  }
  /**
   * Loads the faculty info associated with the uid.
   * @param uid - the user id to search for.
   */
  async loadFacultyInfo(uid: number): Promise<Some<ent.Faculty>> {
    await this.checkValid();
    const res = await this._loadEntity(uid, 'FACULTY') as Some<ent.Faculty>;
    if (isNull(res)) return null;
    res.choices = await this.findTeamChoices(res.tid);
    return res;
  }

  /* ************************************
   * ALTER ENTITY
   * ************************************/

  /**
   * Alters entity information associated with ID given a changes to be filtered
   * with a given whitelist and given the entity's name and the name of its ID
   * If successful, this will return true
   *
   * @param whiteList - list of attributes that can be changed
   * @param ID - value of ID being search for
   * @param changes - key/value pairs of attributes and new values
   * @param entity - name of the entity being modified
   * @param entityID - name of the ID of the entity being modified
   */
  abstract async _alterEntity(whiteList: string[], ID: string|number,
    changes: Entity, entity: Tables, entityID: string): Promise<boolean>;

  /**
   * Alters user info associated with the uid using changes after filtering
   * @param uid - the user id to search for
   * @param changes - the attributes to be changed and the new values
   */
  async alterUserInfo(uid, changes): Promise<boolean> {
    await this.checkValid();
    const userWhiteList = ['fname', 'lname', 'email', 'address', 'isUTD',
      'isEmployee'];
    return this._alterEntity(userWhiteList, uid, changes, 'USER', 'userID');
  }
  /**
   * Alters project info associated with the pid using changes after filtering
   * @param pid - the project id to search for
   * @param changes - the attributes to be changed and the new values
   */
  async alterProjectInfo(pid, changes): Promise<boolean> {
    await this.checkValid();
    const projWhiteList = ['pName', 'image', 'projDoc', 'pDesc', 'mentor',
      'sponsor', 'advisor', 'status', 'visible', 'company'];
    return this._alterEntity(projWhiteList, pid, changes,
        'PROJECT', 'projID');
  }
  /**
   * Alters UTD personnel info associated with the uid
   * using changes after filtering
   * @param uid - the user id to search for
   * @param changes - the attributes to be changed and the new values
   */
  async alterUTDInfo(uid, changes): Promise<boolean> {
    await this.checkValid();
    const utdWhiteList = ['uType', 'netID', 'isAdmin'];
    return this._alterEntity(utdWhiteList, uid, changes,
        'UTD_PERSONNEL', 'uid');
  }
  /**
   * Alters student info associated with the uid using changes after filtering
   * @param uid - the user id to search for
   * @param changes - the attributes to be changed and the new values
   */
  async alterStudentInfo(uid, changes): Promise<boolean> {
    await this.checkValid();
    const studentWhiteList = ['major', 'resume', 'memberOf'];
    return this._alterEntity(studentWhiteList, uid, changes,
        'STUDENT', 'suid');
  }
  /**
   * Alters employee info associated with the uid using changes after filtering
   * @param uid - the user id to search for
   * @param changes - the attributes to be changed and the new values
   */
  async alterEmployeeInfo(uid, changes): Promise<boolean> {
    await this.checkValid();
    const employeeWhiteList = ['worksAt', 'password'];
    return this._alterEntity(employeeWhiteList, uid, changes,
        'EMPLOYEE', 'euid');
  }
  /**
   * Alters company info associated with the name using changes after filtering
   * @param name - the company name to search for
   * @param changes - the attributes to be changed and the new values
   */
  async alterCompanyInfo(name, changes): Promise<boolean> {
    await this.checkValid();
    const companyWhiteList = ['logo', 'manager'];
    return this._alterEntity(companyWhiteList, name, changes,
        'COMPANY', 'name');
  }

  /**
   * Alters invitation info associated with the ID using changes after filtering
   * @param inviteID - the invitation ID to search for
   * @param changes - the attributes to be changed and the new values
   */
  async alterInviteInfo(inviteID, changes): Promise<boolean> {
    await this.checkValid();
    const invitationAttrib = ['expiration', 'company', 'managerFname',
      'managerLname', 'managerEmail'];
    return (await this._alterEntity(invitationAttrib, inviteID, changes,
        'INVITE', 'inviteID'));
  }

  /**
   * Alters team info associated with the tid using changes after filtering
   * @param tid - the team id to search for
   * @param changes - the attributes to be changed and the new values
   */
  async alterTeamInfo(tid, changes): Promise<boolean> {
    await this.checkValid();
    const teamWhiteList = ['assignedProj', 'budget', 'leader', 'password',
      'comments', 'name', 'membLimit'];
    return this.doNestedTransaction(async (_this) => {
      if (changes.choices) await _this.setChoices(tid, changes.choices);
      return (await _this._alterEntity(teamWhiteList, tid, changes,
          'TEAM', 'tid'));
    }, this);
  }

  /**
   * Alters help ticket info associated with
   * the hid using changes after filtering
   * @param hid - the team id to search for
   * @param changes - the attributes to be changed and the new values
   */
  async alterHelpTicketInfo(hid, changes): Promise<boolean> {
    await this.checkValid();
    const helpTicketWhiteList = ['hStatus', 'hDescription', 'requestor'];
    return (await this._alterEntity(helpTicketWhiteList, hid, changes,
        'HELP_TICKET', 'hid'));
  }
}
