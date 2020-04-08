drop database if exists CSProjectSystem;
create database CSProjectSystem;

use CSProjectSystem;

create table Company (
  name varchar(50) NOT NULL,
  logo varchar(100) NOT NULL,
  manager int,
  PRIMARY KEY (name)
); 
create table Users (
	userId int NOT NULL,
  fname varchar(50) NOT NULL,
  lname varchar(50) NOT NULL,
  email varchar(30) NOT NULL UNIQUE,
  address varchar(100) NOT NULL,
  isUtd boolean NOT NULL,
  isEmployee boolean NOT NULL,
  PRIMARY KEY (userId)
);

create table Employee (
  euid int NOT NULL,
  worksAt varchar(50) NOT NULL,
  password varchar(100) NOT NULL,
  PRIMARY KEY (euid),
  FOREIGN KEY (euid) references Users(userId) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (worksAt) references Company(name) ON UPDATE CASCADE
);

create table FacultyOrTeam (
	teamID int,
  isRegTeam boolean,
  PRIMARY KEY (teamID)
);

create table UTDPersonnel (
	uid int,
  uType int NOT NULL,
  netID varchar(10) NOT NULL,
  isAdmin boolean NOT NULL,
  PRIMARY KEY (uid),
  FOREIGN KEY (uid) references Users (userID) ON UPDATE CASCADE ON DELETE CASCADE
);

create table Faculty (
	fuid int,
  tid int NOT NULL,
  PRIMARY KEY (fuid),
  FOREIGN KEY (fuid) references UTDPersonnel (uid) ON DELETE CASCADE 
    ON UPDATE CASCADE,
  FOREIGN KEY (tid) references FacultyOrTeam (teamID)
);

create table Student (
	suid int,
  major varchar(30) NOT NULL,
  resume varchar(100),
  memberOf int,
  PRIMARY KEY (suid),
  FOREIGN KEY (suid) references UTDPersonnel (uid) 
    ON UPDATE CASCADE ON DELETE CASCADE
);

create table Project (
	projID int,
  pName varchar(50) NOT NULL,
  image varchar(100),
  projDoc varchar(100),
  pDesc varchar(1000),
  mentor int NOT NULL,
  sponsor int NOT NULL,
  advisor int NOT NULL,
  status varchar(15) NOT NULL,
  visible boolean NOT NULL,
  PRIMARY KEY (projID),
  FOREIGN KEY (mentor) references Users (userID),
  FOREIGN KEY (sponsor) references Users (userID),
  FOREIGN KEY (advisor) references Faculty (fuid)
);

create table Team (
	tid int,
  assignedProj int,
  budget int NOT NULL,
  leader int,
  PRIMARY KEY (tid),
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
	pid int,
  skillName varchar(50),
	PRIMARY KEY (pid, skillName),
  FOREIGN KEY (pid) references Project (projID)
    ON UPDATE CASCADE ON DELETE CASCADE
);

create table HelpTicket (
	hid int,
  hStatus varchar(50),
  hDescription varchar(100),
  requestor int,
  PRIMARY KEY (hid),
  FOREIGN KEY (requestor) references Users (userID)
);

alter table student
add FOREIGN KEY (memberOf) references Team (tid) ON DELETE SET NULL;

alter table company
add FOREIGN KEY (manager) references Employee(euid) ON DELETE SET NULL;
