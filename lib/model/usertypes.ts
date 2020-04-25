import type * as db from './dbtypes';
import type * as ent from './enttypes';

export type {UTDType} from './enttypes';


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

export interface User extends ent.Users, Uent {
  teams: number[];
  employee: Employee|null;
  utd: UTDPersonnel|null;
}

export interface UTDPersonnel extends Uent, ent.UTDPersonnel {
  student: Student;
  faculty: Faculty;
  staff: Staff;
}

export interface Employee extends Uent, ent.Employee { }
export interface Student extends Uent, ent.Student { }
export type Staff = Uent;
export interface Faculty extends Uent, ent.Faculty { }

declare global {
  namespace Express { // eslint-disable-line @typescript-eslint/no-namespace
    interface Request {
      user: User;
      employee: Employee;
      student: Student;
      bodySan: any;
    }
  }
}

