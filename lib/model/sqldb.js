const Database = require('./db.js').Database;
const mysql = require('mysql');
const util = require('../util.js');

const ENTITY_LIST = ['HelpTicket', 'SkillsReq', 'Choice', 'Project',
  'Team', 'UTDPersonnel', 'Student', 'Faculty', 'FacultyOrTeam',
  'Users', 'Employee', 'Company'];

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
   * @return {Number} the corresponding user ID. If not found, returns -1.
   */
  async searchUserByEmail(email) {
    const qstr = 'SELECT userId FROM Users WHERE email = ?';
    const res = (await this.pcon.query(qstr, [email])).result;
    if (res.length) {
      return res[0].userId;
    } else {
      return -1;
    }
  }

  /**
   * Search all teams in the database, if any
   * @return {Number[]} the UIDs of all members of the team
   */
  async findAllTeams() {
    const qstr = 'SELECT * FROM Team';
    const res = (await this.pcon.query(qstr)).result;
    if (res.length == 0) {
      throw new Error('findAllTeams: No teams found in database');
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
    for (const choice in res) {
      if (choice['pid'] != null) {
        rankedList[choice['ranking']] = choice['pid'];
      }
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
    if (res.length != 1) return null;
    return res[0];
  }
  /**
   * Insert a user into the database.
   * @param {Integer} uid    the user id to insert at.
   * @param {Object} ui     the attributes of the user
   */
  async insertUserInfo(uid, ui) {
    const qstr = 'INSERT INTO Users (userID, fname, lname, email, ' +
      'address, isUtd, isEmployee) VALUES (?, ?, ?, ?, ?, ?, ?)';
    await this.pcon.query(qstr, [uid, ui.fname, ui.lname, ui.email, ui.address,
      ui.isUtd, ui.isEmployee]);
  }

  /**
   * Insert a utd personnel into the database.
   * @param {Integer} uid      the user id to insert at.
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
   * @param {Integer} uid      the user id to insert at.
   * @param {Object} userInfo the attributes of the user
   */
  async insertStudentInfo(uid, userInfo) {
    const createStudent = 'INSERT INTO Student (suid, major, resume, ' +
      'memberOf) VALUES (?, ?, ?, ?)';
    await this.pcon.query(createStudent, [uid, userInfo.major,
      userInfo.resume, userInfo.memberOf]);
    const createSkills = 'INSERT INTO Skills (stuUID, skill) VALUES (?, ?)';
    for (const c of userInfo.skills) {
      await this.pcon.query(createSkills, [uid, c]);
    }
  }

  /**
   * Insert a faculty into the database.
   * @param {Integer} uid      the user id to insert at.
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
   * @param {Integer} uid      the user id to insert at.
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
   * @param {Integer} tid      the team id to insert at.
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
   * @param {Integer} projID      the projID to insert at.
   * @param {Object} projInfo    the attributes of the project
   */
  async insertProjectInfo(projID, projInfo) {
    const $createProject = 'INSERT INTO Project (projID, pName, image,' +
      'projDoc, pDesc, mentor, sponsor, advisor, status,' +
      'visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    await this.pcon.query($createProject, [projID, projInfo.pName,
      projInfo.image, projInfo.projDoc, projInfo.pDesc, projInfo.mentor,
      projInfo.sponsor, projInfo.advisor,
      projInfo.status, projInfo.visible]);
    const createSkills = 'INSERT INTO SkillsReq (pid, skillName) VALUES (?, ?)';
    for (const c of projInfo.skillsReq) {
      await this.pcon.query(createSkills, [projID, c]);
    }
  }
  /**
   * Inserts Help Ticket
   * @param {Integer} hid          the hid to insert at.
   * @param {Object} ticketInfo    the attributes of the project
   */
  async insertHelpTicketInfo(hid, ticketInfo) {
    const $createHelpTicket = 'INSERT INTO HelpTicket (hid, hStatus,' +
      'hDescription, requestor) VALUES (?, ?, ?, ?)';
    await this.pcon.query($createHelpTicket, [hid, ticketInfo.hStatus,
      ticketInfo.hDescription, ticketInfo.requestor]);
  }
  //  #####################Loading Entities###############################
  /**
   * Loads the project info associated with the projID.
   * @param {Integer} projID    the project ID to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadProjectInfo(projID) {
    const $selectProj = 'SELECT * FROM Project WHERE projID = ?';
    const $selectSkills = 'SELECT skillName FROM SkillsReq WHERE pid = ?';
    const res = (await this.pcon.query($selectProj, projID)).result;
    const resultSkill = (await this.pcon.query($selectSkills, projID)).result;

    if (res.length != 1) {
      throw new Error('loadProjectInfo: No project with given projID');
    }

    res[0].skillsReq = Object.keys(resultSkill).map(function(key) {
      return resultSkill[key]['skillName'];
    });
    return res[0];
  }
  /**
   * Loads the company info associated with the cName.
   * @param {String} cName    the company name to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadCompanyInfo(cName) {
    const $selectComp = 'SELECT * FROM Company WHERE name = ?';
    const res = (await this.pcon.query($selectComp, cName)).result;
    if (res.length != 1) {
      throw new Error('loadCompanyInfo: No company with given name');
    }
    return res[0];
  }
  /**
   * Loads the user info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadUserInfo(uid) {
    const $selectUser = 'SELECT * FROM Users WHERE userID = ?';
    const res = (await this.pcon.query($selectUser, uid)).result;
    if (res.length != 1) {
      throw new Error('loadUserInfo: No user with given uid');
    }
    const u = res[0];
    u.isUtd = !!u.isUtd;
    u.isEmployee = !!u.isEmployee;
    return u;
  }
  /**
   * Loads the team info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadTeamInfo(uid) {
    const $selectUser = 'SELECT * FROM Team WHERE tid = ?';
    const res = (await this.pcon.query($selectUser, [uid])).result;
    if (res.length != 1) {
      throw new Error('loadTeamInfo: No Team with given tid');
    }
    return res[0];
  }
  /**
   * Loads the employee info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadEmployeeInfo(uid) {
    const $selectEmployee = 'SELECT * FROM Employee WHERE euid = ?';
    const res = (await this.pcon.query($selectEmployee, uid)).result;
    if (res.length != 1) {
      throw new Error('loadEmployeeInfo: No Employee with given euid');
    }
    delete res[0].euid;
    return res[0];
  }
  /**
   * Loads the utd personnel info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadUTDInfo(uid) {
    const $selectUTD = 'SELECT * FROM UTDPersonnel WHERE uid = ?';
    const res = (await this.pcon.query($selectUTD, uid)).result;
    if (res.length != 1) {
      throw new Error('loadUTDInfo: No UTD Personnel with given uid');
    }
    const u = res[0];
    u.isAdmin = !!u.isAdmin;
    delete u.uid;
    return u;
  }
  /**
   * Loads the student info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadStudentInfo(uid) {
    const $selectStudent = 'SELECT * FROM Student WHERE suid = ?';
    const $selectSkill = 'SELECT skill FROM Skills WHERE stuUID = ?';
    const res = (await this.pcon.query($selectStudent, uid)).result;
    const resultSkill = (await this.pcon.query($selectSkill, uid)).result;
    res[0].skills = Object.keys(resultSkill).map(function(key) {
      return resultSkill[key]['skill'];
    });
    if (res.length != 1) {
      throw new Error('loadStudentInfo: No Student with given suid');
    }
    delete res[0].suid;
    return res[0];
  }
  /**
   * Loads the faculty info associated with the uid.
   * @param {Integer} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadFacultyInfo(uid) {
    const $selectFaculty = 'SELECT * FROM Faculty WHERE fuid = ?';
    const res = (await this.pcon.query($selectFaculty, uid)).result;
    if (res.length != 1) {
      throw new Error('loadFacultyInfo: No Faculty with given fuid');
    }
    delete res[0].fuid;
    return res[0];
  }
  /**
   * Loads the help ticket info associated with the hid.
   * @param {Integer} hid    the ticket id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadHelpTicketInfo(hid) {
    const $selectHelpTicket = 'SELECT * FROM HelpTicket WHERE hid = ?';
    const res = (await this.pcon.query($selectHelpTicket, [hid])).result;
    if (res.length != 1) {
      throw new Error('loadHelpTicketInfo: No Help Ticket with given hid');
    }
    return res[0];
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
  async alterEntity(whiteList, ID, changes, entity,
      entityID) {
    const acceptedChanges = {};
    let hasChanges = false;
    for (const key of whiteList) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
        hasChanges = true;
      }
    }

    if (!hasChanges) return false;

    const $updateEntity = 'UPDATE ?? SET ? WHERE ?? = ?';
    const res = (await this.pcon.query($updateEntity, [entity, acceptedChanges,
      entityID, ID])).result;
    return res.affectedRows >= 1;
  }
  /**
   * Alters the user info associated with the uid with the given changes
   * after whitelist filtering.
   * @param {Integer} uid    the user id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Boolean} true if changed, false if no change occurred.
   */
  async alterUserInfo(uid, changes) {
    const userWhiteList = ['fname', 'lname', 'email', 'address', 'isUTD',
      'isEmployee'];
    return (await this.alterEntity(userWhiteList, uid, changes, 'Users',
        'userId'));
  }
  /**
   * Alters the project info associated with the projId with the given changes
   * after whitelist filtering.
   * @param {Integer} projID    the proj id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Boolean} true if changed, false if no change occurred.
   */
  async alterProjectInfo(projID, changes) {
    const projWhiteList = ['pName', 'image', 'projDoc', 'pDesc', 'mentor',
      'sponsor', 'advisor', 'status', 'visible'];
    return (await this.alterEntity(projWhiteList, projID, changes, 'Project',
        'projID'));
  }
  /**
   * Alters the UTD personnel info associated with the uid with
   * the given changes after whitelist filtering.
   * @param {Integer} uid    the user id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Boolean} true if changed, false if no change occurred.
   */
  async alterUTDInfo(uid, changes) {
    const utdWhiteList = ['uType', 'netID', 'isAdmin'];
    return (await this.alterEntity(utdWhiteList, uid, changes, 'UTDPersonnel',
        'uid'));
  }
  /**
   * Alters the faculty info associated with the fuid with the given changes
   * after whitelist filtering.
   * @param {Integer} fuid    the user id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Boolean} true if changed, false if no change occurred.
   */
  async alterFacultyInfo(fuid, changes) {
    const facultyWhiteList = ['tid'];
    return (await this.alterEntity(facultyWhiteList, fuid, changes, 'Faculty',
        'fuid'));
  }
  /**
   * Alters the student info associated with the suid with the given changes
   * after whitelist filtering.
   * @param {Integer} suid    the user id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Boolean} true if changed, false if no change occurred.
   */
  async alterStudentInfo(suid, changes) {
    const studentWhiteList = ['major', 'resume', 'memberOf'];
    return (await this.alterEntity(studentWhiteList, suid, changes, 'Student',
        'suid'));
  }
  /**
   * Alters the employee info associated with the euid with the given changes
   * after whitelist filtering.
   * @param {Integer} euid    the user id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Boolean} true if changed, false if no change occurred.
   */
  async alterEmployeeInfo(euid, changes) {
    const employeeWhiteList = ['worksAt', 'password'];
    return (await this.alterEntity(employeeWhiteList, euid, changes,
        'Employee', 'euid'));
  }
  /**
   * Alters the company info associated with the name with the given changes
   * after whitelist filtering.
   * @param {String} name   the name to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Boolean} true if changed, false if no change occurred.
   */
  async alterCompanyInfo(name, changes) {
    const companyWhiteList = ['logo', 'manager'];
    return (await this.alterEntity(companyWhiteList, name, changes, 'Company',
        'name'));
  }
  /**
   * Alters the team info associated with the tid with the given changes
   * after whitelist filtering.
   * @param {Integer} tid   the team id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Boolean} true if changed, false if no change occurred.
   */
  async alterTeamInfo(tid, changes) {
    const teamWhiteList = ['assignedProj', 'budget', 'leader'];
    return (await this.alterEntity(teamWhiteList, tid, changes, 'Team', 'tid'));
  }
  /**
   * Alters the choice info associated with the tid with the given changes
   * after whitelist filtering.
   * @param {Integer} tid   the team id to search for.
   * @param {Integer} rank  rank of the choice for given team
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Boolean} true if changed, false if no change occurred.
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

    const $updateEntity = 'UPDATE CHOICE SET ? WHERE tid = ? AND ranking = ?';
    const res = (await this.pcon.query($updateEntity, [acceptedChanges,
      tid, rank])).result;
    return res.affectedRows >= 1;
  }
  /**
   * Alters the help ticket info associated with the hid with the given changes
   * after whitelist filtering.
   * @param {Integer} hid   the ticket id to search for.
   * @param {Object} changes   the attributes to be changed
   * and their new values
   * @return {Boolean} true if changed, false if no change occurred.
   */
  async alterHelpTicketInfo(hid, changes) {
    const helpTicketWhiteList = ['hStatus', 'hDescription', 'requestor'];
    return await this.alterEntity(helpTicketWhiteList, hid, changes,
        'HelpTicket', 'hid');
  }
}

exports.SQLDatabase = SQLDatabase;
