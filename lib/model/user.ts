/* eslint-disable @typescript-eslint/no-use-before-define */

import type * as typ from './usertypes';
import {UTDType as utypes} from './enttypes';
import type * as db from './dbtypes';
import {isNull} from '../util';

export const UTDType = utypes;

/**
 * Syntactical function to reload some field's value or to initialize it if it
 * doesn't exist.
 * @param conn - the DB connection
 * @param obj - the object
 * @param fld - field name to reload/initialize on obj
 * @param Otherwise - the constructor for initialization
 */
async function doReloadOr(conn, obj: object, fld: string,
    Otherwise: () => void): Promise<void> {
  let val = obj[fld];
  if (!val) {
    val = new Otherwise();
    Object.defineProperty(obj, fld, {
      enumerable: true,
      writable: false,
      value: val,
    });
  }
  await val.reload(conn);
}

const norm = (obj): object => obj && obj.normalize();

/**
 * Obtains the list of teams that this user is a member of, including
 * advising/mentor/sponsor/student roles.
 * @param conn - the DB connection
 * @param u - the user to query teams.
 */
async function getMyTeams<T>(conn: db.DatabaseTransaction<T>, u):
    Promise<number[]> {
  const tids: number[] = [];

  // Search for all per-project roles
  const pids = await conn.findManagesProject(u.userID);
  for (const pid of pids) {
    const team = await conn.findProjectAssignedTeam(pid);
    if (isNull(team)) continue;
    tids.push(team);
  }

  // Search for memberOf role
  if (u.isUtd && u.utd.uType === utypes.STUDENT) {
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
abstract class Uent implements typ.Uent {
  uid: number;

  /**
   * Creates a user entity from a uid
   */
  constructor(uid) {
    Object.defineProperty(this, 'uid', {writable: false, value: uid});
  }

  /**
   * @param conn - the DB transaction connection
   */
  abstract async reload<T>(conn: db.DatabaseTransaction<T>): Promise<void>;

  /**
   * Normalizes and flattens all the properties of a user into a JSON object.
   */
  normalize(): this {
    const ret = Object.assign({}, this);
    delete ret.uid;
    return ret;
  }
}

/**
 * Contains the data model information of a user.
 */
export class User extends Uent implements typ.User {
  userID: number;
  fname: string;
  lname: string;
  email: string;
  address: string;
  isUtd: boolean;
  isEmployee: boolean;

  employee: typ.Employee|null;
  utd: typ.UTDPersonnel|null;
  teams: number[];

  /**
   * Creates a user from a uid
   * @param uid - the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
    Object.defineProperty(this, 'teams', {writable: true, value: []});
  }

  /**
   * (Re)loads the user information associated with this uid.
   * @param conn - the DB transaction connection
   */
  async reload<T>(conn: db.DatabaseTransaction<T>): Promise<void> {
    const res = await conn.loadUserInfo(this.uid);
    if (isNull(res)) throw new Error('Failed to load user');
    Object.assign(this, res);
    if (this.isEmployee) {
      await doReloadOr(conn, this, 'employee', Employee.bind(null, this.uid));
    }
    if (this.isUtd) {
      await doReloadOr(conn, this, 'utd', UTDPersonnel.bind(null, this.uid));
    }
    this.teams = await getMyTeams(conn, this);
  }

  /**
   * Normalizes and flattens all the properties of a user into a JSON object.
   */
  normalize(): this {
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
export class Employee extends Uent implements typ.Employee {
  euid: number; // should not be accessed!
  uid: number;
  worksAt: string;
  password: string;
  oneTimePass: boolean;

  /**
   * Creates an employee from a uid
   * @param uid - the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
  }

  /**
   * (Re)loads the employee information associated with this uid.
   * @param conn - the database connection
   */
  async reload<T>(conn: db.DatabaseTransaction<T>): Promise<void> {
    const res = await conn.loadEmployeeInfo(this.uid);
    if (isNull(res)) throw new Error('Failed to load user');
    delete res.euid;
    Object.assign(this, res);
  }

  /**
   * This normalization will also destroy the password hash so that way that
   * never gets leaked out when we send it to the client
   */
  normalize(): this {
    const res = super.normalize();
    delete res.password; // Don't ever leak sensitive password hash!
    return res;
  }
}

/**
 * Represents the UTD personnel data
 */
export class UTDPersonnel extends Uent implements typ.UTDPersonnel {
  uType: typ.UTDType;
  netID: string;
  isAdmin: boolean;
  student: typ.Student;
  faculty: typ.Faculty;
  staff: typ.Staff;

  /**
   * Creates an UTD personnel from a uid
   * @param uid - the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
  }

  /**
   * (Re)loads the UTD personnel information associated with this uid.
   * @param conn - the DB connection
   */
  async reload<T>(conn: db.DatabaseTransaction<T>): Promise<void> {
    const res = await conn.loadUTDInfo(this.uid);
    if (isNull(res)) throw new Error('Failed to load user');
    delete res.uid;
    Object.assign(this, res);

    switch (this.uType) {
      case utypes.STUDENT:
        await doReloadOr(conn, this, 'student', Student.bind(null, this.uid));
        break;
      case utypes.STAFF:
        await doReloadOr(conn, this, 'staff', Staff.bind(null, this.uid));
        break;
      case utypes.FACULTY:
        await doReloadOr(conn, this, 'faculty', Faculty.bind(null, this.uid));
        break;
    }
  }

  /**
   * Normalizes and flattens all the properties of a UTD entity into a JSON
   * object.
   */
  normalize(): this {
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

/**
 * Represents a student. The students select projects to do and chooses to join
 * certain teams.
 */
export class Student extends Uent implements typ.Student {
  suid: number; // should not be accessed!
  major: string;
  resume: string;
  memberOf: number;
  skills: string[];

  /**
   * Creates an student data from a uid
   * @param uid - the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
  }

  /**
   * Reloads the student information associated with this uid.
   * @param conn - the DB transaction connection
   */
  async reload<T>(conn: db.DatabaseTransaction<T>): Promise<void> {
    const res = await conn.loadStudentInfo(this.uid);
    if (isNull(res)) throw new Error('Failed to load user');
    delete res.suid;
    Object.assign(this, res);
  }
}

/**
 * Represents a faculty. The faculty is allowed a selection of projects (along
 * with the students) to facillate projects of their choosing.
 */
export class Faculty extends Uent implements typ.Faculty {
  fuid: number; // should not be accessed!
  tid: number;
  choices: number[];

  /**
   * Creates an faculty data from a uid
   * @param uid - the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
  }

  /**
   * (Re)loads the faculty information associated with this uid.
   * @param conn - the DB transaction connection
   */
  async reload<T>(conn: db.DatabaseTransaction<T>): Promise<void> {
    const res = await conn.loadFacultyInfo(this.uid);
    if (isNull(res)) throw new Error('Failed to load user');
    delete res.fuid;
    Object.assign(this, res);
  }
}

/**
 * Represents a staff. The staff is allowed to view all projects as needed. They
 * are not allowed to modify any data.
 */
export class Staff extends Uent {
  /**
   * Creates a staff data from a uid
   * uid - the user ID to associate with this user
   */
  constructor(uid) {
    super(uid);
  }

  /**
   * (Re)loads the faculty information associated with this uid.
   * @param conn - the DB connection
   */
  reload(): Promise<void> {
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

