const express = require('express');
const asyncHan = require('express-async-handler');

const {getInst} = require('../model/db.js');
const msg = require('../msg.js');
const util = require('../util.js');

const r = new express.Router();
const admin = new express.Router();

r.use('/admin/', util.login, (req, res, next) => {
  const u = req.user;
  if (u.isUtd && u.utd.isAdmin) {
    next();
  } else {
    res.json(msg.fail('You are not an admin!', 'notadmin'));
  }
});

r.use('/admin/', admin);

const trFn = (fn) => (tr, ...args) => tr[fn](...args);
/**
 * Creates a full rest API for some entity type (for the admin). This includes
 * retrival (GET), updating (PUT), creating (POST), and deletion (DELETE), and
 * list retrivals.
 *
 * @param {String} entity the entity name to create rest API for.
 * @param {Object} opts   this is an object of options to customize how each
 *                        endpoint should behave. Use the *Fn to define a custom
 *                        action (the first argument is the transaction object,
 *                        and the following arguments are those normally passed
 *                        to that action. idField should be the unique
 *                        identifier of each entity, and parseID should be a
 *                        function that parses a string to ID (and if it fails,
 *                        returns NULL).
 */
function restAPIFor(entity, opts = {}) {
  const entity2 = entity.toLowerCase();
  util.objDefault(opts, 'processInput', util.ident);
  util.objDefault(opts, 'processOutput', util.ident);
  util.objDefault(opts, 'insertFn', trFn(`insert${entity}Info`));
  util.objDefault(opts, 'alterFn', trFn(`alter${entity}Info`));
  util.objDefault(opts, 'loadFn', trFn(`load${entity}Info`));
  util.objDefault(opts, 'listFn', trFn(`findAll${entity}s`));
  util.objDefault(opts, 'deleteFn', trFn(`delete${entity}`));
  if (!opts.idField) throw new Error('Must have opts.idField');
  if (!opts.parseID) throw new Error('Must have opts.parseID');

  // Create a new entity
  admin.post(`/${entity}`, asyncHan(async (req, res) => {
    const data = await opts.processInput(req.bodySan);
    const success = await getInst().doTransaction(async (tr) => {
      const id = await tr.findUniqueID(entity);
      return (await tr[opts.insertFn](id, data)) && {id};
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
    const id = data[opts.idField];
    delete data[opts.idField];
    const success = await getInst().doTransaction(opts.alterFn, id, data);
    if (success) {
      res.json(msg.success('Success!'));
    } else {
      res.json(msg.fail('An unknown error occurred!', 'internal'));
    }
  }));

  // Get an entity
  admin.get(`/${entity2}`, asyncHan(async (req, res) => {
    const id = opts.parseID(req.query.id);
    if (id === undefined || id === null) {
      res.json(msg.fail('Invalid request format!', 'badformat'));
      return;
    }

    let ent;
    try {
      ent = await getInst().doRTransaction(opts.loadFn, id);
    } catch (e) {
      if (!e.dberror) throw e;
      ent = null;
    }

    if (ent === null) {
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
      await Promise.all(ids.map(async (id) => {
        try {
          result[id] = await opts.loadFn(tr, id).then(opts.processOutput);
        } catch (e) {}
      }));
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

const parseInt2 = (val) =>
  ((val2) => Number.isInteger(val2) ? val2 : null)(parseInt(val));
const chkPass = async (inp) => {
  if (!util.isNullOrUndefined(inp.password)) {
    inp.password = await util.hashPassword(inp.password);
  }
};

// TODO: bulk for creating semester roster
admin.post('/bulk/clearTeams', asyncHan(async (req, res) => {
  const {limit, teams} = req.bodySan;
  const success = await getInst().doTransaction(async (tr) => {
    // Delete all teams
    tr.deleteTeam(null);

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
restAPIFor('Invite', {idField: 'inviteID', parseID: parseInt2});
restAPIFor('Project', {idField: 'projID', parseID: parseInt2});
restAPIFor('Team', {
  idField: 'tid',
  parseID: parseInt2,
  processInput: chkPass,
});
// TODO: user subclasses
restAPIFor('User', {
  idField: 'userId',
  parseID: parseInt2,
  processInput: chkPass,
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
