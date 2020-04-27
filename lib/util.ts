import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as _utils from 'util';
import {setTimeout} from 'timers';
import type * as express from 'express';
import type * as core from 'express-serve-static-core';


import config from './config';


const {promisify: _promisify} = _utils;
const uid = new (require('nodejs-snowflake').UniqueID)({returnAsNumber: false});

/**
 * Similar to a promisified setTimeout function, with one exception, if a
 * negative timeout is given, this will result in an indefinite wait.
 * @param timeout - the timeout time to wait.
 */
export async function until(timeout: number): Promise<void> {
  if (timeout < 0) {
    return new Promise(() => undefined);
  } else {
    await _promisify(setTimeout)(timeout);
  }
}

/**
 * This is a simple re-entrant lock used to asynchronously wait for a lock. Note
 * that due to how Javascript threading works, nested locks DO NOT WORK. DO NOT
 * ATTEMPT to do so because that will result in a deadlock.
 */
export class Reentrant {
  locked: boolean;
  _waitqueue: ((...args: any) => void)[];

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
   * @param timeout - a timeout to wait in milliseconds. If positive, waits for
   *                  that time. If 0, it will return immediately. Otherwise,
   *                  if negative, it will wait indefinitely.
   */
  async tryLock(timeout = 0): Promise<boolean> {
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
  async lock(): Promise<void> {
    await this.tryLock(-1);
  }

  /**
   * Releases the lock on this reentrant instance, and notifies the next waiter
   * on the queue.
   */
  unlock(): void {
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
 * @param lower - the lower bound (if omitted, defaults to 0)
 * @param upper - the upper bound
 * @param skip - the amount to increment per iteration.
 */
export function range(lower: number, upper?: number, skip?: number): number[] {
  const ret = [];
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
 */
export function randomID(): string {
  return uid.getUniqueID() + crypto.randomBytes(8).toString('hex');
}

/**
 * Copy object attributes. If an attribute does not exist in src, set that to
 * null.
 *
 * @param dst - the destination objecct
 * @param src - the source objecct
 * @param attribs - the attribute to copy
 */
export function copyAttribs(dst: object, src: object, attribs: string[]):
    object {
  for (const prop of attribs) {
    if (prop in src) dst[prop] = src[prop];
    else dst[prop] = null;
  }
  return dst;
}

/**
 * Copy object attributes, using attribs to get default values as needed
 * @param dst - the destination objecct
 * @param src - the source objecct
 * @param attribs - the attribute/default values to copy
 */
export function copyAttribsDef(dst: object, src: object, attribs: object):
    object {
  for (const [prop, def] of Object.entries(attribs)) {
    dst[prop] = (src[prop] !== undefined) ? src[prop] : def;
  }
  return dst;
}

/**
 * Gets all the property names (enumerable or not, own properties or not).
 * @param obj - the object
 */
export function getAllPropertyNames(obj: object): string[] {
  const result: Set<string> = new Set();
  while (obj) {
    Object.getOwnPropertyNames(obj).forEach((p) => result.add(p));
    obj = Object.getPrototypeOf(obj);
  }
  const ret: string[] = [];
  result.forEach((e) => ret.push(e));
  return ret;
}

export type PromisifiedObj<T> = {
  // We probably could use some typescript voodoo to get the exact mapped type
  [P in keyof T]: T[P] extends Function ? Function : T[P]
}

/**
 * This takes an input object, returns an object whose properties are
 * getters/setters mapped to the input object, and also all methods in the input
 * object prototype are wrapped with promisify. Note that some functions in the
 * promisify'ed object might not expect an extra callback parameter, so use the
 * original object to call those functions!
 * @param obj - the input object
 */
export function promisifyObj<T>(obj: T): PromisifiedObj<T> {
  /**
   * Constructor representing an promisified object.
   */
  function Promisified(): void {
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
    if (_promisify.custom in proto[name]) {
      Promisified.prototype[name] = proto[name][_promisify.custom].bind(obj);
    } else {
      Promisified.prototype[name] = _promisify(proto[name].bind(obj));
    }
  }

  return ret;
}

/**
 * Computes the bcrypt hash for a particular password (asynchronously).
 * Returning the resulting hashed password
 * @param passwd -  the password to compute a hash on
 */
export async function hashPassword(passwd: string): Promise<string> {
  return await bcrypt.hash(passwd, config.BCRYPT_ROUNDS);
}

/**
 * Verifies that the password and hash matches (asynchronously).
 * @param passwd - the password
 * @param hash - the bcrypt hash
 */
export async function chkPassword(passwd: string, hash: string):
    Promise<boolean> {
  return await bcrypt.compare(passwd, hash);
}


/**
 * Wrapper log function for console.log, which will suppress output during
 * testing
 */
export function log(...msg): void {
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

export type Jsonable = number | boolean | null | undefined |
  {[P: string]: Jsonable} | Jsonable[];

/**
 * Makes a deep copy of an object using a serialization/deserializaion JSON
 * technique. This works for basic objects/strings/arrays/numbers. This does NOT
 * work for complex objects (i.e. objects with special constructors, etc.).
 * @param obj - a simple object to clone.
 */
export function deepJSONCopy<O extends Jsonable>(obj: O): O {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Sets a default value of property in object if that property evaluates to
 * undefined or null.
 * @param obj - the object
 * @param prop - the property name
 * @param defaultVal - the default value if current value is undefined/null
 */
export function objDefault(obj: object, prop: string, defaultVal: any): void {
  if (_utils.isNullOrUndefined(obj[prop])) obj[prop] = defaultVal;
}

export * from 'util';

export const fnew = (F, ...a): any => new F(...a);
export const f = (fn, ...args): any => fn.bind(null, ...args);
export const ft = <Args extends any[], Ret>(fn: (...args: Args) => Ret,
  _this: any, ...args: Args): Ret => fn.bind(_this, ...args);
export const norder = (a: number, b: number): number => a - b;
export const ident = <T>(x: T): T => x;
export const caseInsensOrder = (a: string, b: string): number =>
  a.toLowerCase().localeCompare(b.toLowerCase());
export const asyncHan = <P extends core.Params = core.ParamsDictionary,
  ResBody = any, ReqBody = any, ReqQuery = core.Query>(fn:
    express.RequestHandler<P, ResBody, ReqBody, ReqQuery>) =>
    function asyncUtilWrap(req: express.Request<P, ResBody, ReqBody, ReqQuery>,
        res: express.Response<ResBody>,
        next: core.NextFunction): Promise<void> {
      const fnReturn = fn(req, res, next);
      return Promise.resolve(fnReturn).catch(next);
    };

export type Null = {_unused_nullery: never}|null;
export type Some<T> = Null | T;

export type Check<Succ, Fail> = [true, Succ] | [false, Fail];

/**
 * Determines whether if a check monad is successful or not
 */
export function isSuccess<S, F>(chk: Check<S, F>): chk is [true, S] {
  return chk[0];
}

/** Returns a success monad */
export function Success<S>(succ: S): [true, S] {
  return [true, succ];
}
/** Returns a fail monad */
export function Fail<F>(fail: F): [false, F] {
  return [false, fail];
}

/**
 * This is a special typeguard to test whether if something is null or not. This
 * does not use the null type, but instead chains a dummy type that pretends to
 * be null (adds an imaginary field to force typescript to give a big fat error
 * if null.
 *
 * @param val - the value to test
 */
export function isNull<T>(val: Some<T>): val is Null {
  if (val === null) {
    return true;
  } else {
    return false;
  }
}

declare global {
  interface Array<T> {
    nsort: () => Array<T>;
  }
}

Array.prototype.nsort = function(): any[] {
  return Array.prototype.sort.call(this, module.exports.norder);
};
