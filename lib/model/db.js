const crypto = require('crypto');
const {copyAttribs, range} = require('../util.js');

/**
 * Represents an error during some database transaction
 */
class DBError extends Error {
}

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
    if (this.tcount++ === 0) {
      this._beginTransaction();
    }
  }

  /**
   * Does the actual begin transaction.
   */
  async _beginTransaction() {
    this._copy = JSON.parse(JSON.stringify(this._db));
  }

  /**
   * Commits all changes, matched with the respective beginTransaction.
   */
  async commit() {
    if (this.tcount <= 0) {
      this.tcount = 0;
      throw new DBError('commit without beginTransaction');
    } else if (--this.tcount === 0) {
      await this._commit();
    }
  }

  /**
   * Does the actual commiting
   */
  async _commit() {
    delete this._copy;
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
    this._db = this._copy;
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
    if (typeof this['load' + table + 'Info'] !== 'function') {
      throw new DBError('Not a valid table name!');
    }

    while (true) {
      const id = crypto.randomBytes(4).readInt32LE();
      if (id <= 0) continue;

      try {
        await this['load' + table + 'Info'](id);
      } catch (e) {
        if (!(e instanceof DBError)) throw e;
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
   * Adds some skills to the student. This does not complain if it a
   * particular skill is already added, it will just quietly ignore repeated
   * skills.
   * @param {Integer}  suid    the student user id
   * @param {String}   skills  some vararg list of skills to add
   */
  async addSkills(suid, ...skills) {
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
    if (!(await this._insertEntity('PROJECT', {pName: null, image: null,
      pDesc: null, mentor: null, sponsor: null, advisor: null, status: null,
      visible: null, projDoc: null}, 'projID', projID, projInfo))) return false;
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
    // await this.pushSavepoint();
    // try {
    if (!(await this._insertEntity('FACULTY_OR_TEAM', {isRegTeam: false},
        'teamId', userinfo.tid, {}))) {
      // TODO: remove faculty
      return false;
    }

    if (!(await this._insertEntity('FACULTY', {tid: null}, 'fuid',
        uid, userinfo))) return false;

    await this.setChoices(userinfo.tid, Array(6).fill(null));
    return true;
    //   await this.commitSavepoint();
    // } catch (e) {
    //   await this.dropSavepoint();
    //   throw e;
    // }
  }

  /**
   * Insert a employee into the database.
   * @param {Integer} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   * @return {Boolean} true if something changed
   */
  async insertEmployeeInfo(uid, userinfo) {
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
    if (!(await this._insertEntity('TEAM', {assignedProj: null,
      budget: 0, leader: null, tid: null, password: null}, 'tid',
    tid, teamInfo))) return false;

    if (!(await this._insertEntity('FACULTY_OR_TEAM', {isRegTeam: true},
        'teamId', tid, {}))) {
      // TODO: restore
      return false;
    }

    const choices = teamInfo.choices.concat(Array(6).fill(null)).slice(0, 6);
    await this.setChoices(tid, choices);
    return true;
  }

  /**
   * Inserts a company
   * @param {String} cName    the company name
   * @param {Object} compInfo the attributes of the team
   * @return {Boolean} true if something changed
   */
  async insertCompanyInfo(cName, compInfo) {
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
    return await this._insertEntity('HELP_TICKET', {hStatus: null,
      hDescription: null, requestor: null}, 'hid', hid, ticketInfo);
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
    return await this._loadEntity(name, 'COMPANY',
        'loadCompanyInfo: No company with given name');
  }

  /**
   * Loads the help ticket info associated with the hid.
   * @param {Integer} hid    the help ticket id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadHelpTicketInfo(hid) {
    return await this._loadEntity(hid, 'HELP_TICKET',
        'loadHelpTicketInfo: No help ticket with given hid');
  }
  /**
   * Loads the faculty info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadFacultyInfo(uid) {
    const res = await this._loadEntity(uid, 'FACULTY',
        'loadFacultyInfo: No faculty with given fuid');
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
    const projWhiteList = ['pName', 'image', 'projDoc', 'pDesc', 'mentor',
      'sponsor', 'advisor', 'status', 'visible'];
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
    const utdWhiteList = ['uType', 'netID', 'isAdmin'];
    return (await this._alterEntity(utdWhiteList, uid, changes,
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
    return (await this._alterEntity(facultyWhiteList, uid, changes,
        'FACULTY', 'fuid'));
  }
  /**
   * Alters student info associated with the uid using changes after filtering
   * @param {Integer} uid   the user id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterStudentInfo(uid, changes) {
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
    const companyWhiteList = ['logo', 'manager'];
    return (await this._alterEntity(companyWhiteList, name, changes,
        'COMPANY', 'name'));
  }
  /**
   * Alters team info associated with the tid using changes after filtering
   * @param {Integer} tid   the team id to search for
   * @param {objects} changes the attributes to be changed and the new values
   * @return  {Boolean} true if changed, false if no change
   */
  async alterTeamInfo(tid, changes) {
    const teamWhiteList = ['assignedProj', 'budget', 'leader', 'password'];
    return (await this._alterEntity(teamWhiteList, tid, changes,
        'TEAM', 'tid'));
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
    return (await this._alterEntity(helpTicketWhiteList, hid, changes,
        'HELP_TICKET', 'hid'));
  }
};

exports.DBError = DBError;
exports.Database = Database;
exports.getInst = () => exports.inst;
exports.inst = null;
