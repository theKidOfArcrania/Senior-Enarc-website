import type {Some} from '../util';

export type ProjectStatusInfo = {visible: boolean; modifiable: boolean};


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

export interface Employee {
  euid: number;
  worksAt: string;
  password: string;
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
  assignedProj: number;
  budget: number;
  leader: number;
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
