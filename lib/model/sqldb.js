const Database = require('./db.js').Database;
const mysql = require('mysql');
const util = require('../util.js');

/**
 * Maps a property set from an input object onto a new object.
 * @param {Object} obj    the input object
 * @param {Object} props  a mapping of input -> output properties (i.e. the key
 *                        represents the property names in input object, and
 *                        value represents the corresponding property names in
 *                        output object)
 * @return {Object} the output object.
 */
function mapProperties(obj, props) {
  ret = {};
  for (const name of Object.getOwnPropertyNames(props)) {
    ret[props[name]] = obj[name];
  }
  return ret;
}

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
      // TODO:
      const entityList = ['HelpTicket', 'SkillsReq', 'Choice', 'Project',
        'Team', 'UTDPersonnel', 'Student', 'Faculty', 'FacultyOrTeam',
        'Users', 'Employee', 'Company'];
      const deleteEntity = 'DELETE FROM ??';
      let i;
      for (i = 0; i < entityList.length; i++) {
        await this.pcon.query(deleteEntity, entityList[i]);
      }
    }
  }

  /**
   * Search a user by an email, returns the respective user ID.
   * @param {String} email    the email to search on
   * @return {Number} the corresponding user ID. If not found, returns -1.
   */
  async searchUserByEmail(email) {
    const qstr = 'SELECT userId FROM Users WHERE email = ?';
    const res = (await this.pcon.query(qstr, [email])).result;
    if (res.length) {
      return res[0].UserId;
    } else {
      return -1;
    }
  }

  /**
   * Searches for the user ID's of all students that are on this team
   * @param {String} teamId    the team ID to search on
   * @return {Number[]} the userIDs list
   */
  async findMembersOfTeam(teamId) {
    const qstr = 'SELECT suid FROM Student WHERE memberOf = ?';
    const res = (await this.pcon.query(qstr, [teamId])).result;
    return Array.prototype.map.call(res, (v) => v.suid);
  }

  /**
   * Insert a student into the database.
   * @param {String} uid    the user id to insert at.
   * @param {Object} ui     the attributes of the user
   */
  async insertUserInfo(uid, ui) {
    const qstr = 'INSERT INTO Users (userID, fname, lname, email, ' +
      'address, isUtd, isEmployee) VALUES (?, ?, ?, ?, ?, ?, ?)';
    await this.pcon.query(qstr, [uid, ui.fname, ui.lname, ui.email, ui.address,
      ui.isUtd, ui.isEmployee]);
  }

  /**
   * Insert a faculty into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userInfo the attributes of the user
   */
  async insertUTDInfo(uid, userInfo) {
    const createUTDPerson = 'INSERT INTO UTDPersonnel (uid, uType, ' +
    'netID, isAdmin) VALUES (?, ?, ?, ?)';
    await this.pcon.query(createUTDPerson, [uid, userInfo.uType,
      userInfo.netID, userInfo.isAdmin]);
  }

  /**
   * Insert a student into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userInfo the attributes of the user
   */
  async insertStudentInfo(uid, userInfo) {
    const createStudent = 'INSERT INTO Student (suid, major, resume, ' +
      'memberOf) VALUES (?, ?, ?, ?)';
    await this.pcon.query(createStudent, [uid, userInfo.major,
      userInfo.resume, userInfo.memberOf]);
  }

  /**
   * Insert a faculty into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userInfo the attributes of the user
   */
  async insertFacultyInfo(uid, userInfo) {
    const createFacultyOrTeam = 'INSERT INTO FacultyOrTeam (teamID, ' +
      'isRegTeam) VALUES (? ,?)';
    await this.pcon.query(createFacultyOrTeam, [userInfo.tid, false]);
    const createFaculty = 'INSERT INTO Faculty (fuid, tid) VALUES (?, ?)';
    await this.pcon.query(createFaculty, [uid, userInfo.tid]);
  }

  /**
   * Insert a employee into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userInfo the attributes of the user
   */
  async insertEmployeeInfo(uid, userInfo) {
    const $createEmployee = 'INSERT INTO Employee (euid, worksAt, ' +
      'password) VALUES(?, ?, ?)';
    await this.pcon.query($createEmployee, [uid, userInfo.worksAt,
      userInfo.password]);
  }
  /**
   * Inserts team
   * @param {String} tid      the team id to insert at.
   * @param {Object} teamInfo the attributes of the team
   */
  async insertTeamInfo(tid, teamInfo) {
    const createFacultyOrTeam = 'INSERT INTO FacultyOrTeam (teamID, ' +
      'isRegTeam) VALUES (? ,?)';
    await this.pcon.query(createFacultyOrTeam, [tid, false]);
    const $createTeam = 'INSERT INTO Team (tid, assignedProj, budget,' +
      'leader) VALUES(?, ?, IFNULL(?, 0), ?)';
    await this.pcon.query($createTeam, [tid, teamInfo.assignedProj,
      teamInfo.budget, teamInfo.leader]);
  }

  /**
   * Inserts Company
   * @param {String} cName      the cName to insert at.
   * @param {Object} compInfo the attributes of the team
   */
  async insertCompanyInfo(cName, compInfo) {
    const $createCompany = 'INSERT INTO Company (name, logo,' +
      'manager) VALUES(?, ?, ?)';
    await this.pcon.query($createCompany, [cName, compInfo.logo,
      compInfo.manager]);
  }
  /**
   * Inserts Project
   * @param {String} projID      the projID to insert at.
   * @param {Object} projInfo    the attributes of the project
   */
  async insertProjectInfo(projID, projInfo) {
    const $createProject = 'INSERT INTO Project (projID, pName, image,' +
      'projDoc, pDesc, mentor, sponsor, advisor, status,' +
      'isVisible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    await this.pcon.query($createProject, [projID, projInfo.pName,
      projInfo.image, projInfo.projDoc, projInfo.pDesc, projInfo.mentor,
      projInfo.sponsor, projInfo.advisor,
      projInfo.status, projInfo.isVisible]);
  }

  //  Loading Various Entity Types
  /**
   * Loads the project info associated with the projID.
   * @param {String} projID    the project ID to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadProjectInfo(projID) {
    const $selectProj = 'SELECT * FROM Project WHERE ProjID = ?';
    const res = (await this.pcon.query($selectProj, projID)).result;
    if (res.length != 1) throw new Error('No match with given uid');
    return res[0];
  }
  /**
   * Loads the company info associated with the cName.
   * @param {String} cName    the company name to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadCompanyInfo(cName) {
    const $selectComp = 'SELECT * FROM Company WHERE Cname = ?';
    const res = (await this.pcon.query($selectComp, cName)).result;
    if (res.length != 1) throw new Error('No match with given uid');
    return res[0];
  }
  /**
   * Loads the user info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadUserInfo(uid) {
    const $selectUser = 'SELECT * FROM Users WHERE UserID = ?';
    const res = (await this.pcon.query($selectUser, uid)).result;
    if (res.length != 1) throw new Error('No match with given uid');
    const u = res[0];
    u.isUtd = !!u.isUtd;
    u.isEmployee = !!u.isEmployee;
    return u;
  }
  /**
   * Loads the user info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadTeamInfo(uid) {
    const $selectUser = 'SELECT * FROM Team WHERE Tid = ?';
    const res = (await this.pcon.query($selectUser, uid)).result;
    if (res.length != 1) throw new Error('No match with given uid');
    return res[0];
  }
  /**
   * Loads the employee info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadEmployeeInfo(uid) {
    const $selectEmployee = 'SELECT * FROM Employee WHERE Euid = ?';
    const res = (await this.pcon.query($selectEmployee, uid)).result;
    if (res.length != 1) throw new Error('No match with given uid');
    return res[0];
  }
  /**
   * Loads the utd personnel info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadUTDInfo(uid) {
    const $selectUTD = 'SELECT * FROM UTD_Personnel WHERE Uid = ?';
    const res = (await this.pcon.query($selectUTD, uid)).result;
    if (res.length != 1) throw new Error('No match with given uid');
    const u = res[0];
    u.isAdmin = !!u.isAdmin;
    return u;
  }
  /**
   * Loads the student info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadStudentInfo(uid) {
    const $selectStudent = 'SELECT * FROM Student WHERE Suid = ?';
    const res = (await this.pcon.query($selectStudent, uid)).result;
    if (res.length != 1) throw new Error('No match with given uid');
    return res[0];
  }
  /**
   * Loads the faculty info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadFacultyInfo(uid) {
    const $selectFaculty = 'SELECT * FROM Faculty WHERE Fuid = ?';
    const res = (await this.pcon.query($selectFaculty, uid)).result;
    if (res.length != 1) throw new Error('No match with given uid');
    return res[0];
  }
  //  Altering Entities
  /**
   * Alters the user info associated with the uid with the given changes
   * after whitelist filtering.
   * @param {String} uid    the user id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async alterUserInfo(uid, changes) {
    const userWhiteList = ['fname', 'lname', 'email', 'address', 'isUTD',
      'isEmployee'];
    const acceptedChanges = {};
    for (const key of userWhiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
      }
    }
    const $updateUsers = 'UPDATE Users SET ? WHERE userId = ?';
    const res = (await this.pcon.query($updateUsers, [acceptedChanges, uid]));
    if (res.affectedRows != 1) throw new Error('No match with given uid');
  }
  /**
   * Alters the skill info associated with the studid with the given changes
   * after whitelist filtering.
   * @param {String} pid    the id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async alterSkillReqInfo(pid, changes) {
    const skillReqWhiteList = ['skillName'];
    const acceptedChanges = {};
    for (const key of skillReqWhiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
      }
    }
    const $updateSkills = 'UPDATE SkillsReq SET ? WHERE pid = ?';
    const res = (await this.pcon.query($updateSkills, [acceptedChanges, pid]));
    if (res.affectedRows != 1) throw new Error('No match with given uid');
  }
  /**
   * Alters the project info associated with the projId with the given changes
   * after whitelist filtering.
   * @param {String} projID    the proj id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async alterProjInfo(projID, changes) {
    const projWhiteList = ['pName', 'image', 'projDoc', 'pDesc', 'mentor',
      'sponsor', 'advisor', 'status', 'visible'];
    const acceptedChanges = {};
    for (const key of projWhiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
      }
    }
    const $updateProject = 'UPDATE Project SET ? WHERE projID = ?';
    const res = (await this.pcon.query($updateProject,
        [acceptedChanges, projID]));
    if (res.affectedRows != 1) throw new Error('No match with given uid');
  }
  /**
   * Alters the UTD personnel info associated with the uid with
   * the given changes after whitelist filtering.
   * @param {String} uid    the user id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async alterUTDInfo(uid, changes) {
    const userWhiteList = ['uType', 'netID', 'isAdmin'];
    const acceptedChanges = {};
    for (const key of userWhiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
      }
    }
    const $updateUTD = 'UPDATE UTDPersonnel SET ? WHERE uid = ?';
    const res = (await this.pcon.query($updateUTD, [acceptedChanges, uid]));
    if (res.affectedRows != 1) throw new Error('No match with given uid');
  }
  /**
   * Alters the faculty info associated with the fuid with the given changes
   * after whitelist filtering.
   * @param {String} fuid    the user id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async alterFacultyInfo(fuid, changes) {
    const facultyWhiteList = ['tid'];
    const acceptedChanges = {};
    for (const key of facultyWhiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
      }
    }
    const $updateFaculty = 'UPDATE Faculty SET ? WHERE fuid = ?';
    const res = (await this.pcon.query($updateFaculty,
        [acceptedChanges, fuid]));
    if (res.affectedRows != 1) throw new Error('No match with given uid');
  }
  /**
   * Alters the student info associated with the suid with the given changes
   * after whitelist filtering.
   * @param {String} suid    the user id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async alterStudentInfo(suid, changes) {
    const studentWhiteList = ['major', 'resume', 'memberOf'];
    const acceptedChanges = {};
    for (const key of studentWhiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
      }
    }
    const $updateStudent = 'UPDATE Student SET ? WHERE suid = ?';
    const res = (await this.pcon.query($updateStudent,
        [acceptedChanges, suid]));
    if (res.affectedRows != 1) throw new Error('No match with given uid');
  }
  /**
   * Alters the employee info associated with the euid with the given changes
   * after whitelist filtering.
   * @param {String} euid    the user id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async alterEmployeeInfo(euid, changes) {
    const employeeWhiteList = ['worksAt', 'worksAt', 'password'];
    const acceptedChanges = {};
    for (const key of employeeWhiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
      }
    }
    const $updateEmployee = 'UPDATE Employee SET ? WHERE euid = ?';
    const res = (await this.pcon.query($updateEmployee,
        [acceptedChanges, euid]));
    if (res.affectedRows != 1) throw new Error('No match with given uid');
  }
  /**
   * Alters the company info associated with the name with the given changes
   * after whitelist filtering.
   * @param {String} name   the name to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async alterCompanyInfo(name, changes) {
    const companyWhiteList = ['logo', 'manager'];
    const acceptedChanges = {};
    for (const key of companyWhiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
      }
    }
    const $updateCompany = 'UPDATE Company SET ? WHERE name = ?';
    const res = (await this.pcon.query($updateCompany,
        [acceptedChanges, name]));
    if (res.affectedRows != 1) throw new Error('No match with given uid');
  }
  /**
   * Alters the faculty or team info associated with the teamID
   * with the given changes after whitelist filtering.
   * @param {String} teamID    the team id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async alterFacultyOrTeamInfo(teamID, changes) {
    const facultyOrTeamWhiteList = ['isRegTeam'];
    const acceptedChanges = {};
    for (const key of facultyOrTeamWhiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
      }
    }
    const $updateFacultyOrTeam = 'UPDATE FacultyOrTeam SET ? WHERE teamID = ?';
    const res = (await this.pcon.query($updateFacultyOrTeam, [acceptedChanges,
      uid]));
    if (res.affectedRows != 1) throw new Error('No match with given uid');
  }
  /**
   * Alters the team info associated with the tid with the given changes
   * after whitelist filtering.
   * @param {String} tid   the team id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async alterTeamInfo(tid, changes) {
    const teamWhiteList = ['assignedProj', 'budget', 'leader'];
    const acceptedChanges = {};
    for (const key of teamWhiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
      }
    }
    const $updateTeam = 'UPDATE Team SET ? WHERE tid = ?';
    const res = (await this.pcon.query($updateTeam, [acceptedChanges, tid]));
    if (res.affectedRows != 1) throw new Error('No match with given uid');
  }
  /**
   * Alters the choice info associated with the tid with the given changes
   * after whitelist filtering.
   * @param {String} tid   the team id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async alterChoiceInfo(tid, changes) {
    const choiceWhiteList = ['ranking', 'pid'];
    const acceptedChanges = {};
    for (const key of choiceWhiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
      }
    }
    const $updateChoice = 'UPDATE Choice SET ? WHERE tid = ?';
    const res = (await this.pcon.query($updateChoice, [acceptedChanges, tid]));
    if (res.affectedRows != 1) throw new Error('No match with given uid');
  }
  /**
   * Alters the help ticket info associated with the hid with the given changes
   * after whitelist filtering.
   * @param {String} hid   the ticket id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async alterHelpTicketInfo(hid, changes) {
    const helpTicketWhiteList = ['hStatus', 'hDescription', 'requestor'];
    const acceptedChanges = {};
    for (const key of helpTicketWhiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
      }
    }
    const $updateHelpTicket = 'UPDATE HelpTicket SET ? WHERE hid = ?';
    const res = (await this.pcon.query($updateHelpTicket,
        [acceptedChanges, hid]));
    if (res.affectedRows != 1) throw new Error('No match with given uid');
  }
}

exports.SQLDatabase = SQLDatabase;
