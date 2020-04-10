const db = require('./db.js');

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
    if (this.assignedProj === null) {
      // TODO: check if this is null or undefined
      this.project = null;
    } else {
      this.project = await db.inst.loadProjectInfo(this.assignedProj);
    }
  }
}

exports.Team = Team;
