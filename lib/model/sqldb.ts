import * as typ from './dbtypes';
import * as mysql from 'mysql';
import * as util from '../util';
import * as ent from './enttypes';
import {getPrimaryKey, getFields, FieldType as ftyp} from './enttypes';
import {Some, isNull} from '../util';

const DELETE_ORDER: ent.Tables[] = ['HELP_TICKET', 'SKILLS_REQ', 'CHOICE',
  'PROJECT', 'TEAM', 'UTD_PERSONNEL', 'STUDENT', 'FACULTY', 'FACULTY_OR_TEAM',
  'USER', 'EMPLOYEE', 'COMPANY', 'INVITE'];

export interface QueryRes {
  result: any;
  field: mysql.FieldInfo[];
}

interface PConnection {
  connect(): Promise<void>;

  query(options: string, values?: any[]): Promise<QueryRes>;

  beginTransaction(): Promise<void>;

  commit(): Promise<void>;

  rollback(): Promise<void>;
}

/**
 * This represents a mysql database transaction.
 */
class SQLDatabaseTransaction extends typ.DatabaseTransaction<
    mysql.PoolConnection> {
  pcon: PConnection;
  tcount: number;

  /**
   * Creates a new mysql database transaction.
   * @param dbinst - the databse instance that created this transaction
   * @param conn - ths actual db connection for this transaction.
   */
  constructor(dbinst: SQLDatabase, conn: mysql.PoolConnection) {
    super(dbinst, conn);

    // Promisify the query function
    conn.constructor.prototype.query[util.promisify.custom] = (query, ...args):
    Promise<{result: any; field: any}> => {
      // console.log(this.con.format(...args));
      return new Promise((resolve: (a1: QueryRes) => void, reject) => {
        args.push((error, res, flds) => {
          if (error) reject(error);
          else resolve({result: res, field: flds});
        });
        conn.query(query, ...args);
      });
    };

    this.pcon = (util.promisifyObj(conn) as unknown) as PConnection;
    this.tcount = 0;
  }


  /**
   * Makes a mysql query, wrapping any errors as a db-caused error.
   * @param qstr - the query string
   * @param args - the array list of arguments.
   */
  async _query(qstr, args?): Promise<QueryRes> {
    return this._wrap(this.pcon.query, qstr, args);
  }

  /**
   * Does the actual commiting
   */
  async _commit(): Promise<void> {
    return this._wrap(this.pcon.commit);
  }

  /**
   * Destroys this database transaction
   */
  async _destroy(): Promise<void> {
    const conn = this._db;
    conn.release();
  }

  /**
   * Does the actual rollback
   */
  async _rollback(): Promise<void> {
    return this._wrap(this.pcon.rollback);
  }


  /**
   * Actually makes a savepoint.
   * @param spname - the savepoint name to save under.
   */
  async _saveSP(spname): Promise<void> {
    await this._query('SAVEPOINT ??', [spname]);
  }

  /**
   * Restores a savepoint from a provided name.
   * @param spname - the savepoint to restore from.
   */
  async _restoreSP(spname): Promise<void> {
    await this._query('ROLLBACK TO ??', [spname]);
  }

  /**
   * Releases a savepoint from a provided name, without restoring the database.
   * Should be overriden by a subclass.  This may cause an error if the specific
   * savepoint name does not exist.
   * @param spname - the savepoint to restore from.
   */
  async _releaseSP(spname): Promise<void> {
    await this._query('RELEASE SAVEPOINT ??', [spname]);
  }

  /**
   * Wrapper around some function to mark all errors as db errors
   * @param fn - the function to execute
   * @param params - a vararg list of parameters
   */
  async _wrap<Args extends any[], Ret>(fn: (...args: Args) => Promise<Ret>,
      ...params: Args): Promise<Ret> {
    try {
      return await fn(...params);
    } catch (e) {
      e.dberror = true;
      throw e;
    }
  }

  /* ************************************
   * BULK OPERATIONS
   * ************************************/

  /**
   * Sets all accepted projects to archived
   */
  async archiveAllProjects(): Promise<void> {
    await this.checkValid();
    await this._query('UPDATE Project SET status = "archived" ' +
        'WHERE status = "accepted"');
  }

  /**
   * Clears all values.
   */
  async clear(): Promise<void> {
    await this.checkValid();
    const deleteEntity = 'DELETE FROM ??';
    for (const name of DELETE_ORDER) {
      await this._query(deleteEntity, ent.schemas[name].tblname);
    }
  }

  /**
   * Fast method for deleting all student users. Should be overriden by
   * subclasses
   */
  async deleteAllStudents(): Promise<void> {
    await this.checkValid();
    await this._query('DELETE FROM User WHERE EXISTS ' +
        '(SELECT suid FROM Student WHERE suid = userID)');
  }


  /* ************************************
   * FIND AGGREGATES
   * ************************************/

  /**
   * Finds all the employees that reside at a company
   * @param company - the company to search from
   * @returns a list of user IDs
   */
  async findEmployeesAt(company: string): Promise<number[]> {
    const qstr = 'SELECT euid FROM Employee WHERE worksAt = ?';
    const res = await this._query(qstr, [company]);
    return Array.prototype.map.call(res, (v) => v.euid);
  }

  /**
   * Searches for the user ID's of all students that are on this team
   * @param teamId - the team ID to search on
   */
  async findMembersOfTeam(teamId): Promise<number[]> {
    await this.checkValid();
    const qstr = 'SELECT suid FROM Student WHERE memberOf = ?';
    const res = (await this._query(qstr, [teamId])).result;
    return Array.prototype.map.call(res, (v) => v.suid);
  }

  /**
   * Finds all the projects that a particular user mentors/sponsors/advises.
   * @param uid - the user ID to search on
   */
  async findManagesProject(uid): Promise<number[]> {
    await this.checkValid();
    const qstr = 'SELECT projID FROM Project WHERE' +
      ' mentor = ? OR sponsor = ? or advisor = ?';
    const res = (await this._query(qstr, [uid, uid, uid])).result;
    return Array.prototype.map.call(res, (v) => v.projID);
  }

  /**
   * Finds all the projects a team has ranked
   * @param tid - the team ID to search on
   */
  async findTeamChoices(tid): Promise<number[]> {
    await this.checkValid();
    const qstr = 'SELECT * FROM Choice WHERE tid = ?';
    const res = (await this._query(qstr, [tid])).result;
    const rankedList = Array(6);
    for (const choice of res) {
      rankedList[choice['ranking']] = choice['pid'];
    }
    return rankedList;
  }

  /**
   * Finds all the entities in the database of a specific type
   * @param entity - the name of the entity
   */
  async _findAllEntities(entity: ent.Tables): Promise<any[]> {
    let qstr = 'SELECT ?? FROM ??';
    const tbl = ent.schemas[entity].tblname;
    const pkey = getPrimaryKey(entity);
    if (entity === 'INVITE') qstr += ' WHERE expiration > NOW()';
    return (await this._query(qstr, [pkey, tbl])).result.map((r) => r[pkey]);
  }


  /**
   * Gets all the skills of a student.
   * @param suid - the student ID
   */
  async getSkills(suid: number): Promise<string[]> {
    const selectSkills = 'SELECT skill FROM Skills WHERE stuUID = ?';
    return Object.values((await this._query(selectSkills, [suid])).result)
        .map((val) => (val as {skill: string}).skill);
  }

  /**
   * Gets the skill requisites of a project.
   * @param pid - the project ID
   */
  async getSkillsReq(pid: number): Promise<string[]> {
    const selectSkills = 'SELECT skillName FROM SkillsReq WHERE pid = ?';
    return Object.values((await this._query(selectSkills, [pid])).result)
        .map((val) => (val as {skillName: string}).skillName);
  }

  /* ************************************
   * FIND OR SEARCHES
   * ************************************/

  /**
   * Finds the team assigned to the project, if it exists.
   * @param pid - the project ID
   */
  async findProjectAssignedTeam(pid): Promise<Some<number>> {
    await this.checkValid();
    const qstr = 'SELECT tid FROM Team WHERE assignedProj = ?';
    const res = (await this._query(qstr, [pid])).result;
    if (res.length !== 1) return null;
    return res[0];
  }

  /**
   * Search a user by an email, returns the respective user ID.
   * @param email - the email to search on
   */
  async searchUserByEmail(email): Promise<Some<number>> {
    await this.checkValid();
    const qstr = 'SELECT userID FROM Users WHERE email = ?';
    const res = (await this._query(qstr, [email])).result;
    if (res.length) {
      return res[0].userID;
    } else {
      return null;
    }
  }

  /**
   * Searches a team by its common name, returning the respective team ID. If
   * failed, returns null;
   * @param name - the name of the team.
   */
  async searchTeamByName(name): Promise<Some<number>> {
    await this.checkValid();
    const qstr = 'SELECT tid FROM Team WHERE name = ?';
    const res = (await this._query(qstr, [name])).result;
    if (res.length) {
      return res[0].tid;
    } else {
      return null;
    }
  }

  /* ************************************
   * MODIFY AGGREGATE
   * ************************************/

  /**
   * Adds some required skills to a project. This does not complain if it a
   * particular skill is already added, it will just quietly ignore repeated
   * skills.
   * @param pid - the project id
   * @param skills - some vararg list of skills to add
   */
  async addSkillsReq(pid, ...skills): Promise<void> {
    await this.checkValid();
    const qstr = 'REPLACE INTO SkillsReq (pid, skillName) VALUES ?';
    await this._query(qstr, [skills.map((s) => [pid, s])]);
  }

  /**
   * Adds some skills to the student. This does not complain if it a
   * particular skill is already added, it will just quietly ignore repeated
   * skills.
   * @param suid - the student user id
   * @param skills - some vararg list of skills to add
   */
  async addSkills(suid, ...skills): Promise<void> {
    await this.checkValid();
    const qstr = 'REPLACE INTO Skills (stuUID, skill) VALUES ?';
    await this._query(qstr, [skills.map((s) => [suid, s])]);
  }

  /**
   * Replaces a set of choices for a particular team (or faculty). This will
   * quietly overwrite over the team's previous choices.
   *
   * @param tid - the team id to search for
   * @param choices - the new set of choices for a team.
   */
  async setChoices(tid, choices): Promise<void> {
    await this.checkValid();
    const vals = choices.slice(0, 6).map((pid, i) => [tid, i, pid]);
    const qstr = 'REPLACE INTO Choice(tid, ranking, pid) VALUES ?';
    await this._query(qstr, [vals]);
  }


  /* ************************************
   * DELETE / INSERT
   * ************************************/

  /**
   * Generic delete entity.
   *
   * @param tableName - the table entity name
   * @param id - the id
   */
  async _deleteEntity(tableName: ent.Tables, id: ent.ID): Promise<boolean> {
    const name = ent.schemas[tableName].tblname;
    const pkey = getPrimaryKey(tableName);
    const qstr = `DELETE FROM ?? ${isNull(id) ? '' : 'WHERE ?? = ?'}`;
    return !!((await this._query(qstr, [name, pkey, id])).result.affectedRows);
  }

  /**
   * Generic insert entity.
   *
   * @param  tableName - the table entity name
   * @param  id -  the id
   * @param  info - the attributes of the entity
   */
  async _insertEntity(tableName: ent.Tables, id, info): Promise<boolean> {
    const name = ent.schemas[tableName].tblname;
    const pkey = getPrimaryKey(tableName);
    info = util.copyAttribs({}, info, getFields(tableName, ftyp.REGULAR));
    info[pkey] = id;

    const test = 'SELECT * FROM ?? WHERE ?? = ?';
    if ((await this._query(test, [name, pkey, info[pkey]]))
        .result.length) return false;
    const qstr = 'INSERT INTO ?? SET ?';
    await this._query(qstr, [name, info]);
    return true;
  }

  //  #####################Loading Entities###############################
  /**
   * Generic load entity from table name, overriden.
   * @param  id - of the entity
   * @param  tblname - table name
   */
  async _loadEntity(id, tblname: ent.Tables): Promise<Some<typ.Entity>> {
    const select = 'SELECT * FROM ?? WHERE ?? = ?';
    const tbl = ent.schemas[tblname].tblname;
    const pkey = getPrimaryKey(tblname);
    const res = (await this._query(select, [tbl, pkey, id])).result;
    if (res.length === 0) return null;
    return Object.assign({}, res[0]);
  }

  //  #########################Altering Entities###############################

  /**
   * Alters entity information associated with ID given a changes to be filtered
   * with a given whitelist and given the entity's name and the name of its ID
   * If successful, this will return true
   *
   * @param entity - name of the entity being modified
   * @param ID - value of ID being search for
   * @param changes - key/value pairs of attributes and new values
   */
  async _alterEntity(entity: ent.Tables, ID, changes):
      Promise<boolean> {
    const acceptedChanges = {};
    let hasChanges = false;
    const tbl = ent.schemas[entity].tblname;

    for (const key of getFields(entity, ftyp.REGULAR)) {
      if (key in changes) {
        acceptedChanges[key] = changes[key];
        hasChanges = true;
      }
    }
    if (!hasChanges) return false;

    const $updateEntity = 'UPDATE ?? SET ? WHERE ?? = ?';
    const res = (await this._query($updateEntity, [tbl, acceptedChanges,
      getPrimaryKey(entity), ID])).result;
    return res.affectedRows >= 1;
  }
}

/**
 * This represents a specific implementation of the database backend, using a
 * mysql backend.
 */
export default class SQLDatabase extends typ.Database<mysql.PoolConnection> {
  _pool: mysql.Pool;

  /**
   * Constructs a new SQLDatabase backend from a set of options, which is
   * directly passed to mysql.createConnection.
   * options - the set of options
   */
  constructor(options) {
    super();
    this._pool = mysql.createPool(options);
  }

  /**
   * Begins a mysql connection that is tied to a transaction. You must commit
   * this transaction in order to save the transaction and release the
   * connection back to the connection pool.
   *
   * @param timeout - a timeout in milliseconds
   */
  async beginTransaction(timeout = -1): Promise<SQLDatabaseTransaction> {
    const pool = this._pool;
    const waitConn = util.promisify(pool.getConnection.bind(pool))();
    const waitTimeout = util.until(timeout);

    let conn = undefined;
    try {
      conn = await Promise.race([waitConn, waitTimeout]);
      await util.promisify(conn.beginTransaction.bind(conn))();
    } catch (e) {
      if (conn) conn.release();
      e.dberror = true;
      throw e;
    }

    if (conn) {
      // Connection succeeds
      const trans = new SQLDatabaseTransaction(this, conn);
      return trans;
    } else {
      // Connection timeout...

      // Make sure this doesn't leak when it finally does connect.
      waitConn.then(util.ft.bind(conn.release)).catch(() => false);
      throw new typ.DBError('Timeout exceeded');
    }
  }

  /**
   * Closes all transactions/connections
   */
  async close(): Promise<void> {
    this._pool.end();
  }
}

