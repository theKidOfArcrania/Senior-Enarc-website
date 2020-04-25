import config from './config';
import {MessageType, codes} from './msgtypes';

/**
 * Represents a message object used for responding to AJAX requests.
 */
export default class Message {
  msg: string;
  success: boolean;
  category: MessageType;
  body: object;

  /**
   * Convenience constructor for a success message
   *
   * @param msg - the string message
   * @param body - the payload body
   */
  static success(msg: string, body: object = null) {
    return new Message(msg, true, MessageType.SUCCESS, body);
  }

  /**
   * Convenience constructor for a fail message
   * @param msg - the string message
   * @param debug - a debug reason for the failure (only available in testing 
   *                mode). This must be a valid message code.
   */
  static fail(msg: string, debug:string) {
    const catg = codes[debug];
    if (!catg) debug = 'unknown-' + debug;
    if (config.TESTING) {
      return new Message(msg, false, catg, {debug});
    } else {
      return new Message(msg, false, catg, null);
    }
  }

  /**
   * Creates a new message
   * @param msg - the string message
   * @param success - whether if this transaction is a success message
   * @param category - the category of error message
   * @param body - the payload body of this message
   */
  constructor(msg, success, category, body) {
    this.msg = msg;
    this.success = !!success;
    this.category = category ? category.valueOf() : 'unknown';
    this.body = body;
  }
}
