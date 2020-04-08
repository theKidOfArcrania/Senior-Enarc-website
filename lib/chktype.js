const assert = require('assert');
const msg = require('./msg.js');

/**
 * @param {String} typname the type name to expect
 * @return {Function} function that checks that a certain value is of the
 * specified type
 */
function typChk(typname) {
  return (val) => {
    assert.strictEqual(typname, typeof val);
  };
}

/**
 * Checks the string value is within a certain length.
 * @param {Number} len    the length limit
 * @return {Function} checker function
 */
function string(len) {
  return (val) => {
    typChk('string')(val);
    if (len) assert(val.length <= len, `String is too long (max ${val})`);
  };
}

/**
 * This does some sanity checks on the input request data in a route. Note that
 * the req.body must contain the data to sanity check
 *
 * @param {Function} typeCheck    is a function that takes in some object
 *                                and throws an error if the sanity type check
 *                                fails
 * @return {Function} a middleware function that can be passed to express.
 */
function CheckRoute(typeCheck) {
  return (req, res, next) => {
    try {
      typeCheck(req.body);
      req.bodySan = req.body;
    } catch (e) {
      res.json(msg.fail('Invalid request format!'));
      // Uncomment to debug
      // console.error(e);
      return;
    }

    next();
  };
}

Object.assign(CheckRoute, {
  string: string,
  file: string(100), // TODO
  bool: typChk('boolean'),
  int: (val) => {
    assert.strictEqual(Math.floor(val), val);
  },
  obj: (props) => (obj) => {
    typChk('object')(obj);
    for (const p of Object.getOwnPropertyNames(props)) {
      // assert this is correct
      props[p](obj[p]);
    }
  },
  maybeNull: (chkr) => (val) => {
    if (val !== null) {
      chkr(val);
    }
  },
  maybeDefined: (chkr) => (val) => {
    if (val !== undefined) {
      chkr(val);
    }
  },
});
module.exports = CheckRoute;
