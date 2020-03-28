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
class Company {
  /**
   * Creates a Company from a cName
   * @param {String} cName   the company name to associate with this Company
   */
  constructor(cName) {
    Object.defineProperty(this, 'cName', {writable: false, value: cName});
    // TODO: check dirty properties
  }

  /**
   * (Re)loads the company information associated with this cName.
   * @return {Promise} a promise on successful loading of database
   */
  async reload() {
    Object.assign(this, await db.inst.loadCompanyInfo(this.cName));
    await doReloadOr(this, 'company', Company.bind(null, this.cName));
  }
}

exports.Company = Company;
