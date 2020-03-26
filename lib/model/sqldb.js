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
  for (const name of Object.getOwnPropertyNames(obj)) {
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
      const entityList = ['Users', 'Faculty_Or_Team', 'UTD_Personnel',
        'Faculty', 'Student', 'Project', 'Team', 'Choice', 'Skills_Req',
        'Help_Ticket', 'Student'];
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
   * @param {Object} userinfo the attributes of the user
   */
  async insertUTDInfo(uid, userinfo) {
    const createUTDPerson = 'INSERT INTO UTD_Personnel (userID, uType, ' +
    'netID, isAdmin) VALUES (?, ?, ?, ?)';
    super.insertUTDInfo(uid, userinfo);
    // eslint-disable-next-line max-len
    await this.pcon.query(createUTDPerson, this._db.UTD_PERSONNEL[uid]);
  }

  /**
   * Insert a student into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertStudentInfo(uid, userinfo) {
    const createStudent = 'INSERT INTO Student (userID, major, resume, ' +
      'memberOf) VALUES (?, ?, ?, ?)';
    super.insertStudentInfo(uid, userinfo);
    await this.pcon.query(createStudent, this._db.STUDENT[uid]);
  }

  /**
   * Insert a faculty into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertFacultyInfo(uid, userinfo) {
    const createFaculty = 'INSERT INTO Faculty (userID, teamID) VALUES (?, ?)';
    super.insertFacultyInfo(uid, userinfo);
    await this.pcon.query(createFaculty, this._db.Faculty[uid]);
  }

  /**
   * Insert a employee into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertEmployeeInfo(uid, userinfo) {
    const $createEmployee = 'INSERT INTO Employee (userID, worksAt, ' +
      'password) VALUES(?, ?, ?)';
    super.insertEmployeeInfo(uid, userinfo);
    await this.pcon.query($createEmployee, this._db.EMPLOYEE[uid]);
  }
  //  Loading Various Entity Types
  /**
   * Loads the user info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadUserInfo(uid) {
    const $selectUser = 'SELECT * FROM Users WHERE UserID = ?';
    const res = (await this.pcon.query($selectUser, uid)).result;
    if (res.length != 1) throw new Error('No match with given uid');
    mapProperties(res[0], {'UserID': 'userId', 'Fname': 'fname',
      'Lname': 'lname', 'Email': 'email', 'Address': 'address',
      'is_utd': 'isUtd', 'is_employee': 'isEmployee'});
  }
  /**
   * Loads the employee info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadEmployeeInfo(uid) {
    const $selectEmployee = 'SELECT * FROM Employee WHERE UserID = ?';
    const res = (await this.pcon.query($selectEmployee, uid)).result;
    if (res.length != 1) throw new Error('No match with given uid');
    mapProperties(res[0], {'userID': 'userID', 'worksAt': worksAt,
      'password': 'password'});
  }
  /**
   * Loads the utd personnel info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadUTDInfo(uid) {
    const $selectUTD = 'SELECT * FROM UTDPersonnel WHERE UserID = ?';
    const res = (await this.pcon.query($selectUTD, uid)).result;
    if (res.length != 1) throw new Error('No match with given uid');
    mapProperties(res[0], {'userID': 'userID', 'uType': 'uType',
      'netID': 'netID', 'isAdmin': 'isAdmin'});
  }
  /**
   * Loads the student info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadStudentInfo(uid) {
    const $selectStudent = 'SELECT * FROM Student WHERE UserID = ?';
    const res = (await this.pcon.query($selectStudent, uid)).result;
    if (res.length != 1) throw new Error('No match with given uid');
    mapProperties(res[0], {'userID': 'userID', 'major': 'majors',
      'resume': 'resume', 'memberOf': 'memberOf'});
  }
  /**
   * Loads the faculty info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadFacultyInfo(uid) {
    const $selectFaculty = 'SELECT * FROM Faculty WHERE UserID = ?';
    const res = (await this.pcon.query($selectFaculty, uid));
    if (res.length != 1) throw new Error('No match with given uid');
    mapProperties(res[0], {'userID': 'userID', 'teamID': 'teamID'});
  }
}

exports.SQLDatabase = SQLDatabase;
