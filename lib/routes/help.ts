import * as express from 'express';
import {asyncHan} from '../util';

import * as ent from '../model/enttypes';
import * as db from '../model/dbtypes';
import {getInst} from '../model/db';
import msg from '../msg';
import * as auth from './auth';
import {isNull} from '../util';

type DBTrans<DB> = db.DatabaseTransaction<DB>;

const r = express.Router();

r.post('/help', auth.login, asyncHan(async (req, res) => {
  const help = req.bodySan;
  const success = getInst().doTransaction(async (tr) => {
    const id = await tr.findUniqueID('HelpTicket');
    help.hStatus = 'open';
    help.requestor = req.user.userID;
    return await tr.insertHelpTicketInfo(id, help) && {id};
  });
  if (success) {
    res.json(msg.success('Success!', success));
  } else {
    res.json(msg.fail('An unknown error occurred!', 'internal'));
  }
}));

r.put('/help', auth.login, asyncHan(async (req, res) => {
  let m = msg.fail('An unknown error occurred!', 'internal');
  const success = getInst().doTransaction(async (tr) => {
    let h;
    try {
      h = await tr.loadHelpTicketInfo(req.bodySan.hid);
    } catch (e) {
      m = msg.fail('Invalid help ticket', 'badticket');
      return false;
    }

    // Check user permissions
    if (!(req.user.isUtd && req.user.utd.isAdmin) &&
        h.requestor !== req.user.userID) {
      m = msg.fail('You do not have permissions to modify the help ticket',
          'badperm');
      return false;
    }

    return await tr.alterHelpTicketInfo(h.hid, req.bodySan);
  });

  if (success) m = msg.success('Success!');
  res.json(m);
}));

r.get('/help/list', auth.login, asyncHan(async (req, res) => {
  const u = req.user;
  await getInst().doRTransaction(async (tr) => {
    const ticks: number[] = [];
    for (const hid of await tr.findAllHelpTickets()) {
      const h = await tr.loadHelpTicketInfo(hid);
      if (isNull(h) || h.requestor !== u.uid) continue;
      ticks.push(hid);
    }
    res.json(msg.success('Success', ticks));
  });
}));

r.post('/help/list', auth.login, asyncHan(async (req, res) => {
  const u = req.user;
  await getInst().doRTransaction(async (tr) => {
    const ticks: ent.HelpTicket[] = [];
    for (const hid of await tr.findAllHelpTickets()) {
      const h = await tr.loadHelpTicketInfo(hid);
      if (isNull(h) || h.requestor !== u.uid) continue;
      ticks.push(h);
    }
    res.json(msg.success('Success', ticks));
  });
}));
