import type * as db from './dbtypes';

export enum UTDType {
  STUDENT = 'student',
  STAFF = 'staff',
  FACULTY = 'faculty',
}

export interface User {
  userID: number;
  uid: number;
  fname: string;
  lname: string;
  email: string;
  address: string;
  isUtd: boolean;
  isEmployee: boolean;
  teams: number[];

  employee: Employee|null;
  utd: UTDPersonnel|null;
}

export interface Uent {
  uid: number;

  /*
   * @param conn - the DB transaction connection
   */
  reload<T>(conn: db.DatabaseTransaction<T>): Promise<void>;

  /**
   * Normalizes and flattens all the properties of a user into a JSON object.
   */
  normalize(): this;
}

export interface UTDPersonnel extends Uent {
  uType: UTDType;
  netID: string;
  isAdmin: boolean;

  student: Student;
  faculty: Faculty;
  staff: Staff;
}

export interface Employee extends Uent {
  worksAt: string;
  password: string;
}

export interface Student extends Uent {
  major: string;
  resume: string;
  memberOf: number;
}

export type Staff = Uent;

export interface Faculty extends Uent {
  tid: number;
}

declare global {
  namespace Express { // eslint-disable-line @typescript-eslint/no-namespace
    interface Request {
      user: User;
      employee: Employee;
      student: Student;
    }
  }
}

