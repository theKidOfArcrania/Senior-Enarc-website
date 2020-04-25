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

  employee: Employee|null;
  utd: UTDPersonnel|null;
}

export interface UTDPersonnel {
  uid: number;
  uType: UTDType;
  netID: string;
  isAdmin: boolean;
}

export interface Employee {
  uid: number;
  worksAt: string;
  password: string;
}

export interface Student {
  uid: number;
  major: string;
  resume: string;
  memberOf: number;
}

export interface Faculty {
  uid: number;
  tid: number;
}

declare global {
  namespace Express {
    interface Request {
      user: User;
      employee: Employee;
      student: Student;      
    }
  }
}

