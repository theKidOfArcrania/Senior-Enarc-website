const express = require('express');
const asyncHan = require('express-async-handler');

const {getInst} = require('../model/db.js');
const msg = require('../msg.js');
const util = require('../util.js');
const {ft} = util;

const r = new express.Router();

r.post('/help', util.login, asyncHan(async (req, res) => {
  const help = req.bodySan;
  const success = getInst().doTransaction(async (tr) => {
    const id = await tr.findUniqueID('HelpTicket');
    help.hStatus = 'open';
    help.requestor = req.user.userID;
    return await tr.insertHelpTicket(id, help) && {id};
  });
  if (success) {
    res.json(msg.success('Success!', success));
  } else {
    res.json(msg.fail('An unknown error occurred!', 'internal'));
  }
}));

r.put('/help', util.login, asyncHan(async (req, res) => {
  const m = msg.fail('An unknown error occurred!', 'internal');
  const success = getInst().doTransaction(async (tr) => {
    let h;
    try {
      h = await tr.loadHelpTicketInfo(req.bodySan.hid);
    } catch (e) {
      m = msg.fail('Invalid help ticket', 'invalidticket');
      return false;
    }

    // Check user permissions
    if (!(req.user.isUtd && req.user.utd.isAdmin) &&
        h.requestor !== req.user.userID) {
      m = msg.fail('You do not have permissions to modify the help ticket',
          'badperm');
      return false;
    }

    return await tr.alterHelpTicket(h.hid, req.bodySan);
  });

  if (success) m = msg.success('Success!');
  res.json(m);
}));

r.get('/help/list', util.login, asyncHan(async (req, res) => {
  const u = req.user;
  await getInst().doRTransaction(async (tr) => {
    const projs = (await Promise.all((await tr.findAllHelpTickets())
        .map(ft(tr.loadHelpTicketInfo, tr).nice())))
        .filter((h) => h !== null && h.requestor == u.uid)
        .map((h) => h.hid);
    res.json(msg.success('Success', projs));
  });
}));

r.post('/help/list', util.login, asyncHan(async (req, res) => {
  const u = req.user;
  await getInst().doRTransaction(async (tr) => {
    const projs = (await Promise.all(req.bodySan
        .map(ft(tr.loadHelpTicketInfo, tr).nice())))
        .filter((h) => h !== null && h.requestor == u.uid);
    res.json(msg.success('Success', projs));
  });
}));
