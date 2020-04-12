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
   * @param {Integer} teamId    the team ID to search on
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
   * @param {Integer} uid     the user ID to search on
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
   * Finds all the projects a team has ranked
   * @param {Integer} tid     the team ID to search on
   * @return {Number[]} list of choices by rank
   */
  async findTeamChoices(tid) {
    const choice = [];
    for (const rank in Array(6).keys()) {
      if (this._db.CHOICE[tid][rank] != null) {
        choice[rank] = this._db.CHOICE[tid][rank];
      }
    }
    return choice;
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
   * Inserts Project
   * @param {Integer} projID      the projID to insert at.
   * @param {Object} projInfo    the attributes of the project
   */
  async insertProjectInfo(projID, projInfo) {
    this._db.PROJECT[projID] = Object.assign(projInfo);
  }

  /**
   * Insert a user into the database.
   * @param {Integer} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertUserInfo(uid, userinfo) {
    this._db.USER[uid] = copyAttribs({}, userinfo, {fname: '', lname: '',
      email: '', address: '', isUtd: false, isEmployee: false});
    this._db.USER[uid].userId = uid;
  }

  /**
   * Insert a UTD personnel into the database.
   * @param {Integer} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertUTDInfo(uid, userinfo) {
    this._db.UTD_PERSONNEL[uid] = copyAttribs({}, userinfo, {uType: 0,
      netID: '', isAdmin: false});
  }

  /**
   * Insert a student into the database.
   * @param {Integer} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertStudentInfo(uid, userinfo) {
    this._db.STUDENT[uid] = copyAttribs({}, userinfo, {major: '',
      resume: '', memberOf: null, skills: []});
  }

  /**
   * Insert a faculty into the database.
   * @param {Integer} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertFacultyInfo(uid, userinfo) {
    this._db.FACULTY[uid] = copyAttribs({}, userinfo, {tid: ''});
    this._db.FACULTY_OR_TEAM[userinfo.tid] = {isRegTeam: false};
    for (const index of Array(6).keys) {
      this._db.CHOICE[uid][index] = null;
    }
  }

  /**
   * Insert a employee into the database.
   * @param {Integer} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertEmployeeInfo(uid, userinfo) {
    this._db.EMPLOYEE[uid] = copyAttribs({}, userinfo, {worksAt: '',
      password: ''});
  }

  /**
   * Inserts team
   * @param {Integer} tid      the team id to insert at.
   * @param {Object} teamInfo the attributes of the team
   */
  async insertTeamInfo(tid, teamInfo) {
    this._db.FACULTY_OR_TEAM[teamInfo.tid] = {isRegTeam: true};
    this._db.TEAM[tid] = copyAttribs({}, teamInfo, {assignedProj: '',
      budget: 1337, leader: '', tid: null});
    for (const index of Array(6).keys) {
      this._db.CHOICE[uid][index] = null;
    }
  }

  /**
   * Inserts a company
   * @param {String} cName    the company name
   * @param {Object} compInfo the attributes of the team
   */
  async insertCompanyInfo(cName, compInfo) {
    this._db.COMPANY[cName] = copyAttribs({}, compInfo, {'logo': '',
      'manager': ''});
  }

  /**
   * Inserts a help ticket
   * @param {Integer} hid    the help ticket id
   * @param {Object} ticketInfo the attributes of the ticket
   */
  async insertHelpTicketInfo(hid, ticketInfo) {
    this._db.HELP_TICKET[hid] = copyAttribs({}, ticketInfo,
        {'hStatus': '', 'hDescription': '', 'requestor': ''});
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
      throw new Error('loadTeamInfo(db.js): No team with given tid');
    }
  }

  /**
   * Loads the user info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadUserInfo(uid) {
    if (uid in this._db.USER) {
      return this._db.USER[uid];
    } else {
      throw new Error('loadUserInfo(db.js): No user with given uid');
    }
  }

  /**
   * Loads the project info associated with the pid.
   * @param {Integer} pid    the project id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadProjectInfo(pid) {
    if (pid in this._db.PROJECT) {
      return this._db.PROJECT[pid];
    } else {
      throw new Error('loadProjectInfo(db.js):' +
        ' No project match with given pid');
    }
  }
  /**
   * Loads the employee info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadEmployeeInfo(uid) {
    if (uid in this._db.EMPLOYEE) {
      return this._db.EMPLOYEE[uid];
    } else {
      throw new Error('loadEmployeeInfo(db.js): No employee with given euid');
    }
  }

  /**
   * Loads the utd personnel info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadUTDInfo(uid) {
    if (uid in this._db.UTD_PERSONNEL) {
      return this._db.UTD_PERSONNEL[uid];
    } else {
      throw new Error('loadUTDInfo(db.js): No UTD personnel with given uid');
    }
  }

  /**
   * Loads the student info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadStudentInfo(uid) {
    if (uid in this._db.STUDENT) {
      return this._db.STUDENT[uid];
    } else {
      throw new Error('loadStudentInfo: No student with given suid');
    }
  }
  /**
   * Loads the company info associated with the name.
   * @param {String} name    the name to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadCompanyInfo(name) {
    if (name in this._db.COMPANY) {
      return this._db.COMPANY[name];
    } else {
      throw new Error('loadCompanyInfo: No company with given name');
    }
  }

  /**
   * Loads the help ticket info associated with the hid.
   * @param {Integer} hid    the help ticket id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadHelpTicketInfo(hid) {
    if (hid in this._db.HELP_TICKET) {
      return this._db.HELP_TICKET[hid];
    } else {
      throw new Error('loadHelpTicketInfo: No help ticket with given hid');
    }
  }
  /**
   * Loads the faculty info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadFacultyInfo(uid) {
    if (uid in this._db.FACULTY) {
      return this._db.FACULTY[uid];
    } else {
      throw new Error('loadFacultyInfo(db.js): No faculty with given fuid');
    }
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
  async alterEntity(whiteList, ID, changes, entity, entityID) {
    const acceptedChanges = {};
    let hasChanges = false;
    for (const key of whiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
        hasChanges = true;
      }
    }
    if (!hasChanges) return false;
    let changeCount = 0;
    for (const key of acceptedChanges) {
      this._db[entity][ID][key] = acceptedChanges[key];
      changeCount++;
    }
    return changeCount > 0;
  }

  /**
   * Alters user info associated with the uid using changes after filtering
   * @param {Integer} uid   the user id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterUserInfo(uid, changes) {
    const userWhiteList = ['fname', 'lname', 'email', 'address', 'isUTD',
      'isEmployee'];
    return (await this.alterEntity(userWhiteList, uid, changes,
        'USER', 'uid'));
  }
  /**
   * Alters project info associated with the pid using changes after filtering
   * @param {Integer} pid   the project id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterProjectInfo(pid, changes) {
    const projWhiteList = ['pName', 'image', 'projDoc', 'pDesc', 'mentor',
      'sponsor', 'advisor', 'status', 'visible'];
    return (await this.alterEntity(projWhiteList, pid, changes,
        'PROJECT', 'pid'));
  }
  /**
   * Alters UTD personnel info associated with the uid
   * using changes after filtering
   * @param {Integer} uid   the user id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterUTDInfo(uid, changes) {
    const utdWhiteList = ['uType', 'netID', 'isAdmin'];
    return (await this.alterEntity(utdWhiteList, uid, changes,
        'UTD_PERSONNEL', 'uid'));
  }
  /**
   * Alters faculty info associated with the uid using changes after filtering
   * @param {Integer} uid   the user id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterFacultyInfo(uid, changes) {
    const facultyWhiteList = ['tid'];
    return (await this.alterEntity(facultyWhiteList, uid, changes,
        'FACULTY', 'uid'));
  }
  /**
   * Alters student info associated with the uid using changes after filtering
   * @param {Integer} uid   the user id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterStudentInfo(uid, changes) {
    const studentWhiteList = ['major', 'resume', 'memberOf'];
    return (await this.alterEntity(studentWhiteList, uid, changes,
        'STUDENT', 'uid'));
  }
  /**
   * Alters employee info associated with the uid using changes after filtering
   * @param {Integer} uid   the user id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterEmployeeInfo(uid, changes) {
    const employeeWhiteList = ['worksAt', 'password'];
    return (await this.alterEntity(employeeWhiteList, uid, changes,
        'EMPLOYEE', 'uid'));
  }
  /**
   * Alters company info associated with the name using changes after filtering
   * @param {String} name    the company name to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterCompanyInfo(name, changes) {
    const companyWhiteList = ['logo', 'manager'];
    return (await this.alterEntity(companyWhiteList, name, changes,
        'COMPANY', 'name'));
  }
  /**
   * Alters team info associated with the tid using changes after filtering
   * @param {Integer} tid   the team id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterTeamInfo(tid, changes) {
    const teamWhiteList = ['assignedProj', 'budget', 'leader'];
    return (await this.alterEntity(teamWhiteList, tid, changes,
        'TEAM', 'tid'));
  }
  /**
   * Alters choice info associated with the tid using changes after filtering
   * @param {Integer} tid   the team id to search for
   * @param {Integer} rank  rank of the choice for given team
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterChoiceInfo(tid, rank, changes) {
    const choiceWhiteList = ['pid'];
    const acceptedChanges = {};
    let hasChanges = false;
    for (const key of choiceWhiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
        hasChanges = true;
      }
    }
    if (!hasChanges) return false;
    let changeCount = 0;
    for (const key of acceptedChanges) {
      this._db.CHOICE[tid][rank] = acceptedChanges[key];
      changeCount++;
    }
    return changeCount > 0;
  }
  /**
   * Alters help ticket info associated with
   * the hid using changes after filtering
   * @param {Integer} hid   the team id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterHelpTicketInfo(hid, changes) {
    const helpTicketWhiteList = ['hStatus', 'hDescription', 'requestor'];
    return (await this.alterEntity(helpTicketWhiteList, hid, changes,
        'HELP_TICKET', 'hid'));
  }
};

exports.Database = Database;
exports.getInst = () => exports.inst;
exports.inst = null;
