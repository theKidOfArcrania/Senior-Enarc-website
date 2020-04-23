const {DBError, Database, DatabaseTransaction} = require('./db.js');
const mysql = require('mysql');
const util = require('../util.js');

const ENTITY_LIST = ['HelpTicket', 'SkillsReq', 'Choice', 'Project',
  'Team', 'UTDPersonnel', 'Student', 'Faculty', 'FacultyOrTeam',
  'Users', 'Employee', 'Company', 'Invite'];

const tblspecs = {
  'PROJECT': ['Project', 'projID'],
  'COMPANY': ['Company', 'name'],
  'USER': ['Users', 'userID'],
  'TEAM': ['Team', 'tid'],
  'EMPLOYEE': ['Employee', 'euid'],
  'UTD_PERSONNEL': ['UTDPersonnel', 'uid'],
  'STUDENT': ['Student', 'suid'],
  'FACULTY': ['Faculty', 'fuid'],
  'FACULTY_OR_TEAM': ['FacultyOrTeam', 'teamID'],
  'HELP_TICKET': ['HelpTicket', 'hid'],
  'SKILLS': ['Skills', 'stuUID'],
  'INVITE': ['Invite', 'inviteID'],
};
/**
 * This represents a specific implementation of the database backend, using a
 * mysql backend.
 */
class SQLDatabase extends Database {
  /**
   * Constructs a new SQLDatabase backend from a set of options, which is
   * directly passed to mysql.createConnection.
   * @param {Object} options    the set of options
   */
  constructor(options) {
    super();
    this._pool = mysql.createPool(options);
  }

  /**
   * Begins a mysql connection that is tied to a transaction. You must commit
   * this transaction in order to save the transaction and release the
   * connection back to the connection pool.
   *
   * @param {Integer} timeout     a timeout in milliseconds, denotes the time to
   *                              wait for a transaction to begin. A negative
   *                              value results in waiting indefinitely
   */
  async beginTransaction(timeout = -1) {
    const pool = this._pool;
    const waitConn = util.promisify(pool.getConnection.bind(pool))();
    const waitTimeout = util.until(timeout);

    let conn = undefined;
    try {
      conn = await Promise.race([waitConn, waitTimeout]);
      await util.promisify(conn.beginTransaction.bind(conn))();
    } catch (e) {
      if (conn) conn.release();
      e.dberror = true;
      throw e;
    }

    if (conn) {
      // Connection succeeds
      const trans = new SQLDatabaseTransaction(this, conn);
      return trans;
    } else {
      // Connection timeout...

      // Make sure this doesn't leak when it finally does connect.
      waitConn.then((conn) => conn.release()).catch(() => false);
      throw new DBError('Timeout exceeded');
    }
  }

  /**
   * Closes all transactions/connections
   */
  async close() {
    this._pool.end();
  }
}

/**
 * This represents a mysql database transaction.
 */
class SQLDatabaseTransaction extends DatabaseTransaction {
  /**
   * Creates a new mysql database transaction.
   * @param {Database} dbinst   the databse instance that created this
   *                            transaction
   * @param {Connection} conn   ths actual db connection for this transaction.
   */
  constructor(dbinst, conn) {
    super(dbinst, conn);

    // Promisify the query function
    conn.constructor.prototype.query[util.promisify.custom] = (...args) => {
      // console.log(this.con.format(...args));
      return new Promise((resolve, reject) => {
        args.push((error, res, flds) => {
          if (error) reject(error);
          else resolve({result: res, field: flds});
        });
        conn.query(...args);
      });
    };

    this.pcon = util.promisifyObj(conn);
    this.tcount = 0;
  }


  /**
   * Make the actual connection to the remote SQL instance.
   * @return {Boolean} true when this succeeds.
   */
  async _connect() {
    await this._wrap(this.pcon.connect)();
    return true;
  }

  /**
   * Makes a mysql query, wrapping any errors as a db-caused error.
   * @param {String}   qstr    the query string
   * @param {Object[]} args    the array list of arguments.
   */
  async _query(qstr, args) {
    return await this._wrap(this.pcon.query, qstr, args);
  }

  /**
   * Does the actual commiting
   */
  async _commit() {
    await this._wrap(this.pcon.commit);
  }

  /**
   * Destroys this database transaction
   */
  async _destroy() {
    const conn = this._db;
    await super._destroy();
    conn.release();
  }

  /**
   * Does the actual rollback
   */
  async _rollback() {
    await this._wrap(this.pcon.rollback);
  }


  /**
   * Actually makes a savepoint.
   * @param {String} spname    the savepoint name to save under.
   */
  async _saveSP(spname) {
    await this._query('SAVEPOINT ??', [spname]);
  }

  /**
   * Restores a savepoint from a provided name.
   * @param {String} spname    the savepoint to restore from.
   */
  async _restoreSP(spname) {
    await this._query('ROLLBACK TO ??', [spname]);
  }

  /**
   * Releases a savepoint from a provided name, without restoring the database.
   * Should be overriden by a subclass.  This may cause an error if the specific
   * savepoint name does not exist.
   * @param {String} spname    the savepoint to restore from.
   */
  async _releaseSP(spname) {
    await this._query('RELEASE SAVEPOINT ??', [spname]);
  }

  /**
   * Wrapper around some function to mark all errors as db errors
   * @param {Function} fn     the function to execute
   * @param {Object[]} params a vararg list of parameters
   * @return {Object} the return value of the function
   */
  async _wrap(fn, ...params) {
    try {
      return await fn(...params);
    } catch (e) {
      e.dberror = true;
      throw e;
    }
  }

  /**
   * Clears all values.
   */
  async clear() {
    await this.checkValid();
    const deleteEntity = 'DELETE FROM ??';
    for (const ent of ENTITY_LIST) {
      await this._query(deleteEntity, ent);
    }
  }

  /**
   * Search a user by an email, returns the respective user ID.
   * @param {String} email    the email to search on
   * @return {Number} the corresponding user ID. If not found, returns null.
   */
  async searchUserByEmail(email) {
    await this.checkValid();
    const qstr = 'SELECT userID FROM Users WHERE email = ?';
    const res = (await this._query(qstr, [email])).result;
    if (res.length) {
      return res[0].userID;
    } else {
      return null;
    }
  }

  /**
   * Searches a team by its common name, returning the respective team ID.
   * @param {String} name   the name of the team.
   * @return {Number} the coresponding team ID, or null if not found.
   */
  async searchTeamByName(name) {
    await this.checkValid();
    const qstr = 'SELECT tid FROM Team WHERE name = ?';
    const res = (await this._query(qstr, [name])).result;
    if (res.length) {
      return res[0].tid;
    } else {
      return null;
    }
  }

  /**
   * Sets all accepted projects to archived
   */
  async archiveAllProjects() {
    await this.checkValid();
    await this._query('UPDATE Project SET status = "archived" ' +
        'WHERE status = "accepted"');
  }

  /**
   * Finds all the entities in the database of a specific type
   * @param {String} entity    the name of the entity
   * @return {Any[]} a list of all the entity IDs
   */
  async _findAllEntities(entity) {
    let qstr = 'SELECT ?? FROM ??';
    const [tbl, pkey] = tblspecs[entity];
    if (entity === 'INVITE') qstr += ' WHERE expiration > NOW()';
    return (await this._query(qstr, [pkey, tbl])).result.map((r) => r[pkey]);
  }

  /**
   * Searches for the user ID's of all students that are on this team
   * @param {Integer} teamId    the team ID to search on
   * @return {Number[]} the userIDs list
   */
  async findMembersOfTeam(teamId) {
    await this.checkValid();
    const qstr = 'SELECT suid FROM Student WHERE memberOf = ?';
    const res = (await this._query(qstr, [teamId])).result;
    return Array.prototype.map.call(res, (v) => v.suid);
  }

  /**
   * Finds all the projects that a particular user mentors/sponsors/advises.
   * @param {Integer} uid     the user ID to search on
   * @return {Number[]} the team IDs
   */
  async findManagesProject(uid) {
    await this.checkValid();
    const qstr = 'SELECT projID FROM Project WHERE' +
      ' mentor = ? OR sponsor = ? or advisor = ?';
    const res = (await this._query(qstr, [uid, uid, uid])).result;
    return Array.prototype.map.call(res, (v) => v.projID);
  }
  /**
   * Finds all the projects that a team has ranked as their choice
   * @param {Integer} tid     the team ID to search on
   * @return {Number[]} the ranked list of the teams choices
   */
  async findTeamChoices(tid) {
    await this.checkValid();
    const qstr = 'SELECT * FROM Choice WHERE tid = ?';
    const res = (await this._query(qstr, [tid])).result;
    const rankedList = Array(6);
    for (const choice of res) {
      rankedList[choice['ranking']] = choice['pid'];
    }
    return rankedList;
  }
  /**
   * Finds the team assigned to a project, if any.
   * @param {Integer} pid     the project id to search on
   * @return {Integer} the team IDs
   */
  async findProjectAssignedTeam(pid) {
    await this.checkValid();
    const qstr = 'SELECT tid FROM Team WHERE assignedProj = ?';
    const res = (await this._query(qstr, [pid])).result;
    if (res.length !== 1) return null;
    return res[0];
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
    const qstr = 'REPLACE INTO SkillsReq (pid, skillName) VALUES ?';
    await this._query(qstr, [skills.map((s) => [pid, s])]);
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
    const qstr = 'REPLACE INTO Skills (stuUID, skill) VALUES ?';
    await this._query(qstr, [skills.map((s) => [suid, s])]);
  }

  /**
   * Replaces a set of choices for a particular team (or faculty). This will
   * quietly overwrite over the team's previous choices.
   *
   * @param {Integer}  tid       the team id to search for
   * @param {String[]} choices   the new set of choices for a team.
   */
  async setChoices(tid, choices) {
    await this.checkValid();
    const vals = choices.slice(0, 6).map((pid, i) => [tid, i, pid]);
    const qstr = 'REPLACE INTO Choice(tid, ranking, pid) VALUES ?';
    await this._query(qstr, [vals]);
  }


  /**
   * Fast method for deleting all student users. Should be overriden by
   * subclasses
   */
  async deleteAllStudents() {
    await this.checkValid();
    await this._query('DELETE FROM User WHERE EXISTS ' +
        '(SELECT suid FROM Student WHERE suid = userID)');
  }

  /**
   * Generic delete entity. This should be overriden by subclasses
   *
   * @param {String} tableName the table entity name
   * @param {Any}    id        the id
   * @return {Boolean} true if something changed
   */
  async _deleteEntity(tableName, id) {
    const [name, pkey] = tblspecs[tableName];
    const qstr = `DELETE FROM ?? ${id === null ? '' : 'WHERE ?? = ?'}`;
    return !!((await this._query(qstr, [name, pkey, id])).result.affectedRows);
  }

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
    const [name, pkey2] = tblspecs[tableName];
    info = util.copyAttribs({}, info, attribs);
    info[pkey] = id;
    const test = 'SELECT * FROM ?? WHERE ?? = ?';
    if ((await this._query(test, [name, pkey2, info[pkey]]))
        .result.length) return false;
    const qstr = 'INSERT INTO ?? SET ?';
    await this._query(qstr, [name, info]);
    return true;
  }

  //  #####################Loading Entities###############################
  /**
   * Generic load entity from table name, overriden from db.js
   * @param {Integer/String} id        of the entity
   * @param {String}         tblname   table name
   * @param {String}         errmsg    error message to throw if entry not found
   * @return {Object} the entry from the table.
   */
  async _loadEntity(id, tblname, errmsg) {
    const select = 'SELECT * FROM ?? WHERE ?? = ?';
    const [tbl, pkey] = tblspecs[tblname];
    const res = (await this._query(select, [tbl, pkey, id])).result;
    if (res.length === 0) throw new DBError(errmsg);
    return Object.assign({}, res[0]);
  }

  /**
   * Loads the project info associated with the projID.
   * @param {Integer} projID    the project ID to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadProjectInfo(projID) {
    await this.checkValid();
    const $selectSkills = 'SELECT skillName FROM SkillsReq WHERE pid = ?';
    const res = await super.loadProjectInfo(projID);
    const resultSkill = (await this._query($selectSkills, [projID])).result;
    res.skillsReq = Object.keys(resultSkill).map((key) =>
      resultSkill[key]['skillName']);
    return res;
  }

  /**
   * Loads the student info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadStudentInfo(uid) {
    await this.checkValid();
    const $selectSkill = 'SELECT skill FROM Skills WHERE stuUID = ?';
    const res = await super.loadStudentInfo(uid);
    const resultSkill = (await this._query($selectSkill, uid)).result;
    res.skills = Object.keys(resultSkill).map((key) =>
      resultSkill[key]['skill']);
    return res;
  }

  //  #########################Altering Entities###############################
  /**
   * Alters the user info associated with the uid with the given changes
   * after whitelist filtering.
   * @param {Array}   whiteList   permissible attributes that can be changed
   * @param {String/Integer}  ID         the user id to search for.
   * @param {Object}  changes    the attributes to be changed
   * and their new values
   * @param {String}  entity    the name of the entity table being changed
   * @param {String}  entityID  the primary key of entity being changed
   * @return {Boolean} true if changed, false if no change occurred.
   */
  async _alterEntity(whiteList, ID, changes, entity, entityID) {
    const acceptedChanges = {};
    let hasChanges = false;
    const tbl = tblspecs[entity][0];

    for (const key of whiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
        hasChanges = true;
      }
    }
    if (!hasChanges) return false;

    const $updateEntity = 'UPDATE ?? SET ? WHERE ?? = ?';
    const res = (await this._query($updateEntity, [tbl, acceptedChanges,
      entityID, ID])).result;
    return res.affectedRows >= 1;
  }
}

exports.SQLDatabase = SQLDatabase;
