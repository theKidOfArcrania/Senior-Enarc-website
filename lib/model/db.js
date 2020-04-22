const crypto = require('crypto');
const {copyAttribs, range, Reentrant, deepJSONCopy, promisify} =
  require('../util.js');

/**
 * Represents an error during some database transaction
 */
class DBError extends Error {
  /**
   * Creates a new error
   * @param {String} msg    the message
   */
  constructor(msg) {
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
class Database extends Object {
  /**
   * Initializes a new database instance
   */
  constructor() {
    super();

    if (this.constructor === Database) {
      this._lock = new Reentrant();
      this._db = {
        USER: {}, PROJECT: {}, UTD_PERSONNEL: {}, FACULTY: {},
        STUDENT: {}, EMPLOYEE: {}, COMPANY: {}, FACULTY_OR_TEAM: {}, TEAM: {},
        CHOICE: {}, HELP_TICKET: {}, INVITE: {},
      };
    }
  }

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
   * @param {Integer} timeout     a timeout in milliseconds, denotes the time to
   *                              wait for a transaction to begin. A negative
   *                              value results in waiting indefinitely
   */
  async beginTransaction(timeout = 1000) {
    if (!(await this._lock.tryLock(timeout))) {
      throw new DBError('Timeout exceeded');
    }
    return new DatabaseTransaction(this, deepJSONCopy(this._db));
  }

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
   * @param {Function} fn        the function (possibly async) that will return
   *                             a value determining its success.
   * @param {Integer}  timeout   a timeout in milliseconds, see beginTransaction
   * @param {Object}   args      a vararg list of args to pass to the function,
   *                             before the transaction object.
   * @return {Object} the value returned by the function
   */
  async doTransaction(fn, timeout = 1000, ...args) {
    const tr = await this.beginTransaction(timeout);
    try {
      const retval = await fn(...args, tr);
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
   * @param {Function} fn        the function (possibly async) that will return
   *                             a value determining its success.
   * @param {Integer}  timeout   a timeout in milliseconds, see beginTransaction
   * @param {Object}   args      a vararg list of args to pass to the function,
   *                             before the transaction object.
   * @return {Object} the value returned by the function
   */
  async doRTransaction(fn, timeout = 1000, ...args) {
    let ret;
    await this.doTransaction(async (...args) => {
      ret = await fn(...args);
      return false;
    }, timeout, ...args);
    return ret;
  }

  /**
   * Closes all transactions/connections
   */
  async close() {
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
class DatabaseTransaction extends Object {
  /**
   * Initializes a new database transaction, this is called internally by the
   * database instance object.
   *
   * @param {Database} dbinst the database that created this transaction.
   * @param {Object}   db    the database state representing the current state
   *                         of this transaction. In the most basic case this
   *                         contains the actual db information, but may as well
   *                         represent the current state.
   */
  constructor(dbinst, db) {
    super();
    this._cursp = 0;
    this._sps = [];
    this._sps.names = {};
    this._dbinst = dbinst;
    this._db = db;
  }

  /**
   * Checks whether if this transaction is still a valid transaction. If this
   * has already been aborted/commited, this will throw an error. This should
   * ALWAYS be called for all public facing functions that change the database
   * in any way.
   */
  async checkValid() {
    await promisify(setImmediate)();
    if (this._dbinst === undefined) {
      throw new Error('Already commited or aborted');
    }
  }

  /**
   * Destroys this database transaction
   */
  async _destroy() {
    this._dbinst = undefined;
    this._db = undefined;
  }

  /**
   * Commits all changes. This will render the transaction invalid if
   * successful.
   */
  async commit() {
    await this.checkValid();
    this._cursp = undefined;

    await this._commit();
    await this._destroy();
  }

  /**
   * Does the actual commiting
   */
  async _commit() {
    const dbinst = this._dbinst;
    dbinst._db = this._db;
    await dbinst._lock.unlock();
  }


  /**
   * Rolls back all changes made within the transaction. Any savepoints made
   * during this transaction are discarded. Any further querys/updates to this
   * DB will be refused.
   */
  async rollback() {
    await this.checkValid();
    await this._rollback();
    await this._destroy();
  }

  /**
   * Does the actual rollback
   */
  async _rollback() {
    await this._dbinst._lock.unlock();
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
   * @param {Function} fn        the function (possibly async) that will return
   *                             a value determining its success.
   * @param {Object}   args      a vararg list of args to pass to the function.
   */
  async doNestedTransaction(fn, ...args) {
    await this.checkValid();
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
    }
  }

  /**
   * Pushes a new save point onto our stack. This is an abstraction to the
   * low-level savepoint function call. This serves as a nested transaction
   * @return {String} the savepoint name used.
   */
  async pushSP() {
    await this.checkValid();
    await this._saveSP('sp' + this._cursp++);
    return 'sp' + (this._cursp - 1);
  }

  /**
   * An alias to releaseSP
   */
  async popSP() {
    await this.releaseSP();
  }

  /**
   * Releases the current save point without restoring it. This serves as a
   * nested transaction commit.
   */
  async releaseSP() {
    await this.checkValid();
    await this._releaseSP('sp' + --this._cursp);
  }

  /**
   * Restores the current save point. This serves as a nested transaction
   * rollback.
   */
  async restoreSP() {
    await this.checkValid();
    await this._restoreSP('sp' + --this._cursp);
  }

  /**
   * Actually makes a savepoint. Should be overriden by a subclass. If a
   * savepoint already exists with that name, _savepoint will quietly overwrite
   * it
   *
   * @param {String} spname    the savepoint name to save under.
   */
  async _saveSP(spname) {
    this._sps.names[spname] = this._sps.length;
    this._sps.push([spname, JSON.parse(JSON.stringify(this._db))]);
  }

  /**
   * Restores a savepoint from a provided name. Should be overriden by a
   * subclass. This may cause an error if the specific savepoint name does not
   * exist.
   * @param {String} spname    the savepoint to restore from.
   */
  async _restoreSP(spname) {
    if (!(spname in this._sps.names)) {
      throw new DBError('Not a valid savepoint');
    }

    // Restore our db to that savepoint
    const start = this._sps.names[spname];
    this._db = this._sps[start][1];

    // Remove all later savepoints
    const names = this._sps.names;
    for (const ind of range(start, this._sps.length)) {
      const [name, expSP] = this._sps[ind];
      if (names[name] === expSP) delete names[name];
    }
    this._sps = this._sps.slice(0, start);
    this._sps.names = names;
  }

  /**
   * Releases a savepoint from a provided name, without restoring the database.
   * Should be overriden by a subclass.  This may cause an error if the specific
   * savepoint name does not exist.
   * @param {String} spname    the savepoint to restore from.
   */
  async _releaseSP(spname) {
    if (!(spname in this._sps.names)) {
      throw new DBError('Not a valid savepoint');
    }
    delete this._sps.names[spname];
  }

  /**
   * Clears the database
   */
  async clear() {
    await this.checkValid();
    this._db = {
      USER: {}, PROJECT: {}, UTD_PERSONNEL: {}, FACULTY: {},
      STUDENT: {}, EMPLOYEE: {}, COMPANY: {}, FACULTY_OR_TEAM: {}, TEAM: {},
      CHOICE: {}, HELP_TICKET: {}, INVITE: {},
    };
  }

  /**
   * Finds all the entities in the database of a specific type
   * @param {String} entity    the name of the entity
   * @return {String[]} a string list of all the entity IDs
   */
  async _findAllEntities(entity) {
    let ret = Object.keys(this._db[entity]);
    if (entity === 'INVITE') {
      ret = ret.filter((k) =>
        this._db.INVITE[k].expiration.valueOf() >= Date.now());
    }
    return ret;
  }

  /**
   * Finds all the project IDs that exist in the database.
   * @return {Number[]} a list of project IDs
   */
  async findAllProjects() {
    await this.checkValid();
    return (await this._findAllEntities('PROJECT')).map((v) => parseInt(v));
  }

  /**
   * Finds all the team IDs that exist in the database.
   * @return {Number[]} a list of team IDs
   */
  async findAllTeams() {
    await this.checkValid();
    return (await this._findAllEntities('TEAM')).map((v) => parseInt(v));
  }

  /**
   * Finds all the listed companies in the database. Note the spelling error is
   * intentional (so that way it is easier to call this function in admin).
   *
   * @return {String[]} a list of companies
   */
  async findAllCompanys() {
    await this.checkValid();
    return (await this._findAllEntities('COMPANY'));
  }

  /**
   * Finds all the help ticket IDs in the database
   * @return {Number[]} a list of hIDs
   */
  async findAllHelpTickets() {
    await this.checkValid();
    return (await this._findAllEntities('HELP_TICKET')).map((v) => parseInt(v));
  }

  /**
   * Finds all the existing (non-expired) invite IDs in the database
   * @return {Number[]} a list of invite IDs
   */
  async findAllInvites() {
    await this.checkValid();
    return (await this._findAllEntities('INVITE')).map((v) => parseInt(v));
  }

  /**
   * Finds all the users in the database
   * @return {Number[]} a list of user IDs
   */
  async findAllUsers() {
    await this.checkValid();
    return (await this._findAllEntities('USER')).map((v) => parseInt(v));
  }

  /**
   * Searches for the user ID's of all students that are on this team
   * @param {Integer} teamId    the team ID to search on
   * @return {Number[]} the userIDs list
   */
  async findMembersOfTeam(teamId) {
    await this.checkValid();
    const uids = [];
    for (const stuId in this._db.STUDENT) {
      if (this._db.STUDENT[stuId].memberOf === teamId) {
        uids.push(parseInt(stuId));
      }
    }
    return uids;
  }

  /**
   * Finds all the projects that a particular user mentors/sponsors/advises.
   * @param {Integer} uid     the user ID to search on
   * @return {Number[]} the project IDs
   */
  async findManagesProject(uid) {
    await this.checkValid();
    const pids = [];
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
   * @param {Integer} tid     the team ID to search on
   * @return {Number[]} list of choices by rank
   */
  async findTeamChoices(tid) {
    await this.checkValid();
    const choice = [];
    for (const rank of range(6)) {
      choice[rank] = this._db.CHOICE[tid][rank];
    }
    return choice;
  }
  /**
   * Finds the team assigned to the project, if it exists.
   * @param {Integer} pid     the project ID
   * @return {Integer} the team ID or null if it doesn't exist.
   */
  async findProjectAssignedTeam(pid) {
    await this.checkValid();
    for (const tid of Object.keys(this._db.TEAM)) {
      if (this._db.TEAM[tid].assignedProj === pid) {
        return parseInt(tid);
      }
    }
    return null;
  }

  /**
   * Attempts to generate a unique ID for a specific table by checking if the ID
   * exists in the table before hand. Note that this function does not guarentee
   * atomicity. This should be wrapped inside a beginTransaction block!
   *
   * @param {String} table    the name of the table to find a unique ID.
   * @return {Integer} the unique ID
   */
  async findUniqueID(table) {
    await this.checkValid();
    if (typeof this['load' + table + 'Info'] !== 'function') {
      throw new DBError('Not a valid table name!');
    }

    while (true) {
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

  /**
   * Search a user by an email, returns the respective user ID.
   * @param {String} email    the email to search on
   * @return {Number} the corresponding user ID. If not found, returns null.
   */
  async searchUserByEmail(email) {
    await this.checkValid();
    for (let uid of Object.getOwnPropertyNames(this._db.USER)) {
      uid = parseInt(uid);
      if (this._db.USER[uid].email === email) {
        return uid;
      }
    }

    return null;
  }

  /**
   * Adds some skills to the student. This does not complain if it a
   * particular skill is already added, it will just quietly ignore repeated
   * skills.
   * @param {Integer}  suid    the student user id
   * @param {String}   skills  some vararg list of skills to add
   */
  async addSkills(suid, ...skills) {
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
   * @param {Integer}  pid     the project id
   * @param {String}   skills  some vararg list of skills to add
   */
  async addSkillsReq(pid, ...skills) {
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
   * @param {Integer}  tid       the team id to search for
   * @param {String[]} choices   the new set of choices for a team.
   * @return  {Boolean} true if changed, false if no change
   */
  async setChoices(tid, choices) {
    await this.checkValid();
    if (!this._db.CHOICE[tid]) this._db.CHOICE[tid] = [];
    const ch = this._db.CHOICE[tid];
    choices.slice(0, 6).map((pid, i) => ch[i] = pid);
  }

  // ################# INSERT #######################
  /**
   * Generic insert entity. This should be overriden by subclasses
   *
   * @param {String} tableName the table entity name
   * @param {Object} attribs   a key-value dict of attributes and default vals.
   * @param {String} pkey      the name of the primary key
   * @param {Int/String} id    the id
   * @param {Object} info      the attributes of the entity
   * @return {Boolean} true if something changed
   */
  async _insertEntity(tableName, attribs, pkey, id, info) {
    info = copyAttribs({}, info, attribs);
    info[pkey] = id;
    if (id in this._db[tableName]) {
      return false;
    } else {
      this._db[tableName][id] = info;
      return true;
    }
  }

  /**
   * Inserts Project
   * @param {Integer} projID      the projID to insert at.
   * @param {Object} projInfo    the attributes of the project
   * @return {Boolean} true if something changed
   */
  async insertProjectInfo(projID, projInfo) {
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
   * @param {Integer} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   * @return {Boolean} true if something changed
   */
  async insertUserInfo(uid, userinfo) {
    await this.checkValid();
    return await this._insertEntity('USER', {fname: null, lname: null,
      email: null, address: null, isUtd: null, isEmployee: null}, 'userId',
    uid, userinfo);
  }

  /**
   * Insert a UTD personnel into the database.
   * @param {Integer} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   * @return {Boolean} true if something changed
   */
  async insertUTDInfo(uid, userinfo) {
    await this.checkValid();
    return await this._insertEntity('UTD_PERSONNEL', {uType: null, netID: null,
      isAdmin: null}, 'uid', uid, userinfo);
  }

  /**
   * Insert a student into the database.
   * @param {Integer} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   * @return {Boolean} true if something changed
   */
  async insertStudentInfo(uid, userinfo) {
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
   * @param {Integer} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   * @return {Boolean} true if something changed
   */
  async insertFacultyInfo(uid, userinfo) {
    await this.checkValid();
    return await this.doNestedTransaction(async (_this) => {
      if (!(await _this._insertEntity('FACULTY_OR_TEAM', {isRegTeam: false},
          'teamId', userinfo.tid, {}))) return false;

      if (!(await this._insertEntity('FACULTY', {tid: null}, 'fuid',
          uid, userinfo))) return false;

      await this.setChoices(userinfo.tid, Array(6).fill(null));
      return true;
    }, this);
  }

  /**
   * Insert a employee into the database.
   * @param {Integer} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   * @return {Boolean} true if something changed
   */
  async insertEmployeeInfo(uid, userinfo) {
    await this.checkValid();
    return await this._insertEntity('EMPLOYEE', {worksAt: null,
      password: null},
    'euid', uid, userinfo);
  }

  /**
   * Inserts team
   * @param {Integer} tid      the team id to insert at.
   * @param {Object} teamInfo the attributes of the team
   * @return {Boolean} true if something changed
   */
  async insertTeamInfo(tid, teamInfo) {
    await this.checkValid();
    return await this.doNestedTransaction(async (_this) => {
      if (!(await _this._insertEntity('FACULTY_OR_TEAM', {isRegTeam: true},
          'teamId', tid, {}))) return false;

      if (!(await _this._insertEntity('TEAM', {assignedProj: null,
        budget: 0, leader: null, tid: null, password: null, comments: null},
      'tid', tid, teamInfo))) return false;

      const choices = teamInfo.choices.concat(Array(6).fill(null)).slice(0, 6);
      await _this.setChoices(tid, choices);
      return true;
    }, this);
  }

  /**
   * Inserts a company
   * @param {String} cName    the company name
   * @param {Object} compInfo the attributes of the team
   * @return {Boolean} true if something changed
   */
  async insertCompanyInfo(cName, compInfo) {
    await this.checkValid();
    return await this._insertEntity('COMPANY', {logo: null, manager: null},
        'name', cName, compInfo);
  }

  /**
   * Inserts a help ticket
   * @param {Integer} hid    the help ticket id
   * @param {Object} ticketInfo the attributes of the ticket
   * @return {Boolean} true if something changed
   */
  async insertHelpTicketInfo(hid, ticketInfo) {
    await this.checkValid();
    return await this._insertEntity('HELP_TICKET', {hStatus: null,
      hDescription: null, requestor: null}, 'hid', hid, ticketInfo);
  }

  /**
   * Inserts an invite information
   * @param {Integer} inviteID     the new id
   * @param {Object}  inviteInfo   the attributes of the invite
   * @return {Boolean} true if something changed
   */
  async insertInviteInfo(inviteID, inviteInfo) {
    await this.checkValid();
    return await this._insertEntity('INVITE', {expiration: null, company: null,
      managerFname: null, managerLname: null, managerEmail: null}, 'inviteID',
    inviteID, inviteInfo);
  }

  // ############# LOAD ENTITIES ################
  /**
   * Generic load entity from table name.
   * @param {Integer/String} id        of the entity
   * @param {String}         tblname   table name
   * @param {String}         errmsg    error message to throw if entry not found
   * @return {Object} the entry from the table.
   */
  async _loadEntity(id, tblname, errmsg) {
    const tbl = this._db[tblname];
    if (id in tbl) {
      return Object.assign({}, tbl[id]);
    } else {
      throw new DBError(errmsg);
    }
  }

  /**
   * Loads the team info associated with the tid.
   * @param {Integer} tid    the team id to search for.
   * @return {Object} the team
   */
  async loadTeamInfo(tid) {
    await this.checkValid();
    const ret = await this._loadEntity(tid, 'TEAM',
        'loadTeamInfo: No team with given tid');
    ret.choices = await this.findTeamChoices(tid);
    return ret;
  }

  /**
   * Loads the user info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadUserInfo(uid) {
    await this.checkValid();
    const res = await this._loadEntity(uid, 'USER',
        'loadUserInfo: No user with given uid');
    res.isUtd = !!res.isUtd;
    res.isEmployee = !!res.isEmployee;
    return res;
  }

  /**
   * Loads the project info associated with the pid.
   * @param {Integer} pid    the project id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadProjectInfo(pid) {
    await this.checkValid();
    const val = await this._loadEntity(pid, 'PROJECT',
        'loadProjectInfo: No project match with given pid');
    if (!val.skillsReq) val.skillsReq = [];
    val.visible = !!val.visible;
    return val;
  }
  /**
   * Loads the employee info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadEmployeeInfo(uid) {
    await this.checkValid();
    const res = await this._loadEntity(uid, 'EMPLOYEE',
        'loadEmployeeInfo: No employee with given euid');
    return res;
  }

  /**
   * Loads the utd personnel info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadUTDInfo(uid) {
    await this.checkValid();
    const res = await this._loadEntity(uid, 'UTD_PERSONNEL',
        'loadUTDInfo: No UTD personnel with given uid');
    res.isAdmin = !!res.isAdmin;
    return res;
  }

  /**
   * Loads the student info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadStudentInfo(uid) {
    await this.checkValid();
    const res = await this._loadEntity(uid, 'STUDENT',
        'loadStudentInfo: No student with given suid');
    return res;
  }
  /**
   * Loads the company info associated with the name.
   * @param {String} name    the name to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadCompanyInfo(name) {
    await this.checkValid();
    return await this._loadEntity(name, 'COMPANY',
        'loadCompanyInfo: No company with given name');
  }

  /**
   * Loads the invitation info associated with the ID.
   * @param {String} inviteID   the ID to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadInviteInfo(inviteID) {
    await this.checkValid();
    const msg = 'loadInviteInfo: No invitation with given ID';
    const ret = await this._loadEntity(inviteID, 'INVITE', msg);
    if (ret.expiration.valueOf() < Date.now()) {
      throw new DBError(msg);
    }
  }

  /**
   * Loads the help ticket info associated with the hid.
   * @param {Integer} hid    the help ticket id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadHelpTicketInfo(hid) {
    await this.checkValid();
    return await this._loadEntity(hid, 'HELP_TICKET',
        'loadHelpTicketInfo: No help ticket with given hid');
  }
  /**
   * Loads the faculty info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadFacultyInfo(uid) {
    await this.checkValid();
    const res = await this._loadEntity(uid, 'FACULTY',
        'loadFacultyInfo: No faculty with given fuid');
    res.choices = await this.findTeamChoices(res.tid);
    return res;
  }

  /**
   * Alters entity information associated with ID given a changes to be filtered
   * with a given whitelist and given the entity's name and the name of its ID
   * @param {Array}   whiteList  list of attributes that can be changed
   * @param {String/Integer}  ID  value of ID being search for
   * @param {Object}  changes   key/value pairs of attributes and new values
   * @param {String}  entity    name of the entity being modified
   * @param {String}  entityID  name of the ID of the entity being modified
   * @return  {Boolean} true if changed, false otherwise
   */
  async _alterEntity(whiteList, ID, changes, entity, entityID) {
    const acceptedChanges = {};
    let hasChanges = false;
    for (const key of whiteList) {
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

  /**
   * Alters user info associated with the uid using changes after filtering
   * @param {Integer} uid   the user id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterUserInfo(uid, changes) {
    await this.checkValid();
    const userWhiteList = ['fname', 'lname', 'email', 'address', 'isUTD',
      'isEmployee'];
    return (await this._alterEntity(userWhiteList, uid, changes,
        'USER', 'userId'));
  }
  /**
   * Alters project info associated with the pid using changes after filtering
   * @param {Integer} pid   the project id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterProjectInfo(pid, changes) {
    await this.checkValid();
    const projWhiteList = ['pName', 'image', 'projDoc', 'pDesc', 'mentor',
      'sponsor', 'advisor', 'status', 'visible', 'company'];
    return (await this._alterEntity(projWhiteList, pid, changes,
        'PROJECT', 'projID'));
  }
  /**
   * Alters UTD personnel info associated with the uid
   * using changes after filtering
   * @param {Integer} uid   the user id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterUTDInfo(uid, changes) {
    await this.checkValid();
    const utdWhiteList = ['uType', 'netID', 'isAdmin'];
    return (await this._alterEntity(utdWhiteList, uid, changes,
        'UTD_PERSONNEL', 'uid'));
  }
  /**
   * Alters student info associated with the uid using changes after filtering
   * @param {Integer} uid   the user id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterStudentInfo(uid, changes) {
    await this.checkValid();
    const studentWhiteList = ['major', 'resume', 'memberOf'];
    return (await this._alterEntity(studentWhiteList, uid, changes,
        'STUDENT', 'suid'));
  }
  /**
   * Alters employee info associated with the uid using changes after filtering
   * @param {Integer} uid   the user id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterEmployeeInfo(uid, changes) {
    await this.checkValid();
    const employeeWhiteList = ['worksAt', 'password'];
    return (await this._alterEntity(employeeWhiteList, uid, changes,
        'EMPLOYEE', 'euid'));
  }
  /**
   * Alters company info associated with the name using changes after filtering
   * @param {String} name    the company name to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterCompanyInfo(name, changes) {
    await this.checkValid();
    const companyWhiteList = ['logo', 'manager'];
    return (await this._alterEntity(companyWhiteList, name, changes,
        'COMPANY', 'name'));
  }

  /**
   * Alters invitation info associated with the ID using changes after filtering
   * @param {String} inviteID  the invitation ID to search for
   * @param {Object} changes   the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterInviteInfo(inviteID, changes) {
    await this.checkValid();
    const invitationAttrib = ['expiration', 'company', 'managerFname',
      'managerLname', 'managerEmail'];
    return (await this._alterEntity(invitationAttrib, inviteID, changes,
        'INVITE', 'inviteID'));
  }

  /**
   * Alters team info associated with the tid using changes after filtering
   * @param {Integer} tid   the team id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterTeamInfo(tid, changes) {
    await this.checkValid();
    const teamWhiteList = ['assignedProj', 'budget', 'leader', 'password',
      'comments'];
    return await this.doNestedTransaction(async (_this) => {
      if (changes.choices) {
        if (!await _this.setChoices(tid, changes.choices)) return false;
      }
      return (await _this._alterEntity(teamWhiteList, tid, changes,
          'TEAM', 'tid'));
    }, this);
  }

  /**
   * Alters help ticket info associated with
   * the hid using changes after filtering
   * @param {Integer} hid   the team id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterHelpTicketInfo(hid, changes) {
    await this.checkValid();
    const helpTicketWhiteList = ['hStatus', 'hDescription', 'requestor'];
    return (await this._alterEntity(helpTicketWhiteList, hid, changes,
        'HELP_TICKET', 'hid'));
  }
};

let inst = null;
module.exports = {
  DBError, Database, DatabaseTransaction,
  getInst: () => inst,
  setInst: (i) => inst = i,
};
