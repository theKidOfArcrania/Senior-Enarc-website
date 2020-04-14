const {DBError, Database} = require('./db.js');
const mysql = require('mysql');
const util = require('../util.js');

const ENTITY_LIST = ['HelpTicket', 'SkillsReq', 'Choice', 'Project',
  'Team', 'UTDPersonnel', 'Student', 'Faculty', 'FacultyOrTeam',
  'Users', 'Employee', 'Company'];

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
};

/**
 * This is Justin's attempt at extending the Database instance to
 * include SQL and prepared statements. It is probably very bad.
 */
class SQLDatabase extends Database {
  /**
   * Constructs a new SQLDatabase backend from a set of options, which is
   * directly passed to mysql.createConnection.
   * @param {Object} options    the set of options
   */
  constructor(options) {
    super();
    this.con = mysql.createConnection(options);
    this.isConnected = false;

    // Promisify the query function
    this.con.constructor.prototype.query[util.promisify.custom] = (...args) => {
      // console.log(this.con.format(...args));
      return new Promise((resolve, reject) => {
        args.push((error, res, flds) => {
          if (error) reject(error);
          else resolve({result: res, field: flds});
        });
        this.con.query(...args);
      });
    };

    this.pcon = util.promisifyObj(this.con);
    this.tcount = 0;
  }

  /**
   * Make the actual connection to the remote SQL instance.
   */
  async connect() {
    if (!this.isConnected) {
      await this.pcon.connect();
      this.isConnected = true;
    }
  }

  /**
   * Closes the connection
   */
  close() {
    this.con.end();
  }

  /**
   * Does the actual begin transaction.
   */
  async _beginTransaction() {
    await this.pcon.beginTransaction();
  }

  /**
   * Does the actual commiting
   */
  async _commit() {
    await this.pcon.commit();
  }

  /**
   * Does the actual rollback
   */
  async _rollback() {
    await this.pcon.rollback();
  }

  /**
   * Clears all values. Note that depending on the underlying implementation,
   * this may issue an autocommit!
   */
  async clear() {
    if (this.pcon) {
      const deleteEntity = 'DELETE FROM ??';
      for (const ent of ENTITY_LIST) {
        await this.pcon.query(deleteEntity, ent);
      }
    }
  }

  /**
   * Search a user by an email, returns the respective user ID.
   * @param {String} email    the email to search on
   * @return {Number} the corresponding user ID. If not found, returns null.
   */
  async searchUserByEmail(email) {
    const qstr = 'SELECT userId FROM Users WHERE email = ?';
    const res = (await this.pcon.query(qstr, [email])).result;
    if (res.length) {
      return res[0].userId;
    } else {
      return null;
    }
  }

  /**
   * Search all teams in the database, if any
   * @return {Number[]} the UIDs of all members of the team
   */
  async findAllTeams() {
    const qstr = 'SELECT * FROM Team';
    const res = (await this.pcon.query(qstr)).result;
    if (res.length === 0) {
      throw new DBError('findAllTeams: No teams found in database');
    }
    return res;
  }

  /**
   * Searches for the user ID's of all students that are on this team
   * @param {Integer} teamId    the team ID to search on
   * @return {Number[]} the userIDs list
   */
  async findMembersOfTeam(teamId) {
    const qstr = 'SELECT suid FROM Student WHERE memberOf = ?';
    const res = (await this.pcon.query(qstr, [teamId])).result;
    return Array.prototype.map.call(res, (v) => v.suid);
  }

  /**
   * Finds all the projects that a particular user mentors/sponsors/advises.
   * @param {Integer} uid     the user ID to search on
   * @return {Number[]} the team IDs
   */
  async findManagesProject(uid) {
    const qstr = 'SELECT projID FROM Project WHERE' +
      ' mentor = ? OR sponsor = ? or advisor = ?';
    const res = (await this.pcon.query(qstr, [uid, uid, uid])).result;
    return Array.prototype.map.call(res, (v) => v.projID);
  }
  /**
   * Finds all the projects that a team has ranked as their choice
   * @param {Integer} tid     the team ID to search on
   * @return {Number[]} the ranked list of the teams choices
   */
  async findTeamChoices(tid) {
    const qstr = 'SELECT * FROM Choice WHERE tid = ?';
    const res = (await this.pcon.query(qstr, [tid])).result;
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
    const qstr = 'SELECT tid FROM Team WHERE assignedProj = ?';
    const res = (await this.pcon.query(qstr, [pid])).result;
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
    const qstr = 'REPLACE INTO SkillsReq (pid, skillName) VALUES ?';
    await this.pcon.query(qstr, [skills.map((s) => [pid, s])]);
  }

  /**
   * Adds some skills to the student. This does not complain if it a
   * particular skill is already added, it will just quietly ignore repeated
   * skills.
   * @param {Integer}  suid    the student user id
   * @param {String}   skills  some vararg list of skills to add
   */
  async addSkills(suid, ...skills) {
    const qstr = 'REPLACE INTO Skills (stuUID, skill) VALUES ?';
    await this.pcon.query(qstr, [skills.map((s) => [suid, s])]);
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
    const vals = choices.slice(0, 6).map((pid, i) => [tid, i, pid]);
    const qstr = 'REPLACE INTO Choice(tid, ranking, pid) VALUES ?';
    await this.pcon.query(qstr, [vals]);
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
    if ((await this.pcon.query(test, [name, pkey2, info[pkey]]))
        .result.length) return false;
    const qstr = 'INSERT INTO ?? SET ?';
    await this.pcon.query(qstr, [name, info]);
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
    const res = (await this.pcon.query(select, [tbl, pkey, id])).result;
    if (res.length === 0) throw new DBError(errmsg);
    return Object.assign({}, res[0]);
  }

  /**
   * Loads the project info associated with the projID.
   * @param {Integer} projID    the project ID to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadProjectInfo(projID) {
    const $selectSkills = 'SELECT skillName FROM SkillsReq WHERE pid = ?';
    const res = await super.loadProjectInfo(projID);
    const resultSkill = (await this.pcon.query($selectSkills, [projID])).result;
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
    const $selectSkill = 'SELECT skill FROM Skills WHERE stuUID = ?';
    const res = await super.loadStudentInfo(uid);
    const resultSkill = (await this.pcon.query($selectSkill, uid)).result;
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
    const res = (await this.pcon.query($updateEntity, [tbl, acceptedChanges,
      entityID, ID])).result;
    return res.affectedRows >= 1;
  }
}

exports.SQLDatabase = SQLDatabase;
