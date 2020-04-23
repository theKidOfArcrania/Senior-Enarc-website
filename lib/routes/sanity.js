const express = require('express');
const ct = require('../chktype.js');
const r = new express.Router();

r.post('/login', ct(ct.obj({
  email: ct.string(100),
  password: ct.string(64),
})));

r.post('/utdlogin', ct(ct.obj({'email': ct.string(50)})));

r.post('/testlogin', ct(ct.obj({'email': ct.string(50)})));

r.post('/admin/:entity/list', ct(ct.array(ct.int)));
r.delete('/admin/:entity/list', ct(ct.array(ct.int)));

// Contains a key-value pair of the entity name -> tuple of the primary key
// types and the other field types
adminEnts = {
  company: [{name: ct.string(50)}, {
    logo: ct.file,
    manager: ct.int,
  }],
  helpticket: [{hid: ct.int}, {
    hStatus: ct.string(50),
    hDescription: ct.string(100),
    requestor: ct.int,
  }],
  invite: [{inviteID: ct.int}, {
    expiration: ct.int,
    company: ct.maybeNull(ct.string(50)),
    managerFname: ct.maybeNull(ct.string(50)),
    managerLname: ct.maybeNull(ct.string(50)),
    managerEmail: ct.maybeNull(ct.string(100)),
  }],
  project: [{projID: ct.int}, {
    pName: ct.string(50),
    image: ct.file,
    projDoc: ct.file,
    company: ct.string(50),
    pDesc: ct.string(1000),
    status: ct.string(15),
    sponsor: ct.int,
    mentor: ct.int,
    advisor: ct.int,
    visible: ct.bool,
  }],
  team: [{tid: ct.int}, {
    assignedProj: ct.int,
    budget: ct.number,
    leader: ct.int,
    name: ct.string(50),
    membLimit: ct.int,
    password: ct.string(100),
    comments: ct.string(1000),
    choices: ct.array(ct.int),
  }],
};

for (const [entName, [pkey, spec]] of Object.entries(adminEnts)) {
  const spec2 = {...spec, ...pkey};
  r.post(`/admin/${entName}`, ct(ct.obj(spec)));
  r.put(`/admin/${entName}`, ct(ct.maybeDefinedObjExcept(spec2)));
}

r.post('/team', ct(ct.array(ct.int)));

r.put('/team', ct(ct.obj({
  name: ct.maybeDefined(ct.string(50)),
  leader: ct.maybeDefined(ct.int),
  password: ct.maybeDefined(ct.maybeNull(ct.string(64))),
  choices: ct.maybeDefined(ct.array(ct.int)),
  comments: ct.maybeDefined(ct.string(1000)),
})));

r.post('/team/join', ct(ct.obj({
  team: ct.int,
  password: ct.maybeNull(ct.string(64)),
})));

r.delete('/team/member', ct(ct.array(ct.int)));

r.post('/project', ct(ct.array(ct.int)));

r.post('/project/submit', ct(ct.obj({
  pName: ct.string(50),
  image: ct.maybeNull(ct.file),
  projDoc: ct.maybeNull(ct.file),
  pDesc: ct.string(1000),
  sponsor: ct.int,
  mentor: ct.int,
})));

module.exports = r;
