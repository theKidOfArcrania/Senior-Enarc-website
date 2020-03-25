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
  static success(msg, body={}) {
    return new Message(msg, true, body);
  }

  /**
   * Convenience constructor for a fail message
   * @param {String} msg    the string message
   * @param {Object} body   the payload body
   * @return {Message} the created message
   */
  static fail(msg, body={}) {
    return new Message(msg, false, body);
  }

  /**
   * Creates a new message
   * @param {String} msg the string message
   * @param {boolean} success whether if this transaction is a success message
   * @param {Object} body the payload body of this message
   */
  constructor(msg, success, body) {
    this.msg = msg;
    this.success = !!success;
    this.body = body;
  }
}

module.exports = Message;
