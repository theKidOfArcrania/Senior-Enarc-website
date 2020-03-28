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
      const entityList = ['Help_Ticket', 'Skills_Req', 'Choice', 'Project',
        'Team', 'UTD_Personnel', 'Student', 'Faculty', 'Faculty_Or_Team',
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
    const qstr = 'SELECT UserId FROM Users WHERE Email = ?';
    const res = (await this.pcon.query(qstr, [email])).result;
    if (res.length) {
      return res[0].UserId;
    } else {
      return -1;
    }
  }

  /**
   * Insert a student into the database.
   * @param {String} uid    the user id to insert at.
   * @param {Object} ui     the attributes of the user
   */
  async insertUserInfo(uid, ui) {
    const qstr = 'INSERT INTO Users (UserID, Fname, Lname, Email, ' +
      'Address, is_utd, is_employee) VALUES (?, ?, ?, ?, ?, ?, ?)';
    await this.pcon.query(qstr, [uid, ui.fname, ui.lname, ui.email, ui.address,
      ui.isUtd, ui.isEmployee]);
  }

  /**
   * Insert a faculty into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userInfo the attributes of the user
   */
  async insertUTDInfo(uid, userInfo) {
    const createUTDPerson = 'INSERT INTO UTD_Personnel (Uid, UType, ' +
    'NetID, isAdmin) VALUES (?, ?, ?, ?)';
    await this.pcon.query(createUTDPerson, [uid, userInfo.uType,
      userInfo.netID, userInfo.isAdmin]);
  }

  /**
   * Insert a student into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userInfo the attributes of the user
   */
  async insertStudentInfo(uid, userInfo) {
    const createStudent = 'INSERT INTO Student (Suid, Major, Stu_Resume, ' +
      'Member_of) VALUES (?, ?, ?, ?)';
    await this.pcon.query(createStudent, [uid, userInfo.major,
      userInfo.resume, userInfo.memberOf]);
  }

  /**
   * Insert a faculty into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userInfo the attributes of the user
   */
  async insertFacultyInfo(uid, userInfo) {
    const createFacultyOrTeam = 'INSERT INTO Faculty_Or_Team (TeamID, ' +
      'is_reg_team) VALUES (? ,?)';
    await this.pcon.query(createFacultyOrTeam, [userInfo.tid, false]);
    const createFaculty = 'INSERT INTO Faculty (Fuid, Tid) VALUES (?, ?)';
    await this.pcon.query(createFaculty, [uid, userInfo.tid]);
  }

  /**
   * Insert a employee into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userInfo the attributes of the user
   */
  async insertEmployeeInfo(uid, userInfo) {
    const $createEmployee = 'INSERT INTO Employee (Euid, Works_at, ' +
      'Password) VALUES(?, ?, ?)';
    await this.pcon.query($createEmployee, [uid, userInfo.worksAt,
      userInfo.password]);
  }
  /**
   * Inserts team
   * @param {String} tid      the team id to insert at.
   * @param {Object} teamInfo the attributes of the team
   */
  async insertTeamInfo(tid, teamInfo) {
    const createFacultyOrTeam = 'INSERT INTO Faculty_Or_Team (TeamID, ' +
      'is_reg_team) VALUES (? ,?)';
    await this.pcon.query(createFacultyOrTeam, [tid, false]);
    const $createTeam = 'INSERT INTO Team (Tid, Assigned_proj, Budget,' +
      'Leader) VALUES(?, ?, IFNULL(?, 0), ?)';
    await this.pcon.query($createTeam, [tid, teamInfo.assignedProj,
      teamInfo.budget, teamInfo.leader]);
  }

  /**
   * Inserts Company
   * @param {String} cName      the cName to insert at.
   * @param {Object} compInfo the attributes of the team
   */
  async insertCompanyInfo(cName, compInfo) {
    const $createCompany = 'INSERT INTO Company (Cname, Logo,' +
      'Manager) VALUES(?, ?, ?)';
    await this.pcon.query($createCompany, [cName, compInfo.logo,
      compInfo.manager]);
  }
  /**
   * Inserts Project
   * @param {String} projID      the projID to insert at.
   * @param {Object} projInfo    the attributes of the project
   */
  async insertProjectInfo(projID, projInfo) {
    const $createProject = 'INSERT INTO Project (ProjID, Pname, Image,' +
      'Project_document, Pdescription, Mentor, Sponsor, Advisor, Status,' +
      'Is_visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    await this.pcon.query($createProject, [projID, [projInfo.pName,
      projInfo.image, projInfo.projDoc, projInfo.pDesc, projInfo.mentor,
      projInfo.sponsor, projInfo.advisor,
      projInfo.status, projInfo.isVisible]]);
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
    return mapProperties(res[0], {'ProjID': 'projID', 'Pname': 'pName',
      'Image': 'image', 'Project_document': 'projDoc', 'Pdescription':
        'pDesc', 'Mentor': 'mentor', 'Sponsor': 'sponsor', 'Advisor':
        'advisor', 'Status': 'status'});
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
    return mapProperties(res[0], {'Cname': 'name', 'Logo': 'logo',
      'Manager': 'manager'});
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
    const u = await mapProperties(res[0], {'UserID': 'userId', 'Fname': 'fname',
      'Lname': 'lname', 'Email': 'email', 'Address': 'address', 'is_utd':
      'isUtd', 'is_employee': 'isEmployee'});
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
    return mapProperties(res[0], {'Tid': 'tid', 'Assigned_proj': 'assignedProj',
      'Budget': 'budget', 'Leader': 'leader'});
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
    return mapProperties(res[0], {'Works_at': 'worksAt',
      'Password': 'password'});
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
    const u = mapProperties(res[0], {'UType': 'uType', 'NetID': 'netID',
      'isAdmin': 'isAdmin'});
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
    const u = mapProperties(res[0], {'Major': 'major', 'Stu_Resume': 'resume',
      'Member_of': 'memberOf'});
    return u;
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
    return mapProperties(res[0], {'Tid': 'tid'});
  }
}

exports.SQLDatabase = SQLDatabase;
