const asyncHooks = require('async_hooks');
const active = new Map();
const chained = new Set();

let callingThen = false;
let danglingSet = undefined;
const hook = asyncHooks.createHook({
  init: (asyncId, type, trigger, resource) => {
    if (type !== 'PROMISE') return;
    if (trigger === 1) return;
    if (resource.isChainedPromise) return;
    const err = new Error('Potential dangling promise detected!');
    if (callingThen) {
      chained.add(trigger);
    }
    active.set(asyncId, {err});
  },
  before: (asyncId) => {
    active.delete(asyncId);
  },
  after: (asyncId) => {
    active.delete(asyncId);
  },
  promiseResolve: (asyncId) => {
    if (!active.has(asyncId)) return;
    const {err} = active.get(asyncId);
    setImmediate(() => {
      if (active.has(asyncId)) {
        active.delete(asyncId);
        chained.delete(asyncId);
      } else {
        console.error(err);
        if (danglingSet) {
          danglingSet.push(err);
        }
      }
    });
  },
});

hook.enable();

/**
 * This wraps the Promise.prototype handlers so that we know that we are
 * currently doing a promise chain
 * @param {String} name    the name of the function
 */
function wrapHandler(name) {
  const before = Promise.prototype[name];
  Promise.prototype[name] = function(...args) { // eslint-disable-line
    callingThen = true;
    before.call(this, ...args);
    callingThen = false;
  };
}

for (const name of ['catch', 'finally', 'then']) {
  wrapHandler(name);
}

exports = module.exports = function() {
  it('should not have any dangling promises!', function() {
    if (danglingSet.length) {
      throw danglingSet[0];
    }
  });
};

exports.before = () => {
  danglingSet = [];
  active.clear();
  chained.clear();
};
exports.enable = () => hook.enable();
exports.disable = () => hook.disable();
