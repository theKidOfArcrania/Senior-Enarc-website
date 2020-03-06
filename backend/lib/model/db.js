/**
 * This is the abstract superclass of a database instance. This represents a
 * in-memory database of all the entities. This should be overwritten for other
 * database backends.
 */
class Database {
  /**
   * Creates a new database instance
   * @param {Object} db    a map of tables for each entity
   */
  constructor(db) {
    this._db = db;
  }

  /**
   * Loads the user info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  loadUserInfo(uid) {
    if (uid in this._db.USER) {
      return Promise.resolve(this._db.USER[uid]);
    } else {
      return Promise.reject(new Error('No match with given uid'));
    }
  }

  /**
   * Loads the employee info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  loadEmployeeInfo(uid) {
    if (uid in this._db.EMPLOYEE) {
      return Promise.resolve(this._db.EMPLOYEE[uid]);
    } else {
      return Promise.reject(new Error('No match with given uid'));
    }
  }

  /**
   * Loads the utd personnel info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  loadUTDInfo(uid) {
    if (uid in this._db.UTD_PERSONNEL) {
      return Promise.resolve(this._db.UTD_PERSONNEL[uid]);
    } else {
      return Promise.reject(new Error('No match with given uid'));
    }
  }

  /**
   * Loads the student info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  loadStudentInfo(uid) {
    if (uid in this._db.STUDENT) {
      return Promise.resolve(this._db.STUDENT[uid]);
    } else {
      return Promise.reject(new Error('No match with given uid'));
    }
  }

  /**
   * Loads the faculty info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  loadFacultyInfo(uid) {
    if (uid in this._db.FACULTY) {
      return Promise.resolve(this._db.FACULTY[uid]);
    } else {
      return Promise.reject(new Error('No match with given uid'));
    }
  }
};

exports.Database = Database;
exports.inst = null;
