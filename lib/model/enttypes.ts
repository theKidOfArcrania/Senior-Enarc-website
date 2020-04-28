import type {Some} from '../util';

export type ProjectStatusInfo = {visible: boolean; modifiable: boolean};

export type ID = string|number;


/**
 * This represents an enumeration of all the different statuses that a project
 * can be in.
 */
export enum ProjectStatus {
  SUBMITTED = 'submitted',
  NEEDS_REVISION = 'needs-revision',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

const info = (visible: boolean, modifiable: boolean): ProjectStatusInfo => {
  return {visible, modifiable};
};

const pStats: {[P in ProjectStatus]: ProjectStatusInfo} = {
  [ProjectStatus.SUBMITTED]: info(false, true),
  [ProjectStatus.NEEDS_REVISION]: info(false, true),
  [ProjectStatus.ACCEPTED]: info(true, false),
  [ProjectStatus.REJECTED]: info(false, false),
  [ProjectStatus.ARCHIVED]: info(false, false),
};

export const projectStatuses = new Map<ProjectStatus|string, ProjectStatusInfo>(
    Object.entries(pStats));

/**
 * This represents an enumeration of all the different statuses of a help ticket
 */
export enum HelpTicketStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  RESOLVED = 'resolved',
}

export const ticketStatuses = new Set<HelpTicketStatus|string>(
    Object.keys(HelpTicketStatus));

export enum UTDType {
  STUDENT = 'student',
  STAFF = 'staff',
  FACULTY = 'faculty',
}

export const utdTypes = new Set<UTDType|string>(Object.keys(UTDType));


export interface Company {
  name: string;
  logo: string;
  manager: Some<number>;
}

export interface Users {
  userID: number;
  fname: string;
  lname: string;
  email: string;
  address: string;
  isUtd: boolean;
  isEmployee: boolean;
}

export interface UTDPersonnel {
  uid: number;
  uType: UTDType;
  netID: string;
  isAdmin: boolean;
}

export interface Employee {
  euid: number;
  worksAt: string;
  password: string;
  oneTimePass: boolean;
}

export interface Student {
  suid: number;
  major: string;
  resume: Some<string>;
  memberOf: Some<number>;

  skills: string[];
}

export interface Faculty {
  fuid: number;
  tid: number;

  choices: number[];
}

export interface FacultyOrTeam {
  teamID: number;
  isRegTeam: boolean;
}

export interface Project {
  projID: number;
  pName: string;
  company: string;
  image: Some<string>;
  projDoc: Some<string>;
  pDesc: Some<string>;
  mentor: Some<number>;
  sponsor: Some<number>;
  advisor: Some<number>;
  status: ProjectStatus;
  visible: boolean;

  skillsReq: string[];
}

export interface Team {
  tid: number;
  name: string;
  assignedProj: Some<number>;
  budget: number;
  leader: Some<number>;
  membLimit: number;
  password: Some<string>;
  comments: Some<string>;

  choices: Some<number>[];
}

export interface HelpTicket {
  hid: number;
  hStatus: HelpTicketStatus;
  hDescription: string;
  requestor: Some<number>;
}

export interface Invite {
  inviteID: number;
  expiration: Date;
  company: Some<string>;
  managerFname: Some<string>;
  managerLname: Some<string>;
  managerEmail: Some<string>;
}

export interface Choice {
  tid: number;
  ranking: number;
  pid: Some<number>;
}

export interface Skills {
  stuUID: number;
  skill: string;
}

export interface SkillsReq {
  pid: number;
  skillName: string;
}

interface Ents {
  COMPANY: Company;
  EMPLOYEE: Employee;
  FACULTY: Faculty;
  HELP_TICKET: HelpTicket;
  INVITE: Invite;
  PROJECT: Project;
  STUDENT: Student;
  TEAM: Team;
  USER: Users;
  UTD_PERSONNEL: UTDPersonnel;
}

interface EntsFull extends Ents {
  FACULTY_OR_TEAM: FacultyOrTeam;
  CHOICE: Choice;
  SKILLS: Skills;
  SKILLS_REQ: SkillsReq;
}

export type DB = {[Tbl in keyof Ents]: Ents[Tbl][]}

export enum FieldType {
  DERIVED = 0, REGULAR = 1, PRIMARY_KEY = 2
}

export type Tables = keyof EntsFull;

export type Tables2 = 'User' | 'Project' | 'UTD' | 'Faculty' | 'Student' |
  'Employee' | 'Company' | 'FacultyOrTeam' | 'Team' | 'Choice' | 'HelpTicket' |
  'Invite' | 'UTDPersonnel' | 'Skills' | 'SkillsReq' | 'Users';

/**
 * Get raw typing information for each table
 */
export type Schema<T> = {
  /** The mysql table name */
  tblname: Tables2;
  /** The name used for the respective DB methods */
  mthname: Some<Tables2>;
  /** The full attribute set, including derived and primary key attributes. The
   * value determines the type of field:
   * 0 - derived field
   * 1 - regular field
   * 2 - primary key
   */
  fldSet: {[Fld in keyof T]: FieldType};
};

export const schemas: {[Tbl in Tables]: Schema<EntsFull[Tbl]>} = {
  PROJECT: {
    tblname: 'Project',
    mthname: 'Project',
    fldSet: {
      projID: 2, pName: 1, company: 1, image: 1, projDoc: 1, pDesc: 1,
      mentor: 1, sponsor: 1, advisor: 1, status: 1, visible: 1, skillsReq: 0,
    },
  },
  USER: {
    tblname: 'Users',
    mthname: 'User',
    fldSet: {
      userID: 2, fname: 1, lname: 1, email: 1, address: 1,
      isUtd: 1, isEmployee: 1,
    },
  },
  EMPLOYEE: {
    tblname: 'Employee',
    mthname: 'Employee',
    fldSet: {euid: 2, worksAt: 1, password: 1, oneTimePass: 1},
  },
  UTD_PERSONNEL: {
    tblname: 'UTDPersonnel',
    mthname: 'UTD',
    fldSet: {uid: 2, uType: 1, netID: 1, isAdmin: 1},
  },
  STUDENT: {
    tblname: 'Student',
    mthname: 'Student',
    fldSet: {suid: 2, major: 1, resume: 1, memberOf: 1, skills: 0},
  },
  FACULTY: {
    tblname: 'Faculty',
    mthname: 'Faculty',
    fldSet: {fuid: 2, tid: 1, choices: 0},
  },
  FACULTY_OR_TEAM: {
    tblname: 'FacultyOrTeam',
    mthname: null,
    fldSet: {teamID: 2, isRegTeam: 1},
  },
  TEAM: {
    tblname: 'Team',
    mthname: 'Team',
    fldSet: {
      tid: 2, name: 1, assignedProj: 1, budget: 1, leader: 1, password: 1,
      comments: 1, membLimit: 1, choices: 0,
    },
  },
  COMPANY: {
    tblname: 'Company',
    mthname: 'Company',
    fldSet: {name: 2, logo: 1, manager: 1},
  },
  HELP_TICKET: {
    tblname: 'HelpTicket',
    mthname: 'HelpTicket',
    fldSet: {hid: 2, hStatus: 1, hDescription: 1, requestor: 1},
  },
  INVITE: {
    tblname: 'Invite',
    mthname: 'Invite',
    fldSet: {inviteID: 2, expiration: 1, company: 1, managerFname: 1,
      managerLname: 1, managerEmail: 1},
  },
  CHOICE: {
    tblname: 'Choice',
    mthname: null,
    fldSet: {tid: 2, ranking: 2, pid: 1},
  },
  SKILLS: {
    tblname: 'Skills',
    mthname: null,
    fldSet: {stuUID: 2, skill: 1},
  },
  SKILLS_REQ: {
    tblname: 'SkillsReq',
    mthname: null,
    fldSet: {pid: 2, skillName: 1},
  },
};

/**
 * Obtains a set of fields of a table name that has one of the types specified
 * @param tableName - the name of the table to get fields from
 * @param flds - a vararg of types of fields that wished to be filtered on
 */
export function getFields(tableName: Tables, ...flds: FieldType[]): string[] {
  const attribs: string[] = [];
  for (const [name, fldType] of Object.entries(schemas[tableName].fldSet)) {
    if (flds.includes(fldType)) {
      attribs.push(name);
    }
  }
  return attribs;
}

/**
 * Obtains the (singular) primary key of a table. Note that if this fails then
 * it will throw an runtime error. It is the responsibility of the caller to
 * ensure that the table specified has exactly one primary key
 * @param tableName - the table name.
 */
export function getPrimaryKey(tableName: Tables): string {
  const keys = getFields(tableName, FieldType.PRIMARY_KEY);
  if (keys.length != 1) throw new Error('Not a singular primary key!');
  return keys[0];
}
