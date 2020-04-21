const request = require('supertest');
const assert = require('assert');

const config = require('../lib/config.js');
config.TESTING = true;
config.IFACE = {
  host: 'localhost',
  port: 1337,
};
const util = require('../lib/util.js');

// Since all our requests are synchronous!
util.Reentrant.prototype.tryLock = function() {
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

const eBrownPass =
    'e2fb7d22771b5e55d4707630c62420eea3a2904847f290eea627a7b9e7ded495';

uspecs = {
  [eBrown]: {
    admin: true, utd: true, employee: true,
    utype: 'faculty', name: 'Brownjohn, Tabby',
  },
  [eDowley]: {
    admin: false, utd: true, employee: true,
    utype: 'student', name: 'Dowley, Andreana',
  },
  [eStennes]: {
    admin: false, utd: true, employee: false,
    utype: 'staff', name: 'Stennes, Halli',
  },
  [eDarline]: {
    admin: false, utd: true, employee: true,
    utype: 'student', name: 'Eric, Darline',
  },
  [eVivianne]: {
    admin: false, utd: false, employee: true,
    utype: null, name: 'Weine, Vivianne',
  },
  [eCattermoul]: {
    admin: true, utd: true, employee: false,
    utype: 'student', name: 'Cattermoul, Muire',
  },
  [eKrystal]: {
    admin: true, utd: true, employee: true,
    utype: 'student', name: 'Furlow, Krystal',
  },
};

describe('server', function() {
  let server;
  let agent;

  before(require('./danglingTest.js').before);

  before(async function() {
    server = await require('../lib/server.js')();
  });

  after(function() {
    if (server) server.close();
  });

  beforeEach(async function() {
    agent = request.agent(server);
  });

  /**
   * Makes a JSON ajax request, expecting a JSON response.
   * @param {String} method    the method name
   * @param {String} url       the URL of the request
   * @param {Object} data      the data to send if any
   * @return {Object} the response data
   */
  async function json(method, url, data) {
    let req = agent[method.toLowerCase()](url)
        .set('accept', 'json');
    if (data) req = req.type('json').send(data);
    const resp = await req.expect(200);
    return resp.body;
  }

  /**
   * Authenticates with a email using /testlogin endpoint
   * @param {String} email     the email
   */
  async function doLogin(email) {
    const r1 = await json.post('/api/v1/testlogin', {email});
    assert(r1.success);
  }

  json.get = json.bind(null, 'GET');
  json.post = json.bind(null, 'POST');
  json.put = json.bind(null, 'PUT');

  describe('test users', function() {
    for (const email of Object.keys(uspecs)) {
      it(uspecs[email].name, async function() {
        await doLogin(email);
        const r2 = await json.get('/api/v1/checksess');
        assert(r2.success);
        assert.deepStrictEqual(r2.body, uspecs[email]);
      });
    }
  });

  describe('login', function() {
    it('testlogin fail situation', async function() {
      const r1 = await json.post('/api/v1/testlogin', {
        email: 'bademail@gmail.com',
      });
      assert(!r1.success);
      assert.strictEqual(r1.body.debug, 'nouser');
    });
    it('by default you\'re not authenticated.', async function() {
      const resp = await json.get('/api/v1/checksess');
      assert(!resp.success);
      assert.strictEqual(resp.body.debug, 'nologin');
    });

    it('authenticated after login, includes information', async function() {
      await doLogin(eBrown);
      const r2 = await json.get('/api/v1/checksess');
      assert(r2.success);
      assert.deepStrictEqual(r2.body, uspecs[eBrown]);
    });

    it('should authenticate with correct email/password', async function() {
      const r1 = await json.post('/api/v1/login', {
        email: eBrown,
        password: eBrownPass});
      assert(r1.success);
      const r2 = await json.get('/api/v1/checksess');
      assert(r2.success);
      assert.deepStrictEqual(r2.body, uspecs[eBrown]);
    });

    it('should not auth with non employee', async function() {
      const r1 = await json.post('/api/v1/login', {
        email: eStennes,
        password: eBrownPass});
      assert.strictEqual(agent.jar.getCookies().length, 0);
      assert(!r1.success);
      assert.strictEqual(r1.body.debug, 'nonemployee');
    });

    it('logout should no longer have session', async function() {
      await doLogin(eBrown);
      const r1 = await json.get('/api/v1/checksess');
      assert(r1.success);
      const r2 = await json.post('/api/v1/logout');
      assert(r2.success);
      const r3 = await json.get('/api/v1/checksess');
      assert(!r3.success);
      assert.strictEqual(r3.body.debug, 'nologin');
    });

    it('should not auth with invalid email', async function() {
      const r1 = await json.post('/api/v1/login', {
        email: 'bademail@gmail.com',
        password: eBrownPass});
      assert.strictEqual(agent.jar.getCookies().length, 0);
      assert(!r1.success);
      assert.strictEqual(r1.body.debug, 'nouser');
    });

    it('should not auth with invalid password', async function() {
      const r1 = await json.post('/api/v1/login', {
        email: eBrown,
        password: 'badpass'});
      assert.strictEqual(agent.jar.getCookies().length, 0);
      assert(!r1.success);
      assert.strictEqual(r1.body.debug, 'badpassword');
    });

    it('should not login with invalid email', async function() {
      const r1 = await json.post('/api/v1/utdlogin', {
        email: 'bademail@gmail.com',
      });
      assert.strictEqual(agent.jar.getCookies().length, 0);
      assert(!r1.success);
      assert.strictEqual(r1.body.debug, 'nouser');
    });

    it('should authenticate utd with correct email', async function() {
      const r1 = await json.post('/api/v1/utdlogin', {
        email: eDowley,
      });
      assert(r1.success);
      const r2 = await json.get('/api/v1/checksess');
      assert(r2.success);
      assert.deepStrictEqual(r2.body, uspecs[eDowley]);
    });
  });

  describe('team', function() {
    describe('/team', function() {
      it('should deny access without login', async function() {
        const r1 = await json.get('/api/v1/team');
        assert(!r1.success);
        assert.strictEqual(r1.body.debug, 'nologin');
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
          if (m.userId === 0) {
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
          assert.notStrictEqual(m.userId, 6);
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
        assert.strictEqual(r1.body.debug, 'notteamleader');
      });
      it('should not make non-member leader', async function() {
        await doLogin(eDowley);
        const r1 = await json.put('/api/v1/team', {leader: 9});
        assert(!r1.success);
        assert.strictEqual(r1.body.debug, 'notinteam');
      });

      it('should not duplicate project choices', async function() {
        await doLogin(eDowley);
        const r1 = await json.put('/api/v1/team',
            {choices: [8, 9, 5, 2, 8, 12]});
        assert(!r1.success);
        assert.strictEqual(r1.body.debug, 'duplicatechoice');
      });
    });
    describe('/team/list', function() {
      it('should deny access without login', async function() {
        const r1 = await json.get('/api/v1/team/list');
        assert(!r1.success);
        assert.strictEqual(r1.body.debug, 'nologin');
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
        assert.strictEqual(r1.body.debug, 'alreadyjoin');
      });
      it('should return no such team exists', async function() {
        await doLogin(eDarline);
        const r1 = await json.post('/api/v1/team/join', {team: 51,
          password: null});
        assert(!r1.success);
        assert.strictEqual(r1.body.debug, 'badteam');
      });
      it('should return team requires a password', async function() {
        await doLogin(eDarline);
        const r1 = await json.post('/api/v1/team/join', {team: 1,
          password: null});
        assert(!r1.success);
        assert.strictEqual(r1.body.debug, 'noteampass');
      });
      it('should return invalid password', async function() {
        await doLogin(eDarline);
        const r1 = await json.post('/api/v1/team/join', {team: 1,
          password: 'null'});
        assert(!r1.success);
        assert.strictEqual(r1.body.debug, 'badteampass');
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
        assert.strictEqual(r1.body.debug, 'teamleader');
      });
      it('should allow student to leave group', async function() {
        await doLogin(eCattermoul);
        const r1 = await json.post('/api/v1/team/leave');
        assert(r1.success);
      });
    });

    // TODO: Test cases for changing passwords
  });
  describe('project', function() {
    describe('/project', function() {
      it('should return no projects to view', async function() {
        await doLogin(eBrown);
        const r1 = await json.get('/api/v1/project');
        assert(!r1.success);
        assert.strictEqual(r1.body.debug, 'noproj');
      });
      it('should return first project for this user', async function() {
        await doLogin(eDowley);
        const r1 = await json.get('/api/v1/project');
        assert(r1.success);
        // TODO assert.strictEqual
        // const proj = Object.keys(r1.body);
        // assert.deepStrictEqual(proj, 2);
      });
      it('should show info about projects', async function() {
        await doLogin(eCattermoul);
        const r1 = await json.post('/api/v1/project',
            [1, 2, 3]);
        assert(r1.success);
      });
    });
    describe('/project/submit', function() {
      it('should only allow managers to add projects', async function() {
        await doLogin(eDowley);
        const r1 = await json.post('/api/v1/project/submit',
            {pName: 'Test', pDesc: 'test test', status: 'active',
              sponsor: 1, mentor: 2});
        assert(!r1.success);
        assert.strictEqual(r1.body.debug, 'notmanager');
      });
      it('should successfully add project', async function() {
        await doLogin(eKrystal);
        const r1 = await json.post('/api/v1/project/submit',
            {pName: 'Test', pDesc: 'test test', status: 'active',
              sponsor: 1, mentor: 2});
        assert(r1.success);
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
});

describe('dangling promises', require('./danglingTest.js'));
