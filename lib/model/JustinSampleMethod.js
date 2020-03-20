//  Importing Packages
const mysql = require('mysql');
const nodemailer = require('nodemailer');
const fs = require('fs');


//  SQL Insertion Prepared Statements

//  User Entity
($createUser) = {$conn: ('INSERT INTO User (UserID, Fname, Lname, Email, ' +
    'Address, Is_Utd, Is_Employee) VALUES (?, ?, ?, ?, ?, ?, ?)')};
// eslint-disable-next-line max-len
($createUser)=>bind_param('issssii', $UserID, $Fname, $Lname, $Email, $Address, $Is_Utd, $Is_Employee);

//  Project Entity
// eslint-disable-next-line max-len
($createProj) = {$conn: ('INSERT INTO Project (ProjID, Pname, Image, Project_Document, Description, Mentor, Sponsor, Advisor, Status, Is_Visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')};
// eslint-disable-next-line max-len
($createProj)=>bind_param('isbbsiiiii', $ProjID, $Pname, $Image, $Project_Document, $Description, $Mentor, $Sponsor, $Advisor, $Status, $Is_Visible);

//  UTD Personnel Entity
// eslint-disable-next-line max-len
($createUTDPerson) = {$conn: ('INSERT INTO UTD_Personnel (UID, UType, NetID, Is_Admin) VALUES (?, ?, ?, ?)')};
($createUTDPerson)=>bind_param('iiii', $UID, $Utype, $NetID, $Is_Admin);

//  Skills Entity
// eslint-disable-next-line max-len
($createSkill) = {$conn: ('INSERT INTO Skills (StudID, Skill_Name) VALUES (?, ?)')};
($createSkill)=>bind_param('is', $StudID, $Skill_Name);

//  Faculty Entity
($createFaculty) = {$conn: ('INSERT INTO Faculty (FUID, TID) VALUES (?, ?)')};
($createFaculty)=>bind_param('ii', $FUID, $TID);

//  Student Entity
// eslint-disable-next-line max-len
($createStudent) = {$conn: ('INSERT INTO Student (SUID, Major, Resume, Member_Of) VALUES (?, ?, ?, ?,)')};
($createStudent)=>bind_param('isbi', $SUID, $Major, $Resume, $Member_Of);

//  Employee Entity
// eslint-disable-next-line max-len
($createEmployee) = {$conn: ('INSERT INTO Employee (EUID, Works_At, Password) VALUES (?, ?, ?)')};
($createEmployee)=>bind_param('iss', $EUID, $Works_At, $Password);

//  Company Entity
// eslint-disable-next-line max-len
($createCompany) = {$conn: ('INSERT INTO Company (CName, Logo, Manager) VALUES (?, ?, ?)')};
($createCompany)=>bind_param('sbs', $CName, $Logo, $Manager);

//  Team Entity
//  !!!!!!!!!NOTE: We still need to add the Secret Code attribute
// eslint-disable-next-line max-len
($createTeam) = {$conn: ('INSERT INTO Team (TID, Assigned_Proj, Budget, Leader) VALUES (?, ?, ?, ?)')};
($createTeam)=>bind_param('iiis', $TID, $Assigned_Proj, $Budget, $Leader);

//  Choice Entity
// eslint-disable-next-line max-len
($createChoice) = {$conn: ('INSERT INTO Choice (TID, Rank, PID) VALUES (?, ?, ?)')};
($createChoice)=>bind_param('iii', $TID, $Rank, $PID);

//  Skill Req Entity
// eslint-disable-next-line max-len
($createSkillReq) = {$conn: ('INSERT INTO Skills_Req (PID, Skill_Name) VALUES (?, ?)')};
($createSkillReq)=>bind_param('is', $PID, $Skill_Name);

//  Help Ticket Entity
// eslint-disable-next-line max-len
($createHelpTicket) = {$conn: ('INSERT INTO Help_Ticket (HID, Status, Description, Requestor) VALUES (?, ?, ?, ?)')};
// eslint-disable-next-line max-len
($createHelpTicket)=>bind_param('isss', $HID, $Status, $Description, $Requestor);


//  Template for creating a SQL Query with Node JS

//  SQL Connection Declaration
const con = mysql.createConnection({
  //  Change Login Information as required
  host: 'localhost',
  user: 'username',
  password: 'yourpassowrd',
  database: 'mydb'});

//  OPTIONAL Email alert source
// eslint-disable-next-line no-unused-vars
const transporter = nodemailer.createTransport({
  //  Which service are we using to send the Admin email alerts?
  service: 'gmail',
  auth: {
    user: 'youremail@gmail.com',
    pass: 'yourpassword'}});

//  Email details
// eslint-disable-next-line no-unused-vars
const mailOptions = {
  from: 'youremail@gmail.com',
  to: 'myfriend@yahoo.com',
  subject: 'New Project Added',
  text: 'That was easy!'};

//  Connect to DB, read JSON file and then query DB
con.connect(function(err) {
  //  I need help to implement the promise API
  if (err) throw err;

  //  Reads the file and waits until async read is done before making query
  fs.readFile('file_location.json', (err, data) => {
    if (err) throw err;
    //  Parses JSON file from ints to ASCII chars
    const jsonData = JSON.parse(data);
    //  Assigns the values in the JSON data to the prepared params
    $firstVar = jsonData[key1];
    $secondVar = jsonData[key2];
    $thirdVar = jsonData[key3];
    //  Executes prepared query with supplied data
    ($preparedstmt)=>execute();
    ($preparedstmt)=>execute();
    ($conn)=>close();
  });
});
