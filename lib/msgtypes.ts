
/**
 * This represents all the broader category types that can occur for a given
 * message
 */
export enum MessageType {
  LOGIN = 'login',
  PERM = 'perm',
  ILL_ARG = 'ill-arg',
  ILL_STATE = 'ill-state',
  SUCCESS = 'success',
  UNKNOWN = 'unknown',
  INTERNAL = 'internal',
}

const mt = MessageType;
export const codes = {
  alreadyjoin: mt.ILL_STATE,
  bademail: mt.ILL_ARG,
  badformat: mt.ILL_ARG,
  badstatus: mt.PERM,
  badteam: mt.ILL_ARG,
  badteamname: mt.ILL_STATE,
  badteampass: mt.PERM,
  badticket: mt.ILL_ARG,
  badperm: mt.PERM,
  badpassword: mt.PERM,
  badproj: mt.ILL_ARG,
  baduid: mt.ILL_ARG,
  empty: mt.ILL_ARG,
  duplicatechoice: mt.ILL_ARG,
  internal: mt.INTERNAL,
  multifile: mt.ILL_ARG,
  noproject: mt.ILL_STATE,
  nologin: mt.LOGIN,
  nofile: mt.ILL_ARG,
  nouser: mt.PERM,
  notfound: mt.ILL_ARG,
  notinteam: mt.ILL_ARG,
  notmanager: mt.PERM,
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
