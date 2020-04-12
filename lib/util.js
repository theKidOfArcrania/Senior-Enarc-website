const crypto = require('crypto');
const bcrypt = require('bcrypt');
const _utils = require('util');
const promisify = _utils.promisify;
const config = require('./config.js');
const uid = new (require('nodejs-snowflake').UniqueID)({returnAsNumber: false});

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
  for (const name of Object.getOwnPropertyNames(proto)) {
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
    res.json(require('./msg.js').fail('You are not logged in!', 'nologin'));
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


module.exports = Object.assign({}, _utils, {
  range, randomID, copyAttribs, chkPassword, hashPassword, promisifyObj, login,
  log,
  fnew: (F, ...a) => new F(...a),
  norder: (a, b) => a - b,
});

Array.prototype.nsort = function() { // eslint-disable-line no-extend-native
  return Array.prototype.sort.call(this, module.exports.norder);
};
