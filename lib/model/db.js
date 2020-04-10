const crypto = require('crypto');
const copyAttribs = require('../util.js').copyAttribs;

/**
 * This is the abstract superclass of a database instance. This represents a
 * in-memory database of all the entities. This should be overwritten for other
 * database backends.
 */
class Database extends Object {
  /**
   * Initializes a new database instance
   */
  constructor() {
    super();
    this.tcount = 0;
    if (this.constructor === Database) {
      this._db = {
        USER: {}, PROJECT: {}, UTD_PERSONNEL: {}, FACULTY: {},
        STUDENT: {}, EMPLOYEE: {}, COMPANY: {}, FACULTY_OR_TEAM: {}, TEAM: {},
        CHOICE: {}, HELP_TICKET: {},
      };
    }
  }

  /**
   * Make the actual connection to the remote SQL instance.
   */
  async connect() {
    // Does nothing
  }

  /**
   * Closes the connection
   */
  close() {
    // Does nothing
  }

  /**
   * Begin an atomic transaction. This will not allow any concurrent
   * modifications to the affected table(s), until the respective commit() or
   * rollback() is called.
   *
   * Nested beginTransactions can be done. In that case, only the outermost
   * beginTransaction/commit will actually make an underlying transaction state
   * to the database.
   */
  async beginTransaction() {
    if (this.tcount++ == 0) {
      this._beginTransaction();
    }
  }

  /**
   * Does the actual begin transaction.
   */
  async _beginTransaction() {
    // Does nothing
  }

  /**
   * Commits all changes, matched with the respective beginTransaction.
   */
  async commit() {
    if (this.tcount <= 0) {
      this.tcount = 0;
      throw new Error('commit without beginTransaction');
    } else if (--this.tcount == 0) {
      await this._commit();
    }
  }

  /**
   * Does the actual commiting
   */
  async _commit() {
    // Does nothing
  }


  /**
   * Rolls back all changes made within the transaction. Note that rollback will
   * roll back ALL changes within a beginTransaction, (for nested transactions,
   * the outermost one).
   */
  async rollback() {
    if (this.tcount <= 0) {
      this.tcount = 0;
      return;
    }

    this.tcount = 0;
    await this._rollback();
  }

  /**
   * Does the actual rollback
   */
  async _rollback() {
    // Does nothing
  }

  /**
   * Clears the database
   */
  async clear() {
    this._db = {
      USER: {}, PROJECT: {}, UTD_PERSONNEL: {}, FACULTY: {},
      STUDENT: {}, EMPLOYEE: {}, COMPANY: {}, FACULTY_OR_TEAM: {}, TEAM: {},
      CHOICE: {}, HELP_TICKET: {},
    };
  }

  /**
   * Finds all the team IDs that exist in the database.
   */
  async findAllTeams() {
    return Object.getOwnPropertyNames(this._db.TEAM)
        .map((v) => parseInt(v));
  }

  /**
   * Searches for the user ID's of all students that are on this team
   * @param {String} teamId    the team ID to search on
   * @return {Number[]} the userIDs list
   */
  async findMembersOfTeam(teamId) {
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
   * @param {String} uid     the user ID to search on
   * @return {Number[]} the team IDs
   */
  async findManagesProject(uid) {
    const pids = [];
    for (const projId in this._db.PROJECT) {
      if (this._db.PROJECT[projId].mentor === uid ||
          this._db.PROJECT[projId].sponsor === uid ||
          this._db.PROJECT[projId].advisor === uid) {
        pids.append(projId);
      }
    }
    return pids;
  }

  /**
   * Finds the team assigned to the project, if it exists.
   * @param {Integer} pid     the project ID
   * @return {Integer} the team ID or null if it doesn't exist.
   */
  async findProjectAssignedTeam(pid) {
    for (const tid in this._db.TEAM) {
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
    if (typeof this['load' + table + 'Info'] !== 'function') {
      throw new Error('Not a valid table name!');
    }

    while (true) {
      const id = crypto.randomBytes(4).readInt32LE();
      if (id <= 0) continue;

      try {
        await this['load' + table + 'Info'](id);
      } catch (e) {
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
    for (let uid of Object.getOwnPropertyNames(this._db.USER)) {
      uid = parseInt(uid);
      if (this._db.USER[uid].email === email) {
        return uid;
      }
    }

    return null;
  }

  /**
   * Insert a user into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertUserInfo(uid, userinfo) {
    this._db.USER[uid] = copyAttribs({}, userinfo, {fname: '', lname: '',
      email: '', address: '', isUtd: false, isEmployee: false});
    this._db.USER[uid].userId = uid;
  }

  /**
   * Insert a UTD personnel into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertUTDInfo(uid, userinfo) {
    this._db.UTD_PERSONNEL[uid] = copyAttribs({}, userinfo, {uType: 0,
      netID: '', isAdmin: false});
  }

  /**
   * Insert a student into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertStudentInfo(uid, userinfo) {
    this._db.STUDENT[uid] = copyAttribs({}, userinfo, {major: '',
      resume: '', memberOf: null, skills: []});
  }

  /**
   * Insert a faculty into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertFacultyInfo(uid, userinfo) {
    this._db.FACULTY[uid] = copyAttribs({}, userinfo, {tid: ''});
    this._db.FACULTY_OR_TEAM[userinfo.tid] = {isRegTeam: false};
  }

  /**
   * Insert a employee into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertEmployeeInfo(uid, userinfo) {
    this._db.EMPLOYEE[uid] = copyAttribs({}, userinfo, {worksAt: '',
      password: ''});
  }

  /**
   * Inserts team
   * @param {String} tid      the team id to insert at.
   * @param {Object} teamInfo the attributes of the team
   */
  async insertTeamInfo(tid, teamInfo) {
    this._db.FACULTY_OR_TEAM[teamInfo.tid] = {isRegTeam: true};
    this._db.TEAM[tid] = copyAttribs({}, teamInfo, {assignedProj: '',
      budget: 1337, leader: '', tid: null});
  }

  /**
   * Inserts a company
   * @param {String} cName    the company name
   * @param {Object} compInfo the attributes of the team
   */
  async insertCompanyInfo(cName, compInfo) {
    this._db.COMPANY[cName] = copyAttribs({}, compInfo, {'name': '',
      'logo': '', 'manager': ''});
  }

  /**
   * Loads the team info associated with the tid.
   * @param {Integer} tid    the team id to search for.
   * @return {Object} the team
   */
  async loadTeamInfo(tid) {
    if (tid in this._db.TEAM) {
      return this._db.TEAM[tid];
    } else {
      throw new Error('No match with given tid');
    }
  }

  /**
   * Loads the user info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadUserInfo(uid) {
    if (uid in this._db.USER) {
      return this._db.USER[uid];
    } else {
      throw new Error('No match with given uid');
    }
  }

  /**
   * Loads the employee info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadEmployeeInfo(uid) {
    if (uid in this._db.EMPLOYEE) {
      return this._db.EMPLOYEE[uid];
    } else {
      throw new Error('No match with given uid');
    }
  }

  /**
   * Loads the utd personnel info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadUTDInfo(uid) {
    if (uid in this._db.UTD_PERSONNEL) {
      return this._db.UTD_PERSONNEL[uid];
    } else {
      throw new Error('No match with given uid');
    }
  }

  /**
   * Loads the student info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadStudentInfo(uid) {
    if (uid in this._db.STUDENT) {
      return this._db.STUDENT[uid];
    } else {
      throw new Error('No match with given uid');
    }
  }

  /**
   * Loads the faculty info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadFacultyInfo(uid) {
    if (uid in this._db.FACULTY) {
      return this._db.FACULTY[uid];
    } else {
      throw new Error('No match with given uid');
    }
  }
};

exports.Database = Database;
exports.getInst = () => exports.inst;
exports.inst = null;
