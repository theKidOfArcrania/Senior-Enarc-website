import * as fs from 'fs';
import * as assert from 'assert';
import * as util from './util';
import msg from './msg';
import config from './config';

/**
 * Dynamically type checks that a certain value has a specific typename.
 *
 * @param typname - the type name to expect
 */
function typChk(typname: string) {
  return (val: any) => {
    assert.strictEqual(typname, typeof val);
  };
}

/**
 * Checks the string value is within a certain length.
 * @param len - the length limit
 */
function string(len) {
  return (val) => {
    typChk('string')(val);
    if (len) assert(val.length <= len, `String is too long (max ${val})`);
  };
}

/**
 * Checks that the value given is a valid file link.
 * @param {Object} val     the value
 */
function file(val) {
  string(50)(val);
  if (/[^A-Za-z0-9]/.test(val)) {
    assert.fail('File does not exist');
  }

  assert(fs.existsSync(`${config.UPLOAD_IDS}/${val}`), 'File does not exist');
}

/**
 * This does some sanity checks on the input request data in a route. Note that
 * the req.body must contain the data to sanity check
 *
 * @param typeCheck - is a function that takes in some object and throws an
 *                    error if the sanity type check fails
 * @return {Function} a middleware function that can be passed to express.
 */
export default function CheckRoute(typeCheck: (Object) => void) {
  return (req, res, next) => {
    try {
      typeCheck(req.body);
      req.bodySan = req.body;
    } catch (e) {
      res.json(msg.fail('Invalid request format!', 'badformat'));
      // Uncomment to debug
      // console.error(e);
      return;
    }

    next();
  };
}

const fns = {
  string: string,
  file: file,
  bool: typChk('boolean'),
  number: typChk('number'),
  int: (val) => {
    assert.strictEqual(Math.floor(val), val);
  },
  enumT: (enumTyp) => (val) =>{
    if (util.isNullOrUndefined(enumTyp.ofString(val))) {
      throw new Error('Must be ' + JSON.stringify(enumTyp._values));
    }
  },
  obj: (props) => (obj) => {
    typChk('object')(obj);
    for (const p of Object.getOwnPropertyNames(props)) {
      // assert this is correct
      props[p](obj[p]);
    }
    for (const p of Object.getOwnPropertyNames(obj)) {
      if (!props[p]) throw new Error('Contains bad properties');
    }
  },
  array: (innerTyp) => (val) => {
    typChk('object')(val);
    for (const v of val) {
      innerTyp(v);
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
  maybeDefinedObjExcept: (props, except) => (obj) => {
    typChk('object')(obj);
    for (const p of Object.getOwnPropertyNames(props)) {
      if (except === p) props[p](obj[p]);
      else fns.maybeDefined(props[p])(obj[p]);
    }
  },
};

Object.assign(CheckRoute, fns);
module.exports = CheckRoute;
