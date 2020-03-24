drop database if exists CSProjectSystem;
create database CSProjectSystem;

use CSProjectSystem;

create table Users (
	UserID int NOT NULL AUTO_INCREMENT,
    Fname varchar(50) NOT NULL,
    Lname varchar(50) NOT NULL,
    Email varchar(30) NOT NULL,
    Address varchar(100) NOT NULL,
    is_utd boolean NOT NULL,
    is_employee boolean NOT NULL,
    PRIMARY KEY (UserID)
);

create table Faculty_Or_Team (
	TeamID int AUTO_INCREMENT,
    is_reg_team boolean,
    PRIMARY KEY (TeamID)
);

create table UTD_Personnel (
	Uid int AUTO_INCREMENT,
    UType int NOT NULL,
    NetID varchar(10) NOT NULL,
    isAdmin boolean NOT NULL,
    PRIMARY KEY (Uid),
    FOREIGN KEY (Uid) references Users (UserID)
);

create table Faculty (
	Fuid int AUTO_INCREMENT,
    Tid int NOT NULL,
    PRIMARY KEY (Fuid),
    FOREIGN KEY (Fuid) references UTD_Personnel (Uid),
    FOREIGN KEY (Tid) references Faculty_Or_Team (TeamID)
);

create table Student (
	Suid int,
    Major varchar(30) NOT NULL,
    Stu_Resume varchar(100),
    Member_of int,
    PRIMARY KEY (Suid),
    FOREIGN KEY (Suid) references UTD_Personnel (Uid)
);

create table Project (
	ProjID int AUTO_INCREMENT,
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
    Budget int,
    Leader int,
    PRIMARY KEY (Tid),
    FOREIGN KEY (Assigned_proj) references Project (ProjID),
    FOREIGN KEY (Leader) references Student (Suid)
);

create table Choice (
	Tid int,
    PRank int,
    Pid int,
    PRIMARY KEY (Tid, PRank),
    FOREIGN KEY (Tid) references Faculty_Or_Team (TeamID),
    FOREIGN KEY (Pid) references Project (ProjID)
);

create table Skills_Req (
	Pid int,
    Skill_Name varchar(50),
	PRIMARY KEY (Pid, Skill_Name),
    FOREIGN KEY (Pid) references Project (ProjID)
);

create table Help_Ticket (
	Hid int AUTO_INCREMENT,
    HStatus varchar(50),
    HDescription varchar(100),
    Requestor int,
    PRIMARY KEY (Hid),
    FOREIGN KEY (Requestor) references Users (UserID)
);

alter table Student
add FOREIGN KEY (Member_Of) references Team (Tid);

