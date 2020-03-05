const assert = require('assert');
const user = require('../lib/model/user.js');

describe('model', function() {
  describe('user', function() {
    describe('User', function() {
      describe('#isUtd', function() {
        it('should have a .utd object associated with it', function() {
          const u = new user.User('test');
          u.isUtd = true;
          return u.reload().then((_) => {
            assert.equal(u.utd.constructor, user.UTDPersonnel);
          });
        });
      });
      describe('#isEmployee', function() {
        it('should have a .employee object associated with it', function() {
          const u = new user.User('test');
          u.isEmployee = true;
          return u.reload().then((_) => {
            assert.equal(u.employee.constructor, user.Employee);
          });
        });
      });
    });
  });
});

