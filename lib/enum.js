/**
 * Represents an abstract enumeration
 */
class Enum {
  /**
   * @param {String}  name       the name of the enumeration
   */
  constructor(name) {
    this.name = name;
  }

  /**
   * @return {String} the string name of this enum
   */
  valueOf() {
    return this.name;
  }

  /**
   * @return {String} the string name of this enum
   */
  toString() {
    return this.name;
  }

  /**
   * @param {Function} type    the enumeration type
   * @param {String}   name    the name to find the enum mapping.
   * @return {ProjectStatus} the enum value (or undefined)
   */
  static ofString(type, name) {
    return type._values[name];
  }

  /**
   * Registers an enumeration value to its type.
   * @param {Enum} val the enumeration value
   */
  static reg(...vals) {
    for (const val of vals) {
      if (!(val instanceof Enum)) {
        throw new TypeError('Not an enumeration');
      }
      const enumFn = val.constructor;
      if (!enumFn._values) enumFn._values = {};
      enumFn._values[val.name] = val;
      enumFn[val.toString().toUpperCase().replace(/-/g, '_')] = val;
    }
  }
}

module.exports = Enum;
