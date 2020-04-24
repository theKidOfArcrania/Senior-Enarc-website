const crypto = require('crypto');
const bcrypt = require('bcrypt');
const _utils = require('util');
const promisify = _utils.promisify;
const config = require('./config.js');
const uid = new (require('nodejs-snowflake').UniqueID)({returnAsNumber: false});
const utypes = require('./model/user.js').UTDPersonnel.types;
const msg = require('./msg.js');


/**
 * This is a simple re-entrant lock used to asynchronously wait for a lock. Note
 * that due to how Javascript threading works, nested locks DO NOT WORK. DO NOT
 * ATTEMPT to do so because that will result in a deadlock.
 */
class Reentrant {
  /**
   * Creates a new reentrant lock
   */
  constructor() {
    this.locked = false;
    this._waitqueue = [];
  }

  /**
   * Attempts to take the lock. By default it will not wait at all, but if
   * supplied a positive timeout, it will wait that number of milliseconds to
   * take the lock.
   * @param {Integer} timeout    a timeout to wait in milliseconds. If positive,
   *                             waits for that time. If 0, it will return
   *                             immediately. Otherwise, if negative, it will
   *                             wait indefinitely.
   */
  async tryLock(timeout = 0) {
    let timedOut = false;
    const _this = this;

    if (!this.locked) {
      this.locked = true;
      return true;
    }

    const waitLock = new Promise((resolve) => {
      _this._waitqueue.push(() => {
        if (timedOut) _this.unlock();
        else resolve(true);
      });
    });

    if (await Promise.race([waitLock, until(timeout)])) {
      return true;
    } else {
      timedOut = true;
      return false;
    }
  }

  /**
   * Convenience method for .tryLock(-1)
   */
  async lock() {
    await this.tryLock(-1);
  }

  /**
   * Releases the lock on this reentrant instance, and notifies the next waiter
   * on the queue.
   */
  unlock() {
    if (!this.locked) throw new Error('This is not locked to begin with');
    if (this._waitqueue.length) {
      const waiting = this._waitqueue.shift();
      setImmediate(waiting);
    } else {
      this.locked = false;
    }
  }
}


/**
 * Create a range of numbers similar to python's range function.
 * @param {Number} lower    the lower bound (if omitted, defaults to 0)
 * @param {Number} upper    the upper bound
 * @param {Number} skip     the amount to increment per iteration.
 * @return {Number[]} a number list
 */
function range(lower, upper, skip) {
  ret = [];
  if (skip === undefined) {
    skip = 1;

    if (upper === undefined) {
      upper = lower;
      lower = 0;
    }
  }
  for (let i = lower; i < upper; i += skip) {
    ret.push(i);
  }
  return ret;
}

/**
 * Returns a random alphanumeric ID that's roughly time-sortable and guarenteed
 * to be unique It is also guarenteed to be cryptographically secure/not
 * guessable.
 * @return {String} an alphanumeric unique ID
 */
function randomID() {
  return uid.getUniqueID() + crypto.randomBytes(8).hexSlice();
}

/**
 * Copy object attributes
 * @param {Object} dst      the destination objecct
 * @param {Object} src      the source objecct
 * @param {Object} attribs  the attribute/default values to copy
 * @return {Object} destination object
 */
function copyAttribs(dst, src, attribs) {
  for (const prop of Object.getOwnPropertyNames(attribs)) {
    dst[prop] = (src[prop] !== undefined) ? src[prop] : attribs[prop];
  }
  return dst;
}

/**
 * Gets all the property names (enumerable or not, own properties or not).
 * @param {Object} obj   the object
 * @return {String[]} a list of property names
 */
function getAllPropertyNames(obj) {
  const result = new Set();
  while (obj) {
    Object.getOwnPropertyNames(obj).forEach((p) => result.add(p));
    obj = Object.getPrototypeOf(obj);
  }
  return [...result];
}

/**
 * This takes an input object, returns an object whose properties are
 * getters/setters mapped to the input object, and also all methods in the input
 * object prototype are wrapped with promisify. Note that some functions in the
 * promisify'ed object might not expect an extra callback parameter, so use the
 * original object to call those functions!
 * @param {Object} obj    the input object
 * @return {Object} a promisify'ed object
 */
function promisifyObj(obj) {
  /**
   * Constructor representing an promisified object.
   */
  function Promisified() {
    // Make a getter/setter pair to the original object for convenience
    for (const name of Object.getOwnPropertyNames(obj)) {
      Object.defineProperty(this, name,
          {get: () => obj[name],
            set: (val) => obj[name] = val});
    }
  }


  const ret = new Promisified();

  // Take all functions in object prototype, and wrap it around a promisify API
  const proto = obj.constructor.prototype;
  for (const name of getAllPropertyNames(proto)) {
    if (!(_utils.isFunction(proto[name]))) continue;
    if (promisify.custom in proto[name]) {
      Promisified.prototype[name] = proto[name][promisify.custom].bind(obj);
    } else {
      Promisified.prototype[name] = promisify(proto[name].bind(obj));
    }
  }

  return ret;
}

/**
 * Computes the bcrypt hash for a particular password (asynchronously).
 * @param {String} passwd    the password to compute a hash on
 * @return {String} the resulting password as a bcrypt hash string.
 */
async function hashPassword(passwd) {
  return await bcrypt.hash(passwd, config.BCRYPT_ROUNDS);
}

/**
 * Verifies that the password and hash matches (asynchronously).
 * @param {String} passwd    the password
 * @param {String} hash      the bcrypt hash
 * @return {Boolean} true if valid, false if invalid
 */
async function chkPassword(passwd, hash) {
  return await bcrypt.compare(passwd, hash);
}

/**
 * Middleware function that will check that a user is logged in or not
 * @param {Object} req    the request object
 * @param {Object} res    the response object
 * @param {Object} next   calls next middleware in the chain.
 */
function login(req, res, next) {
  if (req.user) {
    next();
  } else {
    res.json(msg.fail('You are not logged in!', 'nologin'));
  }
}

/**
 * Middleware function that will check that a user is a student.
 * @param {Object} req    the request object
 * @param {Object} res    the response object
 * @param {Object} next   calls next middleware in the chain.
 */
function student(req, res, next) {
  u = req.user;
  if (u && u.isUtd && u.utd.uType === utypes.STUDENT) {
    req.student = u.utd.student;
    next();
  } else {
    res.json(msg.fail('You must be a student!', 'notstudent'));
  }
}

/**
 * Middleware function that will check that a user is an employee.
 * @param {Object} req    the request object
 * @param {Object} res    the response object
 * @param {Object} next   calls next middleware in the chain.
 */
function employee(req, res, next) {
  u = req.user;
  if (u && u.isEmployee) {
    req.employee = u.employee;
    next();
  } else {
    res.json(msg.fail('You must be an employee!', 'notemployee'));
  }
}

/**
 * Wrapper log function for console.log, which will suppress output during
 * testing
 */
function log(...msg) {
  if (!config.TESTING) {
    if (msg.length === 0) {
      console.log(undefined);
    } else if (msg.length === 1) {
      console.log(msg[0]);
    } else {
      console.log(msg.join(' '));
    }
  }
}

/**
 * Makes a deep copy of an object using a serialization/deserializaion JSON
 * technique. This works for basic objects/strings/arrays/numbers. This does NOT
 * work for complex objects (i.e. objects with special constructors, etc.).
 * @param {Object} obj     a simple object to clone.
 * @return {Object} the cloned object.
 */
function deepJSONCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Similar to a promisified setTimeout function, with one exception, if a
 * negative timeout is given, this will result in an indefinite wait.
 * @param {Integer} timeout     the timeout time to wait.
 */
async function until(timeout) {
  if (timeout < 0) {
    return new Promise(() => false);
  } else {
    await promisify(setTimeout)(timeout);
  }
}

/**
 * Sets a default value of property in object if that property evaluates to
 * undefined or null.
 * @param {Object} obj         the object
 * @param {String} prop        the property name
 * @param {Object} defaultVal  the default value if current value is
 *                             undefined/null
 */
function objDefault(obj, prop, defaultVal) {
  if (obj[prop] === null || obj[prop] === undefined) {
    obj[prop] = defaultVal;
  }
}

module.exports = Object.assign({}, _utils, {
  range, randomID, copyAttribs, chkPassword, hashPassword, promisifyObj, login,
  log, deepJSONCopy, until, Reentrant, getAllPropertyNames, student, employee,
  objDefault,
  fnew: (F, ...a) => new F(...a),
  f: (fn, ...args) => fn.bind(null, ...args),
  ft: (fn, _this, ...args) => fn.bind(_this, ...args),
  norder: (a, b) => a - b,
  ident: (x) => x,
  caseInsensOrder: (a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
});

Array.prototype.nsort = function() { // eslint-disable-line no-extend-native
  return Array.prototype.sort.call(this, module.exports.norder);
};

const AsyncFunction = (async function() {}).constructor;
AsyncFunction.prototype.then = function(next) {
  const _this = this;
  return (...args) => {
    return _this(...args).then(next);
  };
};
AsyncFunction.prototype.nice = function(defVal = null) {
  const _this = this;
  return (...args) => {
    return _this(...args).catch(() => defVal);
  };
};

Function.prototype.then = function(next) { // eslint-disable-line
  const _this = this;
  return (...args) => {
    return next(_this(...args));
  };
};

Function.prototype.nice = function(defVal = null) { // eslint-disable-line
  const _this = this;
  return (...args) => {
    try {
      return _this(...args);
    } catch (e) {
      return defVal;
    }
  };
};
