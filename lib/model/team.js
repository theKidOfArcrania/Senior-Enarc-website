const db = require('./db.js');

/**
 * Syntactical function to reload some field's value or to initialize it if it
 * doesn't exist.
 * @param {Object} obj   the object
 * @param {String} fld   field name to reload/initialize on obj
 * @param {Function} Otherwise   the constructor for initialization
 * @return {Promise} a promise on successful loading of database
 */
async function doReloadOr(obj, fld, Otherwise) {
  val = obj[fld];
  if (!val) {
    val = new Otherwise();
    Object.defineProperty(obj, fld, {
      writable: false,
      value: val,
    });
  }
  await val.reload();
}

/**
 * Contains the data model information of a Team.
 */
class Team {
  /**
   * Creates a Team from a Tid
   * @param {String} Tid   the Team ID to associate with this Team
   */
  constructor(Tid) {
    Object.defineProperty(this, 'tid', {writable: false, value: Tid});
    // TODO: check dirty properties
  }

  /**
   * (Re)loads the team information associated with this Tid.
   * @return {Promise} a promise on successful loading of database
   */
  async reload() {
    Object.assign(this, await db.inst.loadTeamInfo(this.tid));
    await doReloadOr(this, 'team', Team.bind(null, this.tid));
  }
}

exports.Team = Team;
