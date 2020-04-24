const config = require('./config.js');
const {MessageType: mt, codes} = require('./msgtypes.js');

/**
 * Represents a message object used for responding to AJAX requests.
 */
class Message {
  /**
   * Convenience constructor for a success message
   * @param {String} msg    the string message
   * @param {Object} body   the payload body
   * @return {Message} the created message
   */
  static success(msg, body=null) {
    return new Message(msg, true, mt.SUCCESS, body);
  }

  /**
   * Convenience constructor for a fail message
   * @param {String}      msg    the string message
   * @param {String}      debug  a debug reason for the failure (only available
   *                             in testing mode). This must be a valid message
   *                             code.
   * @return {Message} the created message
   */
  static fail(msg, debug=null) {
    const catg = codes[debug];
    if (!catg) debug = 'unknown-' + debug;
    if (config.TESTING) {
      return new Message(msg, false, catg, {debug});
    } else {
      return new Message(msg, false, catg);
    }
  }

  /**
   * Creates a new message
   * @param {String} msg           the string message
   * @param {boolean} success      whether if this transaction is a success
   *                               message
   * @param {MessageType} category the category of error message
   * @param {Object} body the payload body of this message
   */
  constructor(msg, success, category, body) {
    this.msg = msg;
    this.success = !!success;
    this.category = category ? category.valueOf() : 'unknown';
    this.body = body;
  }
}

module.exports = Message;
