create database CSProjectSystem;

use CSProjectSystem;

create table users (
	UserID int,
    Fname varchar(50) NOT NULL,
    Lname varchar(50) NOT NULL,
    Email varchar(30) NOT NULL,
    Address varchar(100) NOT NULL,
    is_utd boolean NOT NULL,
    is_employee boolean NOT NULL,
    PRIMARY KEY (UserID)
);

create table Faculty_Or_Team (
	TeamID int,
    is_reg_team boolean,
    PRIMARY KEY (TeamID)
);

create table UTD_Personnel (
	Uid int,
    UType varchar(20),
    NetID varchar(10),
    isAdmin boolean,
    PRIMARY KEY (Uid),
    FOREIGN KEY (Uid) references users (UserID)
);

create table Faculty (
	Fuid int,
    Tid int,
    PRIMARY KEY (Fuid),
    FOREIGN KEY (Fuid) references UTD_Personnel (Uid),
    FOREIGN KEY (Tid) references Faculty_Or_Team (TeamID)
);

create table Student (
	Suid int,
    Major varchar(30),
    Stu_Resume blob,
    Member_of int,
    PRIMARY KEY (Suid),
    FOREIGN KEY (Suid) references UTD_Personnel (Uid)
);

create table Project (
	ProjID int,
    Pname varchar(50) NOT NULL,
    Image blob,
    Project_document blob,
    Pdescription varchar(1000),
    Mentor int NOT NULL,
    Sponsor int NOT NULL,
    Advisor int NOT NULL,
    Status varchar(15) NOT NULL,
    Is_visible boolean NOT NULL,
    PRIMARY KEY (ProjID),
    FOREIGN KEY (Mentor) references users (UserID),
    FOREIGN KEY (Sponsor) references users (UserID),
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
	Hid int,
    HStatus varchar(50),
    HDescription varchar(100),
    Requestor int,
    PRIMARY KEY (Hid),
    FOREIGN KEY (Requestor) references users (UserID)
);

alter table Student
add FOREIGN KEY (Member_Of) references Team (Tid);

