const request = require('supertest');
const assert = require('assert');
const {getInst} = require('../lib/model/db.js');

const config = require('../lib/config.js');
config.TESTING = true;
config.IFACE = {
  host: 'localhost',
  port: 1337,
};
const util = require('../lib/util.js');

const eDowley = 'adowley0@myspace.com';
const eBrown = 'tbrownjohn7@cdbaby.com';
const eStennes = 'hstennesa@cmu.edu';
const eVivianne = 'vweine4@ox.ac.uk';

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
  [eVivianne]: {
    admin: false, utd: false, employee: true,
    utype: null, name: 'Weine, Vivianne',
  },
};

describe('server', function() {
  let server;
  let agent;

  before(async function() {
    server = await require('../lib/server.js')();

    const db = getInst();
    // Vivianne mentors project 7, team 4
    await db.alterTeamInfo(4, {assignedProj: 7});

    u = new (require('../lib/model/user.js').User)(6);
    await u.reload();
  });

  after(function() {
    server.close();
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
    it('by default you\'re not authenticated.', async function() {
      const resp = await json.get('/api/v1/checksess');
      assert(!resp.success);
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
    });

    it('logout should no longer have session', async function() {
      await doLogin(eBrown);
      const r1 = await json.get('/api/v1/checksess');
      assert(r1.success);
      const r2 = await json.post('/api/v1/logout');
      assert(r2.success);
      const r3 = await json.get('/api/v1/checksess');
      assert(!r3.success);
    });

    it('should not auth with invalid email', async function() {
      const r1 = await json.post('/api/v1/login', {
        email: 'bademail@gmail.com',
        password: eBrownPass});
      assert.strictEqual(agent.jar.getCookies().length, 0);
      assert(!r1.success);
    });

    it('should not auth with invalid password', async function() {
      const r1 = await json.post('/api/v1/login', {
        email: eBrown,
        password: 'badpass'});
      assert.strictEqual(agent.jar.getCookies().length, 0);
      assert(!r1.success);
    });
  });

  describe('team', function() {
    describe('/team', function() {
      it('should deny access without login', async function() {
        const r1 = await json.get('/api/v1/team');
        assert(!r1.success);
      });
      it('tbrown has no teams', async function() {
        await doLogin(eBrown);
        const r1 = await json.get('/api/v1/team');
        assert(!r1.success);
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
      it('dowley can access team 39 only', async function() {
        await doLogin(eDowley);
        const list = [];
        for (let i = 0; i <= 52; i++) list.push(i);

        const r1 = await json.post('/api/v1/team', list);
        assert(r1.success);
        const teams = Object.keys(r1.body);
        assert.deepStrictEqual(teams, ['39']);
      });
      it('tbrown (admins) can access all teams', async function() {
        await doLogin(eBrown);
        const list = [];
        for (let i = 0; i <= 52; i++) list.push(i);

        const r1 = await json.post('/api/v1/team', list);
        assert(r1.success);
        const teams = Object.keys(r1.body)
            .map((n) => parseInt(n))
            .sort((a, b) => a - b);
        assert.deepStrictEqual(teams, util.range(1, 51));
      });
      it('stennes (staff) can access all teams', async function() {
        await doLogin(eStennes);
        const r1 = await json.post('/api/v1/team', util.range(0, 53));
        assert(r1.success);
        const teams = Object.keys(r1.body)
            .map((n) => parseInt(n))
            .sort((a, b) => a - b);
        assert.deepStrictEqual(teams, util.range(1, 51));
      });
      it('Vivianne has no access to teams', async function() {
        await doLogin(eVivianne);
        const r1 = await json.post('/api/v1/team', util.range(0, 53));
        assert(r1.success);
        const teams = Object.keys(r1.body);
        assert.deepStrictEqual(teams, ['4']);
      });
    });
  });
});
