const _utils = require('util');
const promisify = _utils.promisify;

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

module.exports = Object.assign({}, _utils, {promisifyObj: promisifyObj});
