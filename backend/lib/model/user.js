/**
 * Syntactical function to reload some field's value or to initialize it if it
 * doesn't exist.
 * @param {Object} obj   the object
 * @param {String} fld   field name to reload/initialize on obj
 * @param {Function} Otherwise   the constructor for initialization
 * @return {Promise} a promise on successful loading of database
 */
function doReloadOr(obj, fld, Otherwise) {
  val = obj[fld];
  if (!val) {
    val = obj[fld] = new Otherwise();
  }
  return val.reload();
}

/**
 * Dummy function when we need to load from a SQL database
 * @return {Promise} a promise that succeeds always.
 */
function dummyload() {
  return new Promise((fulfill, reject) => {
    console.log('TODO: load from database');
    fulfill(undefined);
  });
}

/**
 * Contains the data model information of a user.
 */
class User {
  /**
   * Creates a user from a uid
   * @param {String} uid   the user ID to associate with this user
   */
  constructor(uid) {
    Object.defineProperty(this, 'uid', {writable: false, value: uid});
  }

  /**
   * (Re)loads the user information associated with this uid.
   * @return {Promise} a promise on successful loading of database
   */
  reload() {
    // TODO: load from backend database
    return dummyload().then((_) => {
      // Load employee data
      if (this.isEmployee) {
        return doReloadOr(this, 'employee', Employee.bind(null, this.uid));
      }
    }).then((_) => {
      // Loads UTD personnel data
      if (this.isUtd) {
        return doReloadOr(this, 'utd', UTDPersonnel.bind(null, this.uid));
      }
    });
  }
}

/**
 * Represents the employee data
 */
class Employee extends User {
  /**
   * Creates an employee from a uid
   * @param {String} uid   the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
  }

  /**
   * (Re)loads the employee information associated with this uid.
   * @return {Promise} a promise on successful loading of database
   */
  reload() {
    // TODO: load from backend database
    return dummyload();
  }
}

/**
 * Represents the UTD personnel data
 */
class UTDPersonnel extends User {
  /**
   * Creates an UTD personnel from a uid
   * @param {String} uid   the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
  }

  /**
   * (Re)loads the UTD personnel information associated with this uid.
   * @return {Promise} a promise on successful loading of database
   */
  reload() {
    // TODO: load from backend database
    return dummyload().then((_) => {
      const t = UTDPersonnel.types;
      switch (this.uType) {
        case t.STUDENT:
          return doReloadOr(obj, 'student', Student.bind(null, this.uid));
        case t.STAFF:
          return doReloadOr(obj, 'staff', Staff.bind(null, this.uid));
        case t.FACULTY:
          return doReloadOr(obj, 'faculty', Faculty.bind(null, this.uid));
      }
    });
  }
}

UTDPersonnel.types = {
  STUDENT: 1,
  STAFF: 2,
  FACULTY: 3,
};

/**
 * Represents a student. The students select projects to do and chooses to join
 * certain teams.
 */
class Student extends User {
  /**
   * Creates an student data from a uid
   * @param {String} uid   the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
  }

  /**
   * Reloads the student information associated with this uid.
   * @return {Promise} a promise on successful loading of database
   */
  reload() {
    // TODO: load from backend database
    return dummyload();
  }
}

/**
 * Represents a faculty. The faculty is allowed a selection of projects (along
 * with the students) to facillate projects of their choosing.
 */
class Faculty extends User {
  /**
   * Creates an faculty data from a uid
   * @param {String} uid   the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
  }

  /**
   * (Re)loads the faculty information associated with this uid.
   * @return {Promise} a promise on successful loading of database
   */
  reload() {
    // TODO: load from backend database
    return dummyload();
  }
}

/**
 * Represents a staff. The staff is allowed to view all projects as needed. They
 * are not allowed to modify any data.
 */
class Staff extends User {
  /**
   * Creates a staff data from a uid
   * @param {String} uid   the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
  }

  /**
   * (Re)loads the faculty information associated with this uid.
   * @return {Promise} a promise on successful loading of database
   */
  reload() {
    // TODO: load from backend database
    return dummyload();
  }
}

exports.User = User;
exports.Employee = Employee;
exports.UTDPersonnel = UTDPersonnel;

