/* eslint-disable no-invalid-this */

import * as request from 'supertest';
import * as assert from 'assert';
import type * as http from 'http';
import {CookieAccessInfo as cookacc} from 'cookiejar';

import type msg from '../lib/msg';
import * as ent from '../lib/model/enttypes';
import * as db from '../lib/model/db';
import * as loader from '../test/data/loader';
import type * as utyp from '../lib/model/usertypes';
import config from '../lib/config';

config.TESTING = true;
config.IFACE = {
  host: 'localhost',
  port: 1337,
};
config.UPLOAD.debug = false;
import initServer from '../lib/server';

import * as util from '../lib/util';
import {getInst} from '../lib/model/db';
import loadIntoDB from './data/loader';

// Since all our requests are synchronous!
util.Reentrant.prototype.tryLock = async function(): Promise<boolean> {
  if (this.locked) {
    throw new Error('Deadlock warning!');
  } else {
    this.locked = true;
  }
  return true;
};

const emDowley = 'adowley0@myspace.com';
const emBrown = 'tbrownjohn7@cdbaby.com';
const emStennes = 'hstennesa@cmu.edu';
const emVivianne = 'vweine4@ox.ac.uk';
const emDarline = 'deric8@un.org';
const emCattermoul = 'mcattermoul1@photobucket.com';
const emKrystal = 'kfurlow5@china.com.cn';
const emTiff = 'tlezemereh@ftc.gov';
const emDonne = 'ldonnei@seesaa.net';

const emBrownPass =
    'e2fb7d22771b5e55d4707630c62420eea3a2904847f290eea627a7b9e7ded495';

const uspecs = {
  [emBrown]: {isAdmin: true, isUtd: true, isEmployee: true, uType: 'faculty'},
  [emDowley]: {isAdmin: false, isUtd: true, isEmployee: true, uType: 'student'},
  [emStennes]: {isAdmin: false, isUtd: true, isEmployee: false, uType: 'staff'},
  [emDarline]: {
    isAdmin: false, isUtd: true, isEmployee: true, uType: 'student',
  },
  [emVivianne]: {isAdmin: false, isUtd: false, isEmployee: true, uType: null},
  [emCattermoul]: {
    isAdmin: false, isUtd: true, isEmployee: false, uType: 'student',
  },
  [emKrystal]: {isAdmin: true, isUtd: true, isEmployee: true, uType: 'student'},
  [emTiff]: {isAdmin: false, isUtd: true, isEmployee: true, uType: 'faculty'},
  [emDonne]: {isAdmin: false, isUtd: false, isEmployee: true, uType: null},
};

describe('server', function() {
  let server: http.Server;
  let agent: request.SuperTest<request.Test>;

  before(async function() {
    this.timeout(10000);
    server = await initServer();
  });

  after(function() {
    if (server) server.close();
  });

  beforeEach(async function() {
    agent = request.agent(server);
  });

  type JsonBoundFn = (url: string, data?: any) => Promise<msg>;

  type JsonFn = ((mth: string, url: string, data?: any) => Promise<msg>) & {
    get?: JsonBoundFn;
    post?: JsonBoundFn;
    put?: JsonBoundFn;
    delete?: JsonBoundFn;
  };

  /**
   * Makes a JSON ajax request, expecting a JSON response.
   * @param method - the method name
   * @param url - the URL of the request
   * @param data - the data to send if any
   */
  const json: JsonFn = async (method: string, url: string, data?: any):
      Promise<msg> => {
    let req = agent[method.toLowerCase()](url)
        .set('accept', 'json');
    if (data) req = req.type('json').send(data);
    const resp = await req.expect(200);
    return resp.body;
  };

  /**
   * Authenticates with a email using /testlogin endpoint
   * @param email - the email
   */
  async function doLogin(email: string): Promise<void> {
    const r1 = await json.post('/api/v1/testlogin', {email});
    assert(r1.success);
  }

  json.get = json.bind(null, 'GET');
  json.post = json.bind(null, 'POST');
  json.put = json.bind(null, 'PUT');
  json.delete = json.bind(null, 'DELETE');

  /**
   * Extracts the credential information from the user info, identifying at a
   * glance what type of user this is.
   *
   * @param user - the normalized user object
   */
  function getCredsFromUser(user): utyp.UTDPersonnel & utyp.User {
    return util.copyAttribsDef({}, user, {
      isAdmin: false, isEmployee: null, isUtd: null, uType: null,
    }) as utyp.UTDPersonnel & utyp.User;
  }

  describe('test users', function() {
    for (const email of Object.keys(uspecs)) {
      it(email, async function() {
        await doLogin(email);
        const r2 = await json.get('/api/v1/checksess');
        assert(r2.success);
        assert.deepStrictEqual(getCredsFromUser(r2.body), uspecs[email]);
      });
    }
  });

  describe('login', function() {
    it('testlogin fail situation', async function() {
      const r1 = await json.post('/api/v1/testlogin', {
        email: 'bademail@gmail.com',
      });
      assert(!r1.success);
      assert.strictEqual(r1.debug, 'nouser');
    });
    it('by default you\'re not authenticated.', async function() {
      const resp = await json.get('/api/v1/checksess');
      assert(!resp.success);
      assert.strictEqual(resp.debug, 'nologin');
    });

    it('authenticated after login, includes information', async function() {
      await doLogin(emBrown);
      const r2 = await json.get('/api/v1/checksess');
      assert(r2.success);
      assert.deepStrictEqual(getCredsFromUser(r2.body), uspecs[emBrown]);
    });

    it('should authenticate with correct email/password', async function() {
      const r1 = await json.post('/api/v1/login', {
        email: emBrown,
        password: emBrownPass});
      assert(r1.success);
      const r2 = await json.get('/api/v1/checksess');
      assert(r2.success);
      assert.deepStrictEqual(getCredsFromUser(r2.body), uspecs[emBrown]);
    });

    it('should not auth with non employee', async function() {
      const r1 = await json.post('/api/v1/login', {
        email: emStennes,
        password: emBrownPass});
      assert.strictEqual(agent.jar.getCookies(cookacc.All).length, 0);
      assert(!r1.success);
      assert.strictEqual(r1.debug, 'notemployee');
    });

    it('logout should no longer have session', async function() {
      await doLogin(emBrown);
      const r1 = await json.get('/api/v1/checksess');
      assert(r1.success);
      const r2 = await json.post('/api/v1/logout');
      assert(r2.success);
      const r3 = await json.get('/api/v1/checksess');
      assert(!r3.success);
      assert.strictEqual(r3.debug, 'nologin');
    });

    it('should not auth with invalid email', async function() {
      const r1 = await json.post('/api/v1/login', {
        email: 'bademail@gmail.com',
        password: emBrownPass});
      assert.strictEqual(agent.jar.getCookies(cookacc.All).length, 0);
      assert(!r1.success);
      assert.strictEqual(r1.debug, 'nouser');
    });

    it('should not auth with invalid password', async function() {
      const r1 = await json.post('/api/v1/login', {
        email: emBrown,
        password: 'badpass'});
      assert.strictEqual(agent.jar.getCookies(cookacc.All).length, 0);
      assert(!r1.success);
      assert.strictEqual(r1.debug, 'badpassword');
    });

    it('should not login with invalid email', async function() {
      const r1 = await json.post('/api/v1/utdlogin', {
        email: 'bademail@gmail.com',
      });
      assert.strictEqual(agent.jar.getCookies(cookacc.All).length, 0);
      assert(!r1.success);
      assert.strictEqual(r1.debug, 'nouser');
    });

    it('should authenticate utd with correct email', async function() {
      const r1 = await json.post('/api/v1/utdlogin', {
        email: emDowley,
      });
      assert(r1.success);
      const r2 = await json.get('/api/v1/checksess');
      assert(r2.success);
      assert.deepStrictEqual(getCredsFromUser(r2.body), uspecs[emDowley]);
    });
  });

  describe('team', function() {
    describe('/team', function() {
      it('should deny access without login', async function() {
        const r1 = await json.get('/api/v1/team');
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'nologin');
      });
      it('tbrown has no teams', async function() {
        await doLogin(emBrown);
        const r1 = await json.get('/api/v1/team');
        assert(r1.success);
        assert.strictEqual(r1.body, null);
      });
      it('dowley is in team 39', async function() {
        await doLogin(emDowley);
        const r1 = await json.get('/api/v1/team');
        assert(r1.success);
        assert.strictEqual(r1.body.tid, 39);

        let found;
        for (const m of r1.body.members) {
          if (m.userID === 0) {
            found = m;
            break;
          }
        }

        assert(found);
        assert.strictEqual(found.email, emDowley);
      });
      it('Vivianne (non UTD employees) will see first team that they are in',
          async function() {
            await doLogin(emVivianne);
            const r1 = await json.get('/api/v1/team');
            assert(r1.success);
            assert.strictEqual(r1.body.tid, 7);
          });
      it('Vivianne is not in the list of team.members', async function() {
        await doLogin(emVivianne);
        const r1 = await json.get('/api/v1/team');
        assert(r1.success);
        for (const m of r1.body.members) {
          assert.notStrictEqual(m.userID, 6);
        }
      });
      it('dowley can access own teams only', async function() {
        await doLogin(emDowley);
        const r1 = await json.post('/api/v1/team', util.range(0, 53));
        assert(r1.success);
        const teams = Object.keys(r1.body)
            .map((n) => parseInt(n))
            .nsort();
        assert.deepStrictEqual(teams, [6, 39, 42, 50]);
      });
      it('tbrown (admins) can access all teams', async function() {
        await doLogin(emBrown);
        const r1 = await json.post('/api/v1/team', util.range(0, 53));
        assert(r1.success);
        const teams = Object.keys(r1.body)
            .map((n) => parseInt(n))
            .nsort();
        assert.deepStrictEqual(teams, util.range(1, 51));
      });
      it('stennes (staff) can access all teams', async function() {
        await doLogin(emStennes);
        const r1 = await json.post('/api/v1/team', util.range(0, 53));
        assert(r1.success);
        const teams = Object.keys(r1.body)
            .map((n) => parseInt(n))
            .nsort();
        assert.deepStrictEqual(teams, util.range(1, 51));
      });
      it('Vivianne has access to her own teams', async function() {
        await doLogin(emVivianne);
        const r1 = await json.post('/api/v1/team', util.range(0, 53));
        assert(r1.success);
        const teams = Object.keys(r1.body)
            .map((n) => parseInt(n))
            .nsort();
        assert.deepStrictEqual(teams, [7, 39, 49]);
      });
      it('should not alter unless team leader', async function() {
        await doLogin(emCattermoul);
        const r1 = await json.put('/api/v1/team',
            {choices: [8, 9, 5, 2, 4, 12]});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'notteamleader');
      });
      it('should not allow changing team name to ' +
          'already existing team name', async function() {
        await doLogin(emDowley);
        const r1 = await json.put('/api/v1/team',
            {name: 'Group 38'});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'badteamname');
      });
      it('should not make non-member leader', async function() {
        await doLogin(emDowley);
        const r1 = await json.put('/api/v1/team', {leader: 9});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'notinteam');
      });
      it('should not duplicate project choices', async function() {
        await doLogin(emDowley);
        const r1 = await json.put('/api/v1/team',
            {choices: [8, 9, 5, 2, 8, 12]});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'duplicatechoice');
      });
      it('should not have invalid project', async function() {
        await doLogin(emDowley);
        const r1 = await json.put('/api/v1/team',
            {choices: [8, 9, 5, 2, 12, 55]});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'badproj');
      });
      it('should successfully change password ', async function() {
        await doLogin(emDowley);
        const r1 = await json.put('/api/v1/team',
            {password: 'NewPassword'});
        assert(r1.success);
        const r2 = await json.put('/api/v1/team',
            {password: null});
        assert(r2.success);
      });
    });
    describe('/team/member', function() {
      it('should not allow non-leader to remove member', async function() {
        await doLogin(emCattermoul);
        const r1 = await json.delete('/api/v1/team/member',
            [0]);
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'notteamleader');
      });
      it('should not allow leader to remove self', async function() {
        await doLogin(emDowley);
        const r1 = await json.delete('/api/v1/team/member',
            [0]);
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'teamremoveself');
      });
      it('should not allow leader to remove non-member', async function() {
        await doLogin(emDowley);
        const r1 = await json.delete('/api/v1/team/member',
            [4]);
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'notinteam');
      });
      it('should allow leader to remove member', async function() {
        await doLogin(emDowley);
        const r1 = await json.delete('/api/v1/team/member',
            [3]);
        assert(r1.success);
        await doLogin(emCattermoul);
        const r2 = await json.post('/api/v1/team/join', {team: 39,
          password: null});
        assert(r2.success);
      });
      it('must be student to join a team', async function() {
        await doLogin(emBrown);
        const r2 = await json.post('/api/v1/team/join', {team: 39,
          password: null});
        assert(!r2.success);
        assert(r2.debug, 'notstudent');
      });
    });
    describe('/team/list', function() {
      it('should deny access without login', async function() {
        const r1 = await json.get('/api/v1/team/list');
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'nologin');
      });
      it('stennes (staff) can list all teams', async function() {
        await doLogin(emStennes);
        const r1 = await json.get('/api/v1/team/list');
        assert(r1.success);
        assert.deepStrictEqual(r1.body.nsort(),
            util.range(1, 51));
      });
      it('darline gets access to public teams', async function() {
        await doLogin(emDarline);
        const r1 = await json.get('/api/v1/team/list');
        assert(r1.success);
        assert.deepStrictEqual(r1.body.nsort(), util.range(3, 51));
      });
    });
    describe('/team/mylist', function() {
      it('should return teams with member of/mentoring/etc', async function() {
        await doLogin(emDowley);
        const r1 = await json.get('/api/v1/team/mylist');
        assert(r1.success);
        assert.deepStrictEqual(r1.body.nsort(), [6, 39, 42, 50]);
      });
    });
    describe('/team/join', function() {
      it('should return already part of team', async function() {
        await doLogin(emDowley);
        const r1 = await json.post('/api/v1/team/join', {team: 40,
          password: null});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'alreadyjoin');
      });
      it('should return no such team exists', async function() {
        await doLogin(emDarline);
        const r1 = await json.post('/api/v1/team/join', {team: 51,
          password: null});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'badteam');
      });
      it('should return team is full', async function() {
        await doLogin(emDarline);
        const r1 = await json.post('/api/v1/team/join', {team: 39,
          password: null});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'teamfull');
      });
      it('should return team requires a password', async function() {
        await doLogin(emDarline);
        const r1 = await json.post('/api/v1/team/join', {team: 1,
          password: null});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'noteampass');
      });
      it('should return invalid password', async function() {
        await doLogin(emDarline);
        const r1 = await json.post('/api/v1/team/join', {team: 1,
          password: 'null'});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'badteampass');
      });
      it('should return successfully joined team w/o ' +
          'password', async function() {
        await doLogin(emDarline);
        const r1 = await json.post('/api/v1/team/join', {team: 3,
          password: null});
        assert(r1.success);
        const r2 = await json.post('/api/v1/team/leave');
        assert(r2.success);
      });
      it('should return successfully joined team', async function() {
        await doLogin(emDarline);
        const r1 = await json.post('/api/v1/team/join', {team: 2,
          password: 'someotherhash'});
        assert(r1.success);
      });
    });
    describe('/team/leave', async function() {
      it('should make new leader if leader leaves', async function() {
        await doLogin(emDowley);
        const r1 = await json.post('/api/v1/team/leave');
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'teamleader');
      });
      it('should allow student to leave group', async function() {
        await doLogin(emCattermoul);
        const r1 = await json.post('/api/v1/team/leave');
        assert(r1.success);
      });
      it('should fail if student is not in group', async function() {
        await doLogin(emCattermoul);
        const r1: msg = await json.post('/api/v1/team/leave');
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'notinteam');
      });
    });
  });
  describe('project', function() {
    const publicProjs = [1, 2, 5, 6, 10, 15, 16, 18, 19, 24, 25, 28, 33, 35, 36,
      37, 40, 42, 44, 47, 48];
    describe('/project', function() {
      it('should return no projects to view', async function() {
        await doLogin(emBrown);
        const r1 = await json.get('/api/v1/project');
        assert(r1.success);
        assert.strictEqual(r1.body, null);
      });
      it('should return first project for this user', async function() {
        await doLogin(emDowley);
        const r1 = await json.get('/api/v1/project');
        assert(r1.success);
        assert.strictEqual(r1.body.projID, 2);
      });
      it('should show info about public projects', async function() {
        await doLogin(emCattermoul);
        const r1 = await json.post('/api/v1/project',
            util.range(0, 52));
        assert(r1.success);
        const keys = Object.keys(r1.body)
            .map((n) => parseInt(n))
            .nsort();
        assert.deepStrictEqual(keys, publicProjs);
      });
      it('stennes (staff) can access all projects', async function() {
        await doLogin(emStennes);
        const r1 = await json.post('/api/v1/project', util.range(0, 53));
        assert(r1.success);
        const projects = Object.keys(r1.body)
            .map((n) => parseInt(n))
            .nsort();
        assert.deepStrictEqual(projects, util.range(1, 51));
      });
      it('Vivianne only has access to her company projects/ projects she is in',
          async function() {
            await doLogin(emVivianne);
            const r1 = await json.post('/api/v1/project', util.range(0, 53));
            assert(r1.success);
            const projects = Object.keys(r1.body)
                .map((n) => parseInt(n))
                .nsort();
            assert.deepStrictEqual(projects, [4, 7, 23, 34, 36, 37, 39, 49]);
          });
      it('Tiff (faculty only) should have public access on all visible, and ' +
        'full access on those she is advising', async function() {
        const fullAccess = [1, 12, 17, 22, 43, 49];
        const list = [...new Set([...publicProjs, ...fullAccess])];
        list.nsort();

        await doLogin(emTiff);
        const r1 = await json.post('/api/v1/project', util.range(0, 53));
        assert(r1.success);
        const pids = Object.keys(r1.body)
            .map((n) => parseInt(n))
            .nsort();
        assert.deepStrictEqual(pids, list);

        const actualFullAccess = [];
        for (const pid of pids) {
          if ('projDoc' in r1.body[pid]) {
            actualFullAccess.push(pid);
          }
        }
        assert.deepStrictEqual(actualFullAccess, fullAccess);
      });
      it('Project does not exist', async function() {
        await doLogin(emDowley);
        const r1 = await json.put('/api/v1/project',
            {projID: 51, pName: 'NewName'});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'badproj');
      });
      it('should not allow modification of project ' +
          'w/o permissions', async function() {
        await doLogin(emDowley);
        const r1 = await json.put('/api/v1/project',
            {projID: 1, pName: 'NewName'});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'nopermproj');
      });
      it('project cannot be modified', async function() {
        await doLogin(emDowley);
        const r1 = await json.put('/api/v1/project',
            {projID: 2, pName: 'NewName'});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'badstatus');
      });
      it('modified project name', async function() {
        await doLogin(emDowley);
        const r1: msg = await json.put('/api/v1/project',
            {projID: 3, pName: 'NewName'});
        assert(r1.success);
        const r2: msg = await json.post('/api/v1/project', [3]);
        assert(r2.success);
        assert.deepStrictEqual(Object.keys(r2.body), ['3']);
        assert.equal(r2.body[3].pName, 'NewName');
      });
    });
    describe('/project/submit', function() {
      it('should only allow employees to add projects', async function() {
        await doLogin(emCattermoul);
        const r1 = await json.post('/api/v1/project/submit',
            {pName: 'Test', pDesc: 'test test', sponsor: 1, mentor: 4,
              image: null, projDoc: null});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'notemployee');
      });
      it('should successfully add project', async function() {
        await doLogin(emKrystal);
        const proj: Partial<ent.Project> = {
          pName: 'Test', pDesc: 'test test', sponsor: 1, mentor: 4,
          image: null, projDoc: null};
        const r1 = await json.post('/api/v1/project/submit', proj);
        assert(r1.success);

        // Check that it was added
        await doLogin(emBrown);
        const r2 = await json.get('/api/v1/project/list');
        assert(r2.success);
        const added = r2.body.nsort()[r2.body.length - 1];
        const r3 = await json.post('/api/v1/project', [added]);
        assert(r3.success);

        const actual = r3.body[added];
        // TODO: check what happened to userID???
        actual.mentor = actual.mentor.uid;
        actual.sponsor = actual.sponsor.uid;

        proj.visible = false;
        proj.skillsReq = [];
        proj.advisor = null;
        proj.status = ent.ProjectStatus.SUBMITTED;
        proj.company = 'Kwinu';
        proj.projID = added;
        assert.deepStrictEqual(actual, proj);
      });
    });
    describe('/project/mylist', function() {
      it('should return all projects user is part of', async function() {
        await doLogin(emDowley);
        const r1 = await json.get('/api/v1/project/mylist');
        assert(r1.success);
      });
    });
    describe('/project/list', function() {
      it('should return all public projects', async function() {
        await doLogin(emDowley);
        const r1 = await json.get('/api/v1/project/list');
        assert(r1.success);
      });
    });
  });
  let fileID;
  describe('upload', function() {
    const fileBody = 'haha';
    const file = Buffer.from(fileBody, 'utf8');
    it('should fail if we are not logged in', async function() {
      const r: msg = await agent.post('/api/v1/upload')
          .set('accept', 'json')
          .attach('file', file, 'test.jpg')
          .expect(200)
          .then((r) => r.body);
      assert(!r.success);
      assert.strictEqual(r.debug, 'nologin');
    });
    it('should fail if we send no file', async function() {
      await doLogin(emDowley);
      const r: msg = await json.post('/api/v1/upload');
      assert(!r.success);
      assert.strictEqual(r.debug, 'nofile');
    });
    it('should fail if we send file to wrong param', async function() {
      await doLogin(emDowley);
      const r: msg = await agent.post('/api/v1/upload')
          .set('accept', 'json')
          .field('file', 'notafile')
          .attach('files', file, 'test.jpg')
          .expect(200)
          .then((r) => r.body);
      assert(!r.success);
      assert.strictEqual(r.debug, 'nofile');
    });
    it('should fail if we send multiple files', async function() {
      await doLogin(emDowley);
      const r: msg = await agent.post('/api/v1/upload')
          .set('accept', 'json')
          .attach('file', file, 'test.jpg')
          .attach('file', file, 'test2.jpg')
          .expect(200)
          .then((r) => r.body);
      assert(!r.success);
      assert.strictEqual(r.debug, 'multifile');
    });
    it('should should return a name of the file we upload', async function() {
      await doLogin(emDowley);
      const r: msg = await agent.post('/api/v1/upload')
          .set('accept', 'json')
          .attach('file', file, 'test.jpg')
          .expect(200)
          .then((r) => r.body);
      assert(r.success);
      assert(util.isString(r.body.name));

      await agent.get(`/api/v1/file/${r.body.name}`)
          .expect('Content-Disposition', 'attachment; filename="test.jpg"')
          .expect(200, file);
    });
    it('should should strip beginning backslashes', async function() {
      const fileName = '%2f%2ftest.jpg$%!@#$%^;*()__+_*&^%$#@@:\\":';
      await doLogin(emDowley);
      const r: msg = await agent.post('/api/v1/upload')
          .set('accept', 'json')
          .attach('file', file, `/haha/path/${fileName}`)
          .expect(200)
          .then((r) => r.body);
      assert(r.success);
      assert(util.isString(r.body.name));

      await agent.get(`/api/v1/file/${r.body.name}`)
          .expect('Content-Disposition', `attachment; filename="${fileName}"`)
          .expect(200, file);
      fileID = r.body.name;
    });
  });
  describe('admin', function() {
    describe('/admin/', function() {
      it('should not accept non-admin user', async function() {
        await doLogin(emDowley);
        const r1 = await json.get('/api/v1/admin/nonexistent');
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'notadmin');
      });
      describe('admin can create new entities', function() {
        it('should allow admin to create new company', async function() {
          await doLogin(emBrown);
          const r1 = await json.post('/api/v1/admin/company',
              {name: 'testComp', logo: fileID, manager: 0});
          assert(r1.success);
        });
        it('should allow admin to create new helpticket', async function() {
          await doLogin(emBrown);
          const r1 = await json.post('/api/v1/admin/helpticket',
              {hStatus: 'OPEN', hDescription: 'please help', requestor: 3});
          assert(r1.success);
        });
        it('should allow admin to create new invite', async function() {
          await doLogin(emBrown);
          const r1 = await json.post('/api/v1/admin/invite',
              {expiration: '01/01/2021', company: null,
                managerFname: null, managerLname: null, managerEmail: null});
          assert(r1.success);
        });
        it('should allow admin to create new project', async function() {
          await doLogin(emBrown);
          const r1 = await json.post('/api/v1/admin/project',
              {pName: 'Test Proj', image: null, projDoc: null,
                company: 'Shufflebeat', pDesc: 'have fun', status: 'accepted',
                sponsor: 1, mentor: 1, advisor: null, visible: true});
          assert(r1.success);
        });
        it('should allow admin to create new team', async function() {
          await doLogin(emBrown);
          const r1 = await json.post('/api/v1/admin/team',
              {assignedProj: null, budget: 1000, leader: null,
                name: 'Team 99', membLimit: 5, password: null, comments: 'none',
                choices: [0, 1, 2]});
          assert(r1.success);
        });
      });
      describe('admin can update entities', function() {
        it('should not allow empty modification', async function() {
          await doLogin(emBrown);
          const r1 = await json.put('/api/v1/admin/company');
          assert(!r1.success);
          assert.strictEqual(r1.debug, 'empty');
        });
        // it('should allow admin to modify company', async function() {
        //   await doLogin(emBrown);
        //   const r1 = await json.put('/api/v1/admin/company',
        //       [['name', 'Shufflebeat'], {name: 'Shufflebeat',
        //         logo: fileID, manager: 1}]);
        //   assert(r1.success);
        // });
      });
    });
  });
  // Load back into DB after mass deletenop
  // db.getInst().doTransaction(async function(tr) {
  //           loadIntoDB(tr);
  //           return true;
  //         });
  describe('company', function() {
    const chkNonEmps = (it: Mocha.TestFunction, method: Function, ...args):
        void => {
      it('non employees should not have access', async function() {
        await doLogin(emStennes);
        const r: msg = await method(...args);
        assert(!r.success);
        assert.strictEqual(r.debug, 'notemployee');
      });
    };
    describe('/company', function() {
      chkNonEmps(it, json.get, '/api/v1/company');
    });
    describe('/company/people', function() {
      describe('GET', function() {
        chkNonEmps(it, json.get, '/api/v1/company/people?id=3');
        it('requires id parameter', async function() {
          await doLogin(emVivianne);
          const r: msg = await json.get('/api/v1/company/people');
          assert(!r.success);
          assert.strictEqual(r.debug, 'badformat');
        });
        it('Vivanne can see employees in her company', async function() {
          await doLogin(emVivianne);
          const r: msg = await json.get('/api/v1/company/people?id=18');
          assert(r.success);
          const spc = Object.assign({email: emDonne}, uspecs[emDonne]);
          const actual: any = util.copyAttribs({}, r.body, Object.keys(spc));
          if (!actual.isAdmin) actual.isAdmin = false;
          assert.deepStrictEqual(actual, spc);
        });
        it('Bad employee ID', async function() {
          await doLogin(emVivianne);
          const r: msg = await json.get('/api/v1/company/people?id=1337');
          assert(r.success);
          assert.strictEqual(r.body, null);
        });
        it('Vivanne cannot see employees not in her company', async function() {
          await doLogin(emVivianne);
          const r: msg = await json.get('/api/v1/company/people?id=19');
          assert(r.success);
          assert.strictEqual(r.body, null);
        });
      });
      describe('POST', function() {
        const newEmp = {
          fname: 'Lilly',
          lname: 'Fu',
          email: 'lilfu@enarc.org',
          address: null,
        };
        chkNonEmps(it, json.post, '/api/v1/company/people', newEmp);
        it('Vivianne (non-manager) cannot add new employee', async function() {
          await doLogin(emVivianne);
          const r: msg = await json.post('/api/v1/company/people', newEmp);
          assert(!r.success);
          assert.strictEqual(r.debug, 'notmanager');
        });
        it('Cannot add employee with same email', async function() {
          await doLogin(emKrystal);
          const r: msg = await json.post('/api/v1/company/people', {
            fname: 'Brownian',
            lname: 'Motion',
            email: emBrown,
            address: '1234 Physics Street',
          });
          assert(!r.success);
          assert.strictEqual(r.debug, 'bademail');
        });
        it('Krystal (manager) can add new employee', async function() {
          await doLogin(emKrystal);
          const r: msg = await json.post('/api/v1/company/people', newEmp);
          assert(r.success);
          assert(util.isNumber(r.body.id));
          const r2: msg = await json.get('/api/v1/company/people?id=' +
              r.body.id);
          assert(r2.success);

          const expect = Object.assign({
            worksAt: loader.db.EMPLOYEE.get(7).worksAt,
            isEmployee: true,
            isUtd: false,
            oneTimePass: true,
          }, newEmp);
          const actual = util.copyAttribs({}, r2.body, Object.keys(expect));
          assert.deepStrictEqual(actual, expect);
          await db.getInst().doRTransaction(async (tr) => {
            const emp = await tr.loadEmployeeInfo(r.body.id);
            if (util.isNull(emp)) {
              assert.fail('Employee not in DB');
              return;
            }
            assert(await util.chkPassword(r.body.password, emp.password));
          });
        });
      });
      describe('PUT', function() {
        const change = {
          userID: 18,
          email: emBrown,
          address: 'Some address',
        };
        chkNonEmps(it, json.put, '/api/v1/company/people', change);
        it('Vivianne (non manager) cannot modify employees', async function() {
          await doLogin(emVivianne);
          const r: msg = await json.put('/api/v1/company/people', change);
          assert(!r.success);
          assert.strictEqual(r.debug, 'notmanager');
        });
        it('Krystal (manager) cannot modify other company', async function() {
          await doLogin(emKrystal);
          const r: msg = await json.put('/api/v1/company/people', change);
          assert(!r.success);
          assert.strictEqual(r.debug, 'baduid');
        });
        it('Cannot change employee to have dup email', async function() {
          await doLogin(emDonne);
          const r: msg = await json.put('/api/v1/company/people', change);
          assert(!r.success);
          assert.strictEqual(r.debug, 'bademail');
        });
        it('Bad uid modify should error', async function() {
          await doLogin(emDonne);
          const r: msg = await json.put('/api/v1/company/people',
              {userID: 1012});
          assert(!r.success);
          assert.strictEqual(r.debug, 'baduid');
        });
        it('Empty modify should error', async function() {
          await doLogin(emKrystal);
          const r: msg = await json.put('/api/v1/company/people',
              {userID: 7});
          assert(!r.success);
          assert.strictEqual(r.debug, 'empty');
        });
        it('Successfully changes email and address', async function() {
          await doLogin(emDonne);
          change.email = 'someotheremail';
          const r: msg = await json.put('/api/v1/company/people', change);
          assert(r.success);

          const r2: msg = await json.get('/api/v1/company/people?id=' +
              change.userID);
          assert(r2.success);
          const actual = util.copyAttribs({}, r2.body, Object.keys(change));
          assert.deepStrictEqual(actual, change);

          change.email = emDonne; // Change it back
          const r3: msg = await json.put('/api/v1/company/people', change);
          assert(r3.success);
        });
      });
    });
    describe('/company/people/list', function() {
      describe('GET', function() {
        chkNonEmps(it, json.get, '/api/v1/company/people/list');
        it('Donne should get employees in same company', async function() {
          await doLogin(emDonne);
          const r: msg = await json.get('/api/v1/company/people/list');
          assert(r.success);
          assert(util.isArray(r.body));
          const ids = r.body.map((n) => parseInt(n)).nsort();
          assert.deepStrictEqual(ids, [6, 18]);
        });
        it('Vivianne should get employees in same company', async function() {
          await doLogin(emVivianne);
          const r: msg = await json.get('/api/v1/company/people/list');
          assert(r.success);
          assert(util.isArray(r.body));
          const ids = r.body.map((n) => parseInt(n)).nsort();
          assert.deepStrictEqual(ids, [6, 18]);
        });
      });
      describe('POST', function() {
        chkNonEmps(it, json.post, '/api/v1/company/people/list', [0]);
        it('Donne should get employees in same company', async function() {
          await doLogin(emDonne);
          const r: msg = await json.post('/api/v1/company/people/list',
              util.range(50));
          assert(r.success);
          const ids = Object.keys(r.body).map((n) => parseInt(n)).nsort();
          assert.deepStrictEqual(ids, [6, 18]);
        });
        it('Vivianne should get employees in same company', async function() {
          await doLogin(emVivianne);
          const r: msg = await json.post('/api/v1/company/people/list',
              util.range(50));
          assert(r.success);
          const ids = Object.keys(r.body).map((n) => parseInt(n)).nsort();
          assert.deepStrictEqual(ids, [6, 18]);
        });
        it('Vivianne should get one employee', async function() {
          await doLogin(emVivianne);
          const r: msg = await json.post('/api/v1/company/people/list', [6]);
          assert(r.success);
          const ids = Object.keys(r.body).map((n) => parseInt(n)).nsort();
          assert.deepStrictEqual(ids, [6]);
        });
      });
      describe('DELETE', function() {
        chkNonEmps(it, json.delete, '/api/v1/company/people/list', [0]);
        it('Vivianne (non manager) cannot delete emps', async function() {
          await doLogin(emVivianne);
          const r: msg = await json.delete('/api/v1/company/people/list',
              util.range(50));
          assert(!r.success);
          assert.strictEqual(r.debug, 'notmanager');
        });
        it('Donne (manager) cannot delete employees outside her company',
            async function() {
              await doLogin(emDonne);
              const r: msg = await json.delete('/api/v1/company/people/list',
                  [1, 2, 3, 4]);
              assert(r.success); // Successfull, but empty list modified
              assert.deepStrictEqual(r.body, []);
            });
        it('Donne (manager) cannot remove herself', async function() {
          await doLogin(emDonne);
          const r: msg = await json.delete('/api/v1/company/people/list',
              [17, 18, 19]);
          assert(r.success); // Successfull, but empty list modified
          assert.deepStrictEqual(r.body, []);
        });
        it('Donne (manager) deletes Vivianne', async function() {
          await doLogin(emDonne);
          const r: msg = await json.delete('/api/v1/company/people/list',
              [6, 7]);
          assert(r.success);
          assert.deepStrictEqual(r.body, [6]);

          const r2: msg = await json.get('/api/v1/company/people?id=6');
          assert(r2.success);
          assert.strictEqual(r2.body, null);
        });
      });
    });
  });
});

