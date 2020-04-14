const {getInst} = require('./db.js');

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
      enumerable: true,
      writable: false,
      value: val,
    });
  }
  await val.reload();
}

const norm = (obj) => obj && obj.normalize();

/**
 * Obtains the list of teams that this user is a member of, including
 * advising/mentor/sponsor/student roles.
 * @param {Object} u    the user to query teams.
 * @return {Number[]} a list of team IDs.
 */
async function getMyTeams(u) {
  const db = getInst();

  const tids = [];

  // Search for all per-project roles
  const pids = await db.findManagesProject(u.userId);
  tids.push(...(await Promise.all(pids.map(
      db.findProjectAssignedTeam.bind(db)))));

  // Search for memberOf role
  if (u.isUtd && u.utd.uType === UTDPersonnel.types.STUDENT) {
    const memb = u.utd.student.memberOf;
    if (memb !== null && !tids.includes(memb)) {
      tids.push(memb);
    }
  }

  // Filter out nulls
  return tids.filter((t) => t !== null);
}

/**
 * An abstract user entity
 */
class Uent {
  /**
   * Creates a user entity from a uid
   * @param {String} uid   the user ID to associate with this user
   */
  constructor(uid) {
    Object.defineProperty(this, 'uid', {writable: false, value: uid});
  }

  /**
   * Normalizes and flattens all the properties of a user into a JSON object.
   * @return {Object} a JSON-able representation of this user.
   */
  normalize() {
    const ret = Object.assign({}, this);
    delete ret.uid;
    return ret;
  }
}

/**
 * Contains the data model information of a user.
 */
class User extends Uent {
  /**
   * Creates a user from a uid
   * @param {String} uid   the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
    Object.defineProperty(this, 'teams', {writable: true, value: []});
  }

  /**
   * (Re)loads the user information associated with this uid.
   * @return {Promise} a promise on successful loading of database
   */
  async reload() {
    const db = getInst();
    await db.beginTransaction();
    try {
      Object.assign(this, await db.loadUserInfo(this.uid));
      if (this.isEmployee) {
        await doReloadOr(this, 'employee', Employee.bind(null, this.uid));
      }
      if (this.isUtd) {
        await doReloadOr(this, 'utd', UTDPersonnel.bind(null, this.uid));
      }
      this.teams = await getMyTeams(this);
    } finally {
      await db.commit();
    }
  }

  /**
   * Normalizes and flattens all the properties of a user into a JSON object.
   * @return {Object} a JSON-able representation of this user.
   */
  normalize() {
    const ret = super.normalize();
    delete ret.employee;
    delete ret.utd;
    Object.assign(ret, norm(this.employee));
    Object.assign(ret, norm(this.utd));
    return ret;
  }
}

/**
 * Represents the employee data
 */
class Employee extends Uent {
  /**
   * Creates an employee from a uid
   * @param {String} uid   the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
  }

  /**
   * (Re)loads the employee information associated with this uid.
   */
  async reload() {
    const res = await getInst().loadEmployeeInfo(this.uid);
    delete res.euid;
    Object.assign(this, res);
  }
}

/**
 * Represents the UTD personnel data
 */
class UTDPersonnel extends Uent {
  /**
   * Creates an UTD personnel from a uid
   * @param {String} uid   the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
  }

  /**
   * (Re)loads the UTD personnel information associated with this uid.
   */
  async reload() {
    const res = await getInst().loadUTDInfo(this.uid);
    delete res.uid;
    Object.assign(this, res);

    const t = UTDPersonnel.types;
    switch (this.uType) {
      case t.STUDENT:
        await doReloadOr(this, 'student', Student.bind(null, this.uid));
        break;
      case t.STAFF:
        await doReloadOr(this, 'staff', Staff.bind(null, this.uid));
        break;
      case t.FACULTY:
        await doReloadOr(this, 'faculty', Faculty.bind(null, this.uid));
        break;
    }
  }

  /**
   * Normalizes and flattens all the properties of a UTD entity into a JSON
   * object.
   * @return {Object} a JSON-able representation of this user.
   */
  normalize() {
    const ret = super.normalize();
    delete ret.staff;
    Object.assign(ret, norm(this.staff));
    delete ret.faculty;
    Object.assign(ret, norm(this.faculty));
    delete ret.student;
    Object.assign(ret, norm(this.student));
    return ret;
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
class Student extends Uent {
  /**
   * Creates an student data from a uid
   * @param {String} uid   the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
  }

  /**
   * Reloads the student information associated with this uid.
   */
  async reload() {
    const res = await getInst().loadStudentInfo(this.uid);
    delete res.suid;
    Object.assign(this, res);
  }
}

/**
 * Represents a faculty. The faculty is allowed a selection of projects (along
 * with the students) to facillate projects of their choosing.
 */
class Faculty extends Uent {
  /**
   * Creates an faculty data from a uid
   * @param {String} uid   the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
  }

  /**
   * (Re)loads the faculty information associated with this uid.
   */
  async reload() {
    const res = await getInst().loadFacultyInfo(this.uid);
    delete res.fuid;
    Object.assign(this, res);
  }
}

/**
 * Represents a staff. The staff is allowed to view all projects as needed. They
 * are not allowed to modify any data.
 */
class Staff extends Uent {
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

