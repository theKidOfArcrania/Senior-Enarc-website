drop database if exists CSProjectSystem;
create database CSProjectSystem;

use CSProjectSystem;

create table Company (
  Cname varchar(50) NOT NULL,
  Logo varchar(100) NOT NULL,
  Manager int,
  PRIMARY KEY (Cname)
); 
create table Users (
	UserID int NOT NULL,
  Fname varchar(50) NOT NULL,
  Lname varchar(50) NOT NULL,
  Email varchar(30) NOT NULL UNIQUE,
  Address varchar(100) NOT NULL,
  is_utd boolean NOT NULL,
  is_employee boolean NOT NULL,
  PRIMARY KEY (UserID)
);

create table Employee (
  Euid int NOT NULL,
  Works_at varchar(50) NOT NULL,
  Password varchar(100) NOT NULL,
  PRIMARY KEY (Euid),
  FOREIGN KEY (Euid) references Users(UserId) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (Works_at) references Company(Cname) ON UPDATE CASCADE
);

create table Faculty_Or_Team (
	TeamID int,
  is_reg_team boolean,
  PRIMARY KEY (TeamID)
);

create table UTD_Personnel (
	Uid int,
  UType int NOT NULL,
  NetID varchar(10) NOT NULL,
  isAdmin boolean NOT NULL,
  PRIMARY KEY (Uid),
  FOREIGN KEY (Uid) references Users (UserID) ON UPDATE CASCADE ON DELETE CASCADE
);

create table Faculty (
	Fuid int,
  Tid int NOT NULL,
  PRIMARY KEY (Fuid),
  FOREIGN KEY (Fuid) references UTD_Personnel (Uid) ON DELETE CASCADE 
    ON UPDATE CASCADE,
  FOREIGN KEY (Tid) references Faculty_Or_Team (TeamID)
);

create table Student (
	Suid int,
  Major varchar(30) NOT NULL,
  Stu_Resume varchar(100),
  Member_of int,
  PRIMARY KEY (Suid),
  FOREIGN KEY (Suid) references UTD_Personnel (Uid) 
    ON UPDATE CASCADE ON DELETE CASCADE
);

create table Project (
	ProjID int,
  Pname varchar(50) NOT NULL,
  Image varchar(100),
  Project_document varchar(100),
  Pdescription varchar(1000),
  Mentor int NOT NULL,
  Sponsor int NOT NULL,
  Advisor int NOT NULL,
  Status varchar(15) NOT NULL,
  Is_visible boolean NOT NULL,
  PRIMARY KEY (ProjID),
  FOREIGN KEY (Mentor) references Users (UserID),
  FOREIGN KEY (Sponsor) references Users (UserID),
  FOREIGN KEY (Advisor) references Faculty (Fuid)
);

create table Team (
	Tid int,
  Assigned_proj int,
  Budget int NOT NULL,
  Leader int,
  PRIMARY KEY (Tid),
  FOREIGN KEY (Assigned_proj) references Project (ProjID) 
    ON UPDATE CASCADE ON DELETE SET NULL,
  FOREIGN KEY (Leader) references Student (Suid)
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
add FOREIGN KEY (Member_of) references Team (Tid) ON DELETE SET NULL;

alter table Company
add FOREIGN KEY (Manager) references Employee(Euid) ON DELETE SET NULL;
