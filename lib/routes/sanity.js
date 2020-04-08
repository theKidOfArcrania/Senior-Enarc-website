const express = require('express');
const ct = require('../chktype.js');
const r = new express.Router();

r.post('/login', ct(ct.obj({
  'email': ct.string,
  'password': ct.string,
})));

r.put('/admin/project', ct(ct.obj({
  'projID': ct.int,
  'pName': ct.maybeDefined(ct.string(50)),
  'image': ct.maybeDefined(ct.file),
  'projDoc': ct.maybeDefined(ct.file),
  'pDesc': ct.maybeDefined(ct.string(1000)),
  'status': ct.maybeDefined(ct.string(15)),
  'sponsor': ct.maybeDefined(ct.int),
  'mentor': ct.maybeDefined(ct.int),
  'advisor': ct.maybeDefined(ct.int),
  'visible': ct.maybeDefined(ct.bool),
})));

r.post('/admin/project', ct(ct.obj({
  'pName': ct.string(50),
  'image': ct.file,
  'projDoc': ct.file,
  'pDesc': ct.string(1000),
  'status': ct.string(15),
  'sponsor': ct.int,
  'mentor': ct.int,
  'advisor': ct.int,
  'visible': ct.bool,
})));

module.exports = r;