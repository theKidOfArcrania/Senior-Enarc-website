/**
 * Copy object attributes
 * @param {Object} dst      the destination objecct
 * @param {Object} src      the source objecct
 * @param {Object} attribs  the attribute/default values to copy
 * @return {Object} destination object
 */
function copyAttribs(dst, src, attribs) {
  for (const prop of Object.getOwnPropertyNames(attribs)) {
    dst[prop] = src[prop] || attribs[prop];
  }
  return dst;
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
    this.clear();
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
   * Insert a user into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertUserInfo(uid, userinfo) {
    this._db.USER[uid] = copyAttribs({}, userinfo, {fname: '', lname: '',
      email: '', address: '', isUtd: false, isEmployee: false});
    this._db.USER[uid].userId = uid;
  }

  /**
   * Insert a UTD personnel into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertUTDInfo(uid, userinfo) {
    this._db.UTD_PERSONNEL[uid] = copyAttribs({}, userinfo, {uType: 0,
      netID: '', isAdmin: false});
  }

  /**
   * Insert a student into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertStudentInfo(uid, userinfo) {
    this._db.STUDENT[uid] = copyAttribs({}, userinfo, {major: '',
      resume: '', memberOf: '', skills: []});
  }

  /**
   * Insert a faculty into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertFacultyInfo(uid, userinfo) {
    this._db.FACULTY[uid] = copyAttribs({}, userinfo, {tid: ''});
  }

  /**
   * Insert a employee into the database.
   * @param {String} uid      the user id to insert at.
   * @param {Object} userinfo the attributes of the user
   */
  async insertEmployeeInfo(uid, userinfo) {
    this._db.EMPLOYEE[uid] = copyAttribs({}, userinfo, {worksAt: '',
      password: ''});
  }

  /**
   * Loads the user info associated with the uid.
   * @param {String} uid    the user id to search for.
   * @return {Promise} the info as a struct wrapped in a Promise
   */
  async loadUserInfo(uid) {
    if (uid in this._db.USER) {
      return this._db.USER[uid];
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
    if (uid in this._db.EMPLOYEE) {
      return this._db.EMPLOYEE[uid];
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
    if (uid in this._db.UTD_PERSONNEL) {
      return this._db.UTD_PERSONNEL[uid];
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
    if (uid in this._db.STUDENT) {
      return this._db.STUDENT[uid];
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
    if (uid in this._db.FACULTY) {
      return this._db.FACULTY[uid];
    } else {
      throw new Error('No match with given uid');
    }
  }
};

exports.Database = Database;
exports.inst = null;
