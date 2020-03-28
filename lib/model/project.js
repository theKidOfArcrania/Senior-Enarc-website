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
 * Contains the data model information of a Project.
 */
class Project {
  /**
   * Creates a Project from a projID
   * @param {String} projID   the project ID to associate with this project
   */
  constructor(projID) {
    Object.defineProperty(this, 'projID', {writable: false, value: projID});
    // TODO: check dirty properties
  }

  /**
   * (Re)loads the project information associated with this project ID.
   * @return {Promise} a promise on successful loading of database
   */
  async reload() {
    Object.assign(this, await db.inst.loadProjectInfo(this.projID));
    await doReloadOr(this, 'project', Project.bind(null, this.projID));
  }
}

exports.Project = Project;
