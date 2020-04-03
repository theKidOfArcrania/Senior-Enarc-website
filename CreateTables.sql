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
  Euid int NOT NULL,
  worksAt varchar(50) NOT NULL,
  password varchar(100) NOT NULL,
  PRIMARY KEY (Euid),
  FOREIGN KEY (Euid) references Users(UserId) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (worksAt) references Company(name) ON UPDATE CASCADE
);

create table Faculty_Or_Team (
	TeamID int,
  is_reg_team boolean,
  PRIMARY KEY (TeamID)
);

create table UTD_Personnel (
	Uid int,
  uType int NOT NULL,
  netID varchar(10) NOT NULL,
  isAdmin boolean NOT NULL,
  PRIMARY KEY (Uid),
  FOREIGN KEY (Uid) references Users (UserID) ON UPDATE CASCADE ON DELETE CASCADE
);

create table Faculty (
	Fuid int,
  tid int NOT NULL,
  PRIMARY KEY (Fuid),
  FOREIGN KEY (Fuid) references UTD_Personnel (Uid) ON DELETE CASCADE 
    ON UPDATE CASCADE,
  FOREIGN KEY (tid) references Faculty_Or_Team (TeamID)
);

create table Student (
	Suid int,
  major varchar(30) NOT NULL,
  resume varchar(100),
  memberOf int,
  PRIMARY KEY (Suid),
  FOREIGN KEY (Suid) references UTD_Personnel (Uid) 
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
  Is_visible boolean NOT NULL,
  PRIMARY KEY (projID),
  FOREIGN KEY (mentor) references Users (userID),
  FOREIGN KEY (sponsor) references Users (userID),
  FOREIGN KEY (advisor) references Faculty (Fuid)
);

create table Team (
	tid int,
  assignedProj int,
  budget int NOT NULL,
  Leader int,
  PRIMARY KEY (tid),
  FOREIGN KEY (assignedProj) references Project (ProjID) 
    ON UPDATE CASCADE ON DELETE SET NULL,
  FOREIGN KEY (leader) references Student (Suid)
    ON UPDATE CASCADE ON DELETE SET NULL
);

create table Choice (
	Tid int NOT NULL,
  PRank int NOT NULL,
  Pid int,
  PRIMARY KEY (Tid, PRank),
  FOREIGN KEY (Tid) references Faculty_Or_Team (TeamID)
    ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (Pid) references Project (ProjID)
    ON UPDATE CASCADE ON DELETE SET NULL
);

create table Skills_Req (
	Pid int,
  Skill_Name varchar(50),
	PRIMARY KEY (Pid, Skill_Name),
  FOREIGN KEY (Pid) references Project (ProjID)
    ON UPDATE CASCADE ON DELETE CASCADE
);

create table Help_Ticket (
	Hid int,
  HStatus varchar(50),
  HDescription varchar(100),
  Requestor int,
  PRIMARY KEY (Hid),
  FOREIGN KEY (Requestor) references Users (UserID)
);

alter table Student
add FOREIGN KEY (memberOf) references Team (Tid) ON DELETE SET NULL;

alter table Company
add FOREIGN KEY (Manager) references Employee(Euid) ON DELETE SET NULL;
