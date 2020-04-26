import * as fs from 'fs';
import * as assert from 'assert';
import msg from './msg';
import config from './config';

export type FnChk = (a: any) => void;

/**
 * Dynamically type checks that a certain value has a specific typename.
 *
 * @param typname - the type name to expect
 */
function typChk(typname: string) {
  return (val: any): void => {
    assert.strictEqual(typname, typeof val);
  };
}

/**
 * Checks the string value is within a certain length.
 * @param len - the length limit
 */
function string(len: number) {
  return (val): void => {
    typChk('string')(val);
    if (len) assert(val.length <= len, `String is too long (max ${val})`);
  };
}

/**
 * Checks that the value given is a valid file link.
 * @param val - the value
 */
function file(val: any): void {
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
 */
function CheckRoute(typeCheck: FnChk) {
  return (req, res, next): void => {
    try {
      typeCheck(req.body);
      req.bodySan = req.body;
    } catch (e) {
      res.json(msg.fail('Invalid request format!', 'badformat'));
      // Uncomment to debug
      console.error(e);
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
  int: (val): void => {
    assert.strictEqual(Math.floor(val), val);
  },
  enumT: <T>(enumTyp: Set<T>) => (val: any): void =>{
    if (!enumTyp.has(val)) {
      throw new Error(`Must be ${JSON.stringify([...enumTyp.values()])}`);
    }
  },
  obj: (props: {[P: string]: FnChk}) => (obj: any): void => {
    typChk('object')(obj);
    for (const p of Object.keys(props)) {
      // assert this is correct
      props[p](obj[p]);
    }
    for (const p of Object.getOwnPropertyNames(obj)) {
      if (!props[p]) throw new Error('Contains bad properties');
    }
  },
  array: (innerTyp: FnChk) => (val: any): void => {
    typChk('object')(val);
    for (const v of val) {
      innerTyp(v);
    }
  },
  maybeNull: (chkr: FnChk) => (val: any): void => {
    if (val !== null) {
      chkr(val);
    }
  },
  maybeDefined: (chkr: FnChk) => (val): void => {
    if (val !== undefined) {
      chkr(val);
    }
  },
  maybeDefinedObjExcept: (props: {[P: string]: FnChk}, except: string) =>
    (obj: any): void => {
      typChk('object')(obj);
      for (const p of Object.keys(props)) {
        if (except === p) props[p](obj[p]);
        else fns.maybeDefined(props[p])(obj[p]);
      }
    },
};

export default Object.assign(CheckRoute, fns);
