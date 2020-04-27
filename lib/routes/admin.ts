import * as express from 'express';
import {asyncHan} from '../util';

import type {ID} from '../model/enttypes';
import * as db from '../model/dbtypes';
import {getInst} from '../model/db';
import msg from '../msg';
import * as auth from './auth';
import * as util from '../util';

const r = express.Router();
const admin = express.Router();

r.use('/admin/', auth.login, (req, res, next) => {
  const u = req.user;
  if (u.isUtd && u.utd.isAdmin) {
    next();
  } else {
    res.json(msg.fail('You are not an admin!', 'notadmin'));
  }
});

r.use('/admin/', admin);

const trFn = <Args extends any[], DB>(fn: string) =>
  (tr: db.DatabaseTransaction<DB>, ...args: Args): any => tr[fn](...args);

interface RestAPIOptions {
  idField: string;
  parseID: ((string) => util.Some<ID>);
  processInput?: ((o: util.Jsonable) => Promise<util.Jsonable>);
  processOutput?: ((o: db.Entity) => Promise<object>);
  insertFn?: <DB> (tr: db.DatabaseTransaction<DB>, id: ID, ent: any) =>
    Promise<boolean>;
  alterFn?: <DB> (tr: db.DatabaseTransaction<DB>, id: ID, ent: any) =>
    Promise<boolean>;
  loadFn?: <DB> (tr: db.DatabaseTransaction<DB>, id: ID) =>
      Promise<util.Some<db.Entity>>;
  listFn?: <DB> (tr: db.DatabaseTransaction<DB>) => Promise<number[]>;
  deleteFn?: <DB> (tr: db.DatabaseTransaction<DB>, id: ID) => Promise<boolean>;
}

/**
 * Creates a full rest API for some entity type (for the admin). This includes
 * retrival (GET), updating (PUT), creating (POST), and deletion (DELETE), and
 * list retrivals.
 *
 * @param entity - the entity name to create rest API for.
 * @param opts - this is an object of options to customize how each endpoint
 *               should behave. Use the *Fn to define a custom action (the first
 *               argument is the transaction object, and the following arguments
 *               are those normally passed to that action. idField should be the
 *               unique identifier of each entity, and parseID should be a
 *               function that parses a string to ID (and if it fails, returns
 *               NULL).
 */
function restAPIFor(entity, opts: RestAPIOptions): void {
  const entity2 = entity.toLowerCase();
  util.objDefault(opts, 'processInput', util.ident);
  util.objDefault(opts, 'processOutput', util.ident);
  util.objDefault(opts, 'insertFn', trFn(`insert${entity}Info`));
  util.objDefault(opts, 'alterFn', trFn(`alter${entity}Info`));
  util.objDefault(opts, 'loadFn', trFn(`load${entity}Info`));
  util.objDefault(opts, 'listFn', trFn(`findAll${entity}s`));
  util.objDefault(opts, 'deleteFn', trFn(`delete${entity}`));

  // Create a new entity
  admin.post(`/${entity}`, asyncHan(async (req, res) => {
    const data = await opts.processInput(req.bodySan);
    const success = await getInst().doTransaction(async (tr) => {
      const id = await tr.findUniqueID(entity);
      return (await opts.insertFn(tr, id, data)) && {id};
    });
    if (success) {
      res.json(msg.success('Success!', success));
    } else {
      res.json(msg.fail('An unknown error occurred!', 'internal'));
    }
  }));

  // Update an entity
  admin.put(`/${entity2}`, asyncHan(async (req, res) => {
    const data = await opts.processInput(req.bodySan);
    const id: ID = data[opts.idField] as ID;
    delete data[opts.idField];
    const success = await getInst().doTransaction(opts.alterFn, 1000, id, data);
    if (success) {
      res.json(msg.success('Success!'));
    } else {
      res.json(msg.fail('An unknown error occurred!', 'internal'));
    }
  }));

  // Get an entity
  admin.get(`/${entity2}`, asyncHan<{id: string}>(async (req, res) => {
    const id = opts.parseID(req.query.id);
    if (util.isNull(id)) {
      res.json(msg.fail('Invalid request format!', 'badformat'));
      return;
    }

    const ent = await getInst().doRTransaction(opts.loadFn, 1000, id);
    if (util.isNull(ent)) {
      res.json(msg.fail('Cannot find entity', 'notfound'));
    } else {
      res.json(msg.success('Success!', await opts.processOutput(ent)));
    }
  }));

  // Get the list of entities
  admin.get(`/${entity2}/list`, asyncHan(async (req, res) => {
    const lst = await getInst().doRTransaction(opts.listFn);
    res.json(msg.success('Success', lst));
  }));

  // Get information of a list of entities (unfiltered)
  admin.post(`/${entity2}/list`, asyncHan(async (req, res) => {
    const ids = Array.prototype.slice.call(req.bodySan);
    const result = {};
    await getInst().doRTransaction(async (tr) => {
      for (const id of ids) {
        const ent = await opts.loadFn(tr, id).then(opts.processOutput);
        if (util.isNull(ent)) continue;
        result[id] = ent;
      }
    });
    res.json(msg.success('Success', result));
  }));

  // Delete a list of entities (could be only one)
  admin.delete(`/${entity2}/list`, asyncHan(async (req, res) => {
    const ids = Array.prototype.slice.call(req.bodySan);
    const deleted = await getInst().doTransaction(async (tr) => {
      return (await Promise.all(ids.map(async (id) => {
        if (await opts.deleteFn(tr, id)) return id;
        else return null;
      }))).filter((id) => id !== null);
    });
    res.json(msg.success('Success! Here are the IDs deleted.', deleted));
  }));
}

const parseInt2 = (val): number =>
  (((val2): number => Number.isInteger(val2) ? val2 : null)(parseInt(val)));
const chkPass = async <T extends util.Jsonable>(inp: T): Promise<T> => {
  const inp2 = (inp as unknown as {password: any});
  if (!util.isNullOrUndefined(inp2.password)) {
    inp2.password = await util.hashPassword(inp2.password);
  }
  return inp;
};

// TODO: bulk for creating semester roster
admin.post('/bulk/clearTeams', asyncHan(async (req, res) => {
  const {limit, teams} = req.bodySan;
  const success = await getInst().doTransaction(async (tr) => {
    // Delete all teams
    await tr.deleteTeam(null);

    // Add new teams
    for (const i of util.range(teams)) {
      const team = {
        tid: i + 1,
        name: `Group ${i + 1}`,
        budget: 0,
        membLimit: limit,
        password: null,
        comments: null,
      };
      if (!(await tr.insertTeamInfo(team.tid, team))) return false;
    }
    return true;
  });

  if (success) {
    res.json(msg.success('Success!'));
  } else {
    res.json(msg.fail('An unknown error occurred!', 'internal'));
  }
}));

admin.post('/bulk/removeStudents', asyncHan(async (req, res) => {
  await getInst().doTransaction(async (tr) => {
    await tr.deleteAllStudents();
    return true;
  });
  res.json(msg.success('Success!'));
}));

admin.post('/bulk/archiveProjects', asyncHan(async (req, res) => {
  await getInst().doTransaction(async (tr) => {
    await tr.archiveAllProjects();
    return true;
  });
  res.json(msg.success('Success!'));
}));

// TODO: search API for searching member of relations (company, team, project)
restAPIFor('Company', {idField: 'name', parseID: util.ident});
restAPIFor('HelpTicket', {idField: 'hid', parseID: util.ident});
// TODO: set date
restAPIFor('Invite', {idField: 'inviteID', parseID: parseInt2});
restAPIFor('Project', {idField: 'projID', parseID: parseInt2});
restAPIFor('Team', {
  idField: 'tid',
  parseID: parseInt2,
  processInput: chkPass,
});

// TODO: user subclasses
restAPIFor('User', {
  idField: 'userID',
  parseID: parseInt2,
  processInput: chkPass,
  processOutput: (u) => u.normalize(),
});

admin.use((err, req, res, next) => {
  if (err.dberror) {
    if (err.sqlMessage) {
      res.json(msg.fail(`SQL ERR: ${err.code}: ${err.sqlMessage}`, 'internal'));
    } else {
      res.json(msg.fail(`ERR: ${err.message}`, 'internal'));
      console.error(err);
    }
  } else {
    next(err);
  }
});

module.exports = r;
