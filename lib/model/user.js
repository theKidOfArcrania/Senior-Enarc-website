const db = require('./db.js');

/**
 * Syntactical function to reload some field's value or to initialize it if it
 * doesn't exist.
 * @param {Object} obj   the object
 * @param {String} fld   field name to reload/initialize on obj
 * @param {Function} Otherwise   the constructor for initialization
 * @return {Promise} a promise on successful loading of database
 */
async function doReloadOr(obj, fld, Otherwise) {
  val = obj[fld];
  if (!val) {
    val = new Otherwise();
    Object.defineProperty(obj, fld, {
      writable: false,
      value: val,
    });
  }
  await val.reload();
}

// function watchProp(obj, fld, val, callback) {
//   Object.defineProperty(obj, fld, {
//     get: () => {
//       return val;
//     }, set: (newval) => {
//       val = newval;
//       callback(val, newval);
//     },
//   });
// }

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
    // TODO: check dirty properties
  }

  /**
   * (Re)loads the user information associated with this uid.
   * @return {Promise} a promise on successful loading of database
   */
  async reload() {
    Object.assign(this, await db.inst.loadUserInfo(this.uid));
    if (this.isEmployee) {
      await doReloadOr(this, 'employee', Employee.bind(null, this.uid));
    }
    if (this.isUtd) {
      await doReloadOr(this, 'utd', UTDPersonnel.bind(null, this.uid));
    }
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
    return db.inst.loadEmployeeInfo(this.uid).then((u) => {
      Object.assign(this, u);
    });
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
    return db.inst.loadUTDInfo(this.uid).then((u) => {
      Object.assign(this, u);
    }).then((_) => {
      const t = UTDPersonnel.types;
      switch (this.uType) {
        case t.STUDENT:
          return doReloadOr(this, 'student', Student.bind(null, this.uid));
        case t.STAFF:
          return doReloadOr(this, 'staff', Staff.bind(null, this.uid));
        case t.FACULTY:
          return doReloadOr(this, 'faculty', Faculty.bind(null, this.uid));
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
    return db.inst.loadStudentInfo(this.uid).then((u) => {
      Object.assign(this, u);
    });
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
    return db.inst.loadFacultyInfo(this.uid).then((u) => {
      Object.assign(this, u);
    });
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
    // Nothing to load
    return Promise.resolve();
  }
}

exports.User = User;
exports.Employee = Employee;
exports.UTDPersonnel = UTDPersonnel;
exports.Student = Student;
exports.Faculty = Faculty;
exports.Staff = Staff;

