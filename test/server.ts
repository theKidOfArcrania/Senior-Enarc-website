/* eslint-disable no-invalid-this */

import * as request from 'supertest';
import * as assert from 'assert';
import type * as http from 'http';
import {CookieAccessInfo as cookacc} from 'cookiejar';

import type msg from '../lib/msg';
import * as ent from '../lib/model/enttypes';
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

// Since all our requests are synchronous!
util.Reentrant.prototype.tryLock = async function(): Promise<boolean> {
  if (this.locked) {
    throw new Error('Deadlock warning!');
  } else {
    this.locked = true;
  }
  return true;
};

const eDowley = 'adowley0@myspace.com';
const eBrown = 'tbrownjohn7@cdbaby.com';
const eStennes = 'hstennesa@cmu.edu';
const eVivianne = 'vweine4@ox.ac.uk';
const eDarline = 'deric8@un.org';
const eCattermoul = 'mcattermoul1@photobucket.com';
const eKrystal = 'kfurlow5@china.com.cn';
const eTiff = 'tlezemereh@ftc.gov';

const eBrownPass =
    'e2fb7d22771b5e55d4707630c62420eea3a2904847f290eea627a7b9e7ded495';

const uspecs = {
  [eBrown]: {isAdmin: true, isUtd: true, isEmployee: true, uType: 'faculty'},
  [eDowley]: {isAdmin: false, isUtd: true, isEmployee: true, uType: 'student'},
  [eStennes]: {isAdmin: false, isUtd: true, isEmployee: false, uType: 'staff'},
  [eDarline]: {isAdmin: false, isUtd: true, isEmployee: true, uType: 'student'},
  [eVivianne]: {isAdmin: false, isUtd: false, isEmployee: true, uType: null},
  [eCattermoul]: {
    isAdmin: false, isUtd: true, isEmployee: false, uType: 'student',
  },
  [eKrystal]: {isAdmin: true, isUtd: true, isEmployee: true, uType: 'student'},
  [eTiff]: {isAdmin: false, isUtd: true, isEmployee: true, uType: 'faculty'},
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
    return util.copyAttribs({}, user, {
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
      await doLogin(eBrown);
      const r2 = await json.get('/api/v1/checksess');
      assert(r2.success);
      assert.deepStrictEqual(getCredsFromUser(r2.body), uspecs[eBrown]);
    });

    it('should authenticate with correct email/password', async function() {
      const r1 = await json.post('/api/v1/login', {
        email: eBrown,
        password: eBrownPass});
      assert(r1.success);
      const r2 = await json.get('/api/v1/checksess');
      assert(r2.success);
      assert.deepStrictEqual(getCredsFromUser(r2.body), uspecs[eBrown]);
    });

    it('should not auth with non employee', async function() {
      const r1 = await json.post('/api/v1/login', {
        email: eStennes,
        password: eBrownPass});
      assert.strictEqual(agent.jar.getCookies(cookacc.All).length, 0);
      assert(!r1.success);
      assert.strictEqual(r1.debug, 'notemployee');
    });

    it('logout should no longer have session', async function() {
      await doLogin(eBrown);
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
        password: eBrownPass});
      assert.strictEqual(agent.jar.getCookies(cookacc.All).length, 0);
      assert(!r1.success);
      assert.strictEqual(r1.debug, 'nouser');
    });

    it('should not auth with invalid password', async function() {
      const r1 = await json.post('/api/v1/login', {
        email: eBrown,
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
        email: eDowley,
      });
      assert(r1.success);
      const r2 = await json.get('/api/v1/checksess');
      assert(r2.success);
      assert.deepStrictEqual(getCredsFromUser(r2.body), uspecs[eDowley]);
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
        await doLogin(eBrown);
        const r1 = await json.get('/api/v1/team');
        assert(r1.success);
        assert.strictEqual(r1.body, null);
      });
      it('dowley is in team 39', async function() {
        await doLogin(eDowley);
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
        assert.strictEqual(found.email, eDowley);
      });
      it('Vivianne (non UTD employees) will see first team that they are in',
          async function() {
            await doLogin(eVivianne);
            const r1 = await json.get('/api/v1/team');
            assert(r1.success);
            assert.strictEqual(r1.body.tid, 7);
          });
      it('Vivianne is not in the list of team.members', async function() {
        await doLogin(eVivianne);
        const r1 = await json.get('/api/v1/team');
        assert(r1.success);
        for (const m of r1.body.members) {
          assert.notStrictEqual(m.userID, 6);
        }
      });
      it('dowley can access own teams only', async function() {
        await doLogin(eDowley);
        const r1 = await json.post('/api/v1/team', util.range(0, 53));
        assert(r1.success);
        const teams = Object.keys(r1.body)
            .map((n) => parseInt(n))
            .nsort();
        assert.deepStrictEqual(teams, [6, 39, 42, 50]);
      });
      it('tbrown (admins) can access all teams', async function() {
        await doLogin(eBrown);
        const r1 = await json.post('/api/v1/team', util.range(0, 53));
        assert(r1.success);
        const teams = Object.keys(r1.body)
            .map((n) => parseInt(n))
            .nsort();
        assert.deepStrictEqual(teams, util.range(1, 51));
      });
      it('stennes (staff) can access all teams', async function() {
        await doLogin(eStennes);
        const r1 = await json.post('/api/v1/team', util.range(0, 53));
        assert(r1.success);
        const teams = Object.keys(r1.body)
            .map((n) => parseInt(n))
            .nsort();
        assert.deepStrictEqual(teams, util.range(1, 51));
      });
      it('Vivianne has access to her own teams', async function() {
        await doLogin(eVivianne);
        const r1 = await json.post('/api/v1/team', util.range(0, 53));
        assert(r1.success);
        const teams = Object.keys(r1.body)
            .map((n) => parseInt(n))
            .nsort();
        assert.deepStrictEqual(teams, [7, 39, 49]);
      });
      it('should not alter unless team leader', async function() {
        await doLogin(eCattermoul);
        const r1 = await json.put('/api/v1/team',
            {choices: [8, 9, 5, 2, 4, 12]});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'notteamleader');
      });
      it('should not allow changing team name to ' +
          'already existing team name', async function() {
        await doLogin(eDowley);
        const r1 = await json.put('/api/v1/team',
            {name: 'Group 38'});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'badteamname');
      });
      it('should not make non-member leader', async function() {
        await doLogin(eDowley);
        const r1 = await json.put('/api/v1/team', {leader: 9});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'notinteam');
      });
      it('should not duplicate project choices', async function() {
        await doLogin(eDowley);
        const r1 = await json.put('/api/v1/team',
            {choices: [8, 9, 5, 2, 8, 12]});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'duplicatechoice');
      });
      it('should not have invalid project', async function() {
        await doLogin(eDowley);
        const r1 = await json.put('/api/v1/team',
            {choices: [8, 9, 5, 2, 12, 55]});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'badproj');
      });
      it('should successfully change password ', async function() {
        await doLogin(eDowley);
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
        await doLogin(eCattermoul);
        const r1 = await json.delete('/api/v1/team/member',
            [0]);
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'notteamleader');
      });
      it('should not allow leader to remove self', async function() {
        await doLogin(eDowley);
        const r1 = await json.delete('/api/v1/team/member',
            [0]);
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'teamremoveself');
      });
      it('should not allow leader to remove non-member', async function() {
        await doLogin(eDowley);
        const r1 = await json.delete('/api/v1/team/member',
            [4]);
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'notinteam');
      });
      it('should allow leader to remove member', async function() {
        await doLogin(eDowley);
        const r1 = await json.delete('/api/v1/team/member',
            [3]);
        assert(r1.success);
        await doLogin(eCattermoul);
        const r2 = await json.post('/api/v1/team/join', {team: 39,
          password: null});
        assert(r2.success);
      });
      it('must be student to join a team', async function() {
        await doLogin(eBrown);
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
        await doLogin(eStennes);
        const r1 = await json.get('/api/v1/team/list');
        assert(r1.success);
        assert.deepStrictEqual(r1.body.nsort(),
            util.range(1, 51));
      });
      it('darline gets access to public teams', async function() {
        await doLogin(eDarline);
        const r1 = await json.get('/api/v1/team/list');
        assert(r1.success);
        assert.deepStrictEqual(r1.body.nsort(), util.range(3, 51));
      });
    });
    describe('/team/mylist', function() {
      it('should return teams with member of/mentoring/etc', async function() {
        await doLogin(eDowley);
        const r1 = await json.get('/api/v1/team/mylist');
        assert(r1.success);
        assert.deepStrictEqual(r1.body.nsort(), [6, 39, 42, 50]);
      });
    });
    describe('/team/join', function() {
      it('should return already part of team', async function() {
        await doLogin(eDowley);
        const r1 = await json.post('/api/v1/team/join', {team: 40,
          password: null});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'alreadyjoin');
      });
      it('should return no such team exists', async function() {
        await doLogin(eDarline);
        const r1 = await json.post('/api/v1/team/join', {team: 51,
          password: null});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'badteam');
      });
      it('should return team is full', async function() {
        await doLogin(eDarline);
        const r1 = await json.post('/api/v1/team/join', {team: 39,
          password: null});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'teamfull');
      });
      it('should return team requires a password', async function() {
        await doLogin(eDarline);
        const r1 = await json.post('/api/v1/team/join', {team: 1,
          password: null});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'noteampass');
      });
      it('should return invalid password', async function() {
        await doLogin(eDarline);
        const r1 = await json.post('/api/v1/team/join', {team: 1,
          password: 'null'});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'badteampass');
      });
      it('should return successfully joined team w/o ' +
          'password', async function() {
        await doLogin(eDarline);
        const r1 = await json.post('/api/v1/team/join', {team: 3,
          password: null});
        assert(r1.success);
        const r2 = await json.post('/api/v1/team/leave');
        assert(r2.success);
      });
      it('should return successfully joined team', async function() {
        await doLogin(eDarline);
        const r1 = await json.post('/api/v1/team/join', {team: 2,
          password: 'someotherhash'});
        assert(r1.success);
      });
    });
    describe('/team/leave', async function() {
      it('should make new leader if leader leaves', async function() {
        await doLogin(eDowley);
        const r1 = await json.post('/api/v1/team/leave');
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'teamleader');
      });
      it('should allow student to leave group', async function() {
        await doLogin(eCattermoul);
        const r1 = await json.post('/api/v1/team/leave');
        assert(r1.success);
      });
      it('should fail if student is not in group', async function() {
        await doLogin(eCattermoul);
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
        await doLogin(eBrown);
        const r1 = await json.get('/api/v1/project');
        assert(r1.success);
        assert.strictEqual(r1.body, null);
      });
      it('should return first project for this user', async function() {
        await doLogin(eDowley);
        const r1 = await json.get('/api/v1/project');
        assert(r1.success);
        assert.strictEqual(r1.body.projID, 2);
      });
      it('should show info about public projects', async function() {
        await doLogin(eCattermoul);
        const r1 = await json.post('/api/v1/project',
            util.range(0, 52));
        assert(r1.success);
        const keys = Object.keys(r1.body)
            .map((n) => parseInt(n))
            .nsort();
        assert.deepStrictEqual(keys, publicProjs);
      });
      it('stennes (staff) can access all projects', async function() {
        await doLogin(eStennes);
        const r1 = await json.post('/api/v1/project', util.range(0, 53));
        assert(r1.success);
        const projects = Object.keys(r1.body)
            .map((n) => parseInt(n))
            .nsort();
        assert.deepStrictEqual(projects, util.range(1, 51));
      });
      it('Vivianne only has access to her company projects/ projects she is in',
          async function() {
            await doLogin(eVivianne);
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

        await doLogin(eTiff);
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
        await doLogin(eDowley);
        const r1 = await json.put('/api/v1/project',
            {projID: 51, pName: 'NewName'});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'badproj');
      });
      it('should not allow modification of project ' +
          'w/o permissions', async function() {
        await doLogin(eDowley);
        const r1 = await json.put('/api/v1/project',
            {projID: 1, pName: 'NewName'});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'nopermproj');
      });
      it('project cannot be modified', async function() {
        await doLogin(eDowley);
        const r1 = await json.put('/api/v1/project',
            {projID: 2, pName: 'NewName'});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'badstatus');
      });
      it('modified project name', async function() {
        await doLogin(eDowley);
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
        await doLogin(eCattermoul);
        const r1 = await json.post('/api/v1/project/submit',
            {pName: 'Test', pDesc: 'test test', sponsor: 1, mentor: 4,
              image: null, projDoc: null});
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'notemployee');
      });
      it('should successfully add project', async function() {
        await doLogin(eKrystal);
        const proj: Partial<ent.Project> = {
          pName: 'Test', pDesc: 'test test', sponsor: 1, mentor: 4,
          image: null, projDoc: null};
        const r1 = await json.post('/api/v1/project/submit', proj);
        assert(r1.success);

        // Check that it was added
        await doLogin(eBrown);
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
        await doLogin(eDowley);
        const r1 = await json.get('/api/v1/project/mylist');
        assert(r1.success);
      });
    });
    describe('/project/list', function() {
      it('should return all public projects', async function() {
        await doLogin(eDowley);
        const r1 = await json.get('/api/v1/project/list');
        assert(r1.success);
      });
    });
  });
  describe('admin', function() {
    describe('/admin/', function() {
      it('should not accept non-admin user', async function() {
        await doLogin(eDowley);
        const r1 = await json.get('/api/v1/admin/nonexistent');
        assert(!r1.success);
        assert.strictEqual(r1.debug, 'notadmin');
      });
    });
  });
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
      await doLogin(eDowley);
      const r: msg = await json.post('/api/v1/upload');
      assert(!r.success);
      assert.strictEqual(r.debug, 'nofile');
    });
    it('should fail if we send file to wrong param', async function() {
      await doLogin(eDowley);
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
      await doLogin(eDowley);
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
      await doLogin(eDowley);
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
      await doLogin(eDowley);
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
    });
  });
});
