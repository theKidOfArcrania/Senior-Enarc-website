import * as express from 'express';

import * as ent from '../model/enttypes';
import ct from '../chktype';
import {FnChk} from '../chktype';

const r = express.Router();

r.post('/login', ct(ct.obj({
  email: ct.string(100),
  password: ct.string(64),
})));

r.post('/utdlogin', ct(ct.obj({'email': ct.string(50)})));

r.post('/testlogin', ct(ct.obj({'email': ct.string(50)})));


// Contains a key-value pair of the entity name -> tuple of the primary key
// types and the other field types
const adminEnts: {[P: string]: [[string, FnChk], {[P: string]: FnChk}]} = {
  company: [['name', ct.string(50)], {
    logo: ct.file,
    manager: ct.int,
  }],
  helpticket: [['hid', ct.int], {
    hStatus: ct.enumT(ent.ticketStatuses),
    hDescription: ct.string(100),
    requestor: ct.int,
  }],
  invite: [['inviteID', ct.int], {
    expiration: ct.int,
    company: ct.maybeNull(ct.string(50)),
    managerFname: ct.maybeNull(ct.string(50)),
    managerLname: ct.maybeNull(ct.string(50)),
    managerEmail: ct.maybeNull(ct.string(100)),
  }],
  project: [['projID', ct.int], {
    pName: ct.string(50),
    image: ct.maybeNull(ct.file),
    projDoc: ct.maybeNull(ct.file),
    company: ct.string(50),
    pDesc: ct.string(1000),
    status: ct.enumT(new Set(ent.projectStatuses.keys())),
    sponsor: ct.int,
    mentor: ct.int,
    advisor: ct.maybeNull(ct.int),
    visible: ct.bool,
  }],
  team: [['tid', ct.int], {
    assignedProj: ct.maybeNull(ct.int),
    budget: ct.number,
    leader: ct.maybeNull(ct.int),
    name: ct.string(50),
    membLimit: ct.int,
    password: ct.maybeNull(ct.string(100)),
    comments: ct.string(1000),
    choices: ct.array(ct.int),
  }],
};

for (const [entName, [[pkey, ptyp], spec]] of Object.entries(adminEnts)) {
  const spec2 = {...spec, [pkey]: ptyp};
  r.post(`/admin/${entName}`, ct(ct.obj(spec)));
  r.put(`/admin/${entName}`, ct(ct.maybeDefinedObjExcept(spec2, pkey)));
  r.post(`/admin/${entName}/list`, ct(ct.array(ptyp)));
  r.delete(`/admin/${entName}/list`, ct(ct.array(ptyp)));
}

r.post('/admin/bulk/clearTeams', ct(ct.obj({
  limit: ct.int,
  teams: ct.int,
})));

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

r.put('/project', ct(ct.obj({
  projID: ct.int,
  pName: ct.maybeDefined(ct.string(50)),
  image: ct.maybeDefined(ct.maybeNull(ct.file)),
  projDoc: ct.maybeDefined(ct.maybeNull(ct.file)),
  pDesc: ct.maybeDefined(ct.string(1000)),
})));

r.post('/project/submit', ct(ct.obj({
  pName: ct.string(50),
  image: ct.maybeNull(ct.file),
  projDoc: ct.maybeNull(ct.file),
  pDesc: ct.string(1000),
  sponsor: ct.int,
  mentor: ct.int,
})));

r.post('/help', ct(ct.obj({
  hDescription: ct.string(100),
})));

r.put('/help', ct(ct.obj({
  hid: ct.int,
  hStatus: ct.enumT(ent.ticketStatuses),
  hDescription: ct.string(100),
})));

r.post('/help/list', ct(ct.array(ct.int)));


module.exports = r;
