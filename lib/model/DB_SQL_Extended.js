const Database = require('db.js');
/**
 * This is Justin's attempt at extending the Database instance to
 * include SQL and prepared statements. It is probably very bad.
 */
class SQLDatabase extends Database {
  //  Inserting various Entity Types
  /**
   * Insert a student into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertUserInfo(uid, userinfo) {
    const $createUser = 'INSERT INTO User (?, ?, ?, ?, ?, ?, ?)';
    super.insertUserInfo(uid, userinfo);
    con.query($createUser, this._db.USER[uid], function(err, result) {
      if (err) throw err;
      console.log('Insertion successful ' + result);
    });
  }

  /**
   * Insert a faculty into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertUTDInfo(uid, userinfo) {
    const $createUTDPerson = 'INSERT INTO UTD_Personnel (?, ?, ?, ?)';
    super.insertUTDInfo(uid, userinfo);
    // eslint-disable-next-line max-len
    con.query($createUTDPerson, this._db.UTD_PERSONNEL[uid], function(err, result) {
      if (err) throw err;
      console.log('Insertion successful ' + result);
    });
  }

  /**
   * Insert a student into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertStudentInfo(uid, userinfo) {
    // eslint-disable-next-line max-len
    const $createStudent = 'INSERT INTO Student (?, ?, ?, ?)';
    super.insertStudentInfo(uid, userinfo);
    con.query($createStudent, this._db.STUDENT[uid], function(err, result) {
      if (err) throw err;
      console.log('Insertion successful ' + result);
    });
  }

  /**
   * Insert a faculty into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertFacultyInfo(uid, userinfo) {
    const $createFaculty = 'INSERT INTO Faculty (?, ?)';
    super.insertFacultyInfo(uid, userinfo);
    con.query($createFaculty, this._db.Faculty[uid], function(err, result) {
      if (err) throw err;
      console.log('Insertion successful ' + result);
    });
  }

  /**
   * Insert a employee into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertEmployeeInfo(uid, userinfo) {
    // eslint-disable-next-line max-len
    const $createEmployee = 'INSERT INTO Employee (?, ?, ?)';
    super.insertEmployeeInfo(uid, userinfo);
    con.query($createEmployee, this._db.EMPLOYEE[uid], function(err, result) {
      if (err) throw err;
      console.log('Insertion successful ' + result);
    });
  }
  //  Loading Various Entity Types
  /**
   * Loads the user info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadUserInfo(uid) {
    const $selectUser = 'SELECT * FROM Users WHERE UserID = ?';
    if (uid in this._db.USER) {
      con.query($selectUser, uid, function(err, result) {
        if (err) throw err;
        return result;
      });
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
    const $selectEmployee = 'SELECT * FROM Employee WHERE UserID = ?';
    if (uid in this._db.EMPLOYEE) {
      con.query($selectEmployee, uid, function(err, result) {
        if (err) throw err;
        return result;
      });
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
    const $selectUTD = 'SELECT * FROM UTDPersonnel WHERE UserID = ?';
    if (uid in this._db.UTD_PERSONNEL) {
      con.query($selectUTD, uid, function(err, result) {
        if (err) throw err;
        return result;
      });
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
    const $selectStudent = 'SELECT * FROM Student WHERE UserID = ?';
    if (uid in this._db.STUDENT) {
      con.query($selectStudent, uid, function(err, result) {
        if (err) throw err;
        return result;
      });
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
    const $selectFaculty = 'SELECT * FROM Faculty WHERE UserID = ?';
    if (uid in this._db.FACULTY) {
      con.query($selectFaculty, uid, function(err, result) {
        if (err) throw err;
        return result;
      });
    } else {
      throw new Error('No match with given uid');
    }
  }
}

exports.SQLDatabase = SQLDatabase;
exports.inst = null;
