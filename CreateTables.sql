drop database if exists CSProjectSystem; create database CSProjectSystem;
use CSProjectSystem;

create table Company (
  name varchar(50) NOT NULL,
  logo varchar(100) NOT NULL,
  manager int,
  PRIMARY KEY (name)
);
create table Users (
	userID int NOT NULL,
  fname varchar(50) NOT NULL,
  lname varchar(50) NOT NULL,
  email varchar(100) NOT NULL UNIQUE,
  address varchar(100) NOT NULL,
  isUtd boolean NOT NULL,
  isEmployee boolean NOT NULL,
  PRIMARY KEY (userID)
);

create table Employee (
  euid int NOT NULL,
  worksAt varchar(50) NOT NULL,
  password varchar(100) NOT NULL,
  oneTimePass boolean NOT NULL,
  PRIMARY KEY (euid),
  FOREIGN KEY (euid) references Users(userID) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (worksAt) references Company(name) ON UPDATE CASCADE
);

create table FacultyOrTeam (
	teamID int NOT NULL,
  isRegTeam boolean NOT NULL,
  PRIMARY KEY (teamID)
);

create table UTDPersonnel (
	uid int NOT NULL,
  uType ENUM('student', 'staff', 'faculty') NOT NULL,
  netID varchar(10) NOT NULL,
  isAdmin boolean NOT NULL,
  PRIMARY KEY (uid),
  FOREIGN KEY (uid) references Users (userID) ON UPDATE CASCADE ON DELETE CASCADE
);

create table Faculty (
	fuid int NOT NULL,
  tid int NOT NULL,
  PRIMARY KEY (fuid),
  FOREIGN KEY (fuid) references UTDPersonnel (uid) ON DELETE CASCADE
    ON UPDATE CASCADE,
  FOREIGN KEY (tid) references FacultyOrTeam (teamID)
    ON UPDATE CASCADE ON DELETE CASCADE
);

create table Student (
	suid int NOT NULL,
  major varchar(30) NOT NULL,
  resume varchar(100),
  memberOf int,
  PRIMARY KEY (suid),
  FOREIGN KEY (suid) references UTDPersonnel (uid)
    ON UPDATE CASCADE ON DELETE CASCADE
);

create table Skills (
  stuUID int NOT NULL,
  skill varchar(50) NOT NULL,
  primary key (stuUID, skill),
  foreign key (stuUID) references Student (suid)
    ON UPDATE CASCADE ON DELETE CASCADE
);

create table Project (
	projID int NOT NULL,
  pName varchar(50) NOT NULL,
  company varchar(50) NOT NULL,
  image varchar(100),
  projDoc varchar(100),
  pDesc varchar(1000),
  mentor int,
  sponsor int,
  advisor int,
  status ENUM('submitted', 'needs-revision', 'accepted', 'rejected',
    'archived') NOT NULL,
  visible boolean NOT NULL,
  PRIMARY KEY (projID),
  FOREIGN KEY (company) references Company (name)
    ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (mentor) references Employee (euid)
    ON UPDATE CASCADE ON DELETE SET NULL,
  FOREIGN KEY (sponsor) references Employee (euid)
    ON UPDATE CASCADE ON DELETE SET NULL,
  FOREIGN KEY (advisor) references Faculty (fuid)
    ON UPDATE CASCADE ON DELETE SET NULL
);

create table Team (
	tid int NOT NULL,
  name varchar(50) NOT NULL UNIQUE,
  assignedProj int NULL UNIQUE,
  budget float NOT NULL,
  leader int,
  membLimit int NOT NULL DEFAULT 5,
  password varchar(100),
  comments varchar(1000),
  PRIMARY KEY (tid),
  FOREIGN KEY (tid) references FacultyOrTeam (teamID)
    ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (assignedProj) references Project (projID)
    ON UPDATE CASCADE ON DELETE SET NULL,
  FOREIGN KEY (leader) references Student (suid)
    ON UPDATE CASCADE ON DELETE SET NULL
);

create table Choice (
	tid int NOT NULL,
  ranking int NOT NULL,
  pid int,
  PRIMARY KEY (tid, ranking),
  FOREIGN KEY (tid) references FacultyOrTeam (teamID)
    ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (pid) references Project (projID)
    ON UPDATE CASCADE ON DELETE SET NULL
);

create table SkillsReq (
	pid int NOT NULL,
  skillName varchar(50) NOT NULL,
	PRIMARY KEY (pid, skillName),
  FOREIGN KEY (pid) references Project (projID)
    ON UPDATE CASCADE ON DELETE CASCADE
);

create table HelpTicket (
	hid int NOT NULL,
  hStatus ENUM('open', 'closed', 'resolved') NOT NULL,
  hDescription varchar(1000) NOT NULL,
  requestor int,
  PRIMARY KEY (hid),
  FOREIGN KEY (requestor) references Users (userID)
    ON UPDATE CASCADE ON DELETE SET NULL
);

create table Invite (
  inviteID int NOT NULL,
  expiration date NOT NULL,
  company varchar(50),
  managerFname varchar(50),
  managerLname varchar(50),
  managerEmail varchar(100),
  PRIMARY KEY (inviteID)
);

alter table Student
add FOREIGN KEY (memberOf) references Team (tid) ON DELETE SET NULL;

alter table Company
add FOREIGN KEY (manager) references Employee(euid) ON DELETE SET NULL;

