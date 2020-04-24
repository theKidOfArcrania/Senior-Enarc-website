const Enum = require('./enum.js');

/**
 * This represents all the broader category types that can occur for a given
 * message
 */
class MessageType extends Enum {}
const mt = MessageType;
const nmt = (...args) => new MessageType(...args);
Enum.reg(nmt('internal'), nmt('login'), nmt('perm'), nmt('ill-arg'),
    nmt('ill-state'), nmt('success'), nmt('unknown'));

exports.MessageType = mt;
exports.codes = {
  alreadyjoin: mt.ILL_STATE,
  badformat: mt.ILL_ARG,
  badproj: mt.ILL_ARG,
  badstatus: mt.PERM,
  badteam: mt.ILL_ARG,
  badteamname: mt.ILL_STATE,
  badteampass: mt.PERM,
  badticket: mt.ILL_ARG,
  badperm: mt.PERM,
  badpassword: mt.PERM,
  badproj: mt.ILL_ARG,
  duplicatechoice: mt.ILL_ARG,
  internal: mt.INTERNAL,
  noproject: mt.ILL_STATE,
  nologin: mt.LOGIN,
  nofile: mt.ILL_ARG,
  nouser: mt.PERM,
  notfound: mt.ILL_ARG,
  notinteam: mt.ILL_ARG,
  notstudent: mt.PERM,
  notemployee: mt.PERM,
  notteamleader: mt.PERM,
  notadmin: mt.PERM,
  nopermproj: mt.PERM,
  noteampass: mt.PERM,
  teamfull: mt.ILL_STATE,
  teamleader: mt.ILL_STATE,
  teamremoveself: mt.ILL_ARG,
};
