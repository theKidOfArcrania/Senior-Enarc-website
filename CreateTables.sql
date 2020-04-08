drop database if exists csProjectSystem;
create database csProjectSystem;

use csProjectSystem;

create table company (
  name varchar(50) NOT NULL,
  logo varchar(100) NOT NULL,
  manager int,
  PRIMARY KEY (name)
); 
create table users (
	userId int NOT NULL,
  fname varchar(50) NOT NULL,
  lname varchar(50) NOT NULL,
  email varchar(30) NOT NULL UNIQUE,
  address varchar(100) NOT NULL,
  isUtd boolean NOT NULL,
  isEmployee boolean NOT NULL,
  PRIMARY KEY (userId)
);

create table employee (
  euid int NOT NULL,
  worksAt varchar(50) NOT NULL,
  password varchar(100) NOT NULL,
  PRIMARY KEY (euid),
  FOREIGN KEY (euid) references users(userId) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (worksAt) references company(name) ON UPDATE CASCADE
);

create table facultyOrTeam (
	teamID int,
  isRegTeam boolean,
  PRIMARY KEY (teamID)
);

create table utdPersonnel (
	uid int,
  uType int NOT NULL,
  netID varchar(10) NOT NULL,
  isAdmin boolean NOT NULL,
  PRIMARY KEY (uid),
  FOREIGN KEY (uid) references users (userID) ON UPDATE CASCADE ON DELETE CASCADE
);

create table faculty (
	fuid int,
  tid int NOT NULL,
  PRIMARY KEY (fuid),
  FOREIGN KEY (fuid) references utdPersonnel (uid) ON DELETE CASCADE 
    ON UPDATE CASCADE,
  FOREIGN KEY (tid) references facultyOrTeam (teamID)
);

create table student (
	suid int,
  major varchar(30) NOT NULL,
  resume varchar(100),
  memberOf int,
  PRIMARY KEY (suid),
  FOREIGN KEY (suid) references utdPersonnel (uid) 
    ON UPDATE CASCADE ON DELETE CASCADE
);

create table project (
	projID int,
  pName varchar(50) NOT NULL,
  image varchar(100),
  projDoc varchar(100),
  pDesc varchar(1000),
  mentor int NOT NULL,
  sponsor int NOT NULL,
  advisor int NOT NULL,
  status varchar(15) NOT NULL,
<<<<<<< HEAD
  isVisible boolean NOT NULL,
=======
  visible boolean NOT NULL,
>>>>>>> c1cdcb420d5eef0a1ff57033c4789a8782cfcb1b
  PRIMARY KEY (projID),
  FOREIGN KEY (mentor) references users (userID),
  FOREIGN KEY (sponsor) references users (userID),
  FOREIGN KEY (advisor) references faculty (fuid)
);

create table team (
	tid int,
  assignedProj int,
  budget int NOT NULL,
  leader int,
  PRIMARY KEY (tid),
  FOREIGN KEY (assignedProj) references project (projID) 
    ON UPDATE CASCADE ON DELETE SET NULL,
  FOREIGN KEY (leader) references student (suid)
    ON UPDATE CASCADE ON DELETE SET NULL
);

create table choice (
	tid int NOT NULL,
  pRank int NOT NULL,
  pid int,
  PRIMARY KEY (tid, pRank),
  FOREIGN KEY (tid) references facultyOrTeam (teamID)
    ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (pid) references project (projID)
    ON UPDATE CASCADE ON DELETE SET NULL
);

create table skillsReq (
	pid int,
  skillName varchar(50),
	PRIMARY KEY (pid, skillName),
  FOREIGN KEY (pid) references project (projID)
    ON UPDATE CASCADE ON DELETE CASCADE
);

create table helpTicket (
	hid int,
  hStatus varchar(50),
  hDescription varchar(100),
  requestor int,
  PRIMARY KEY (hid),
  FOREIGN KEY (requestor) references users (userID)
);

alter table student
add FOREIGN KEY (memberOf) references team (tid) ON DELETE SET NULL;

alter table company
add FOREIGN KEY (manager) references employee(euid) ON DELETE SET NULL;
