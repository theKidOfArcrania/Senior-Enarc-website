const fs = require('fs').promises;
const os = require('os');
const readline = require('readline');
const Table = require('cli-table3');

const config = require('./config.js');
config.TESTING = true;

const sqldb = require('./model/sqldb.js');

const loader = require('../test/data/loader.js');


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const readers = [];
const lines = [];

rl.on('SIGINT', async () => {
  try {
    await saveHistory('~/.enarc-mysql');
  } finally {
    process.exit();
  }
});

/**
 * Reads a line of text from standard input. This also includes line editing
 * support and typical stuff like that.
 */
async function getline() {
  rl.prompt();
  const listen = (line) => {
    if (readers.length) {
      readers.shift()(line);
    } else {
      lines.push(line);
    }
  };
  const end = listen.bind(null, undefined);
  if (lines.length) {
    return lines.shift();
  } else {
    rl.on('line', listen);
    rl.on('close', end);
    const ret = await new Promise((resolve) => readers.push(resolve));
    rl.off('line', listen);
    rl.off('close', end);
    return ret;
  }
}

/**
 * Loads the readline history from a file. Expands ~ in filename
 * @param {String} file    the file to load history from.
 */
async function loadHistory(file) {
  file = file.replace('~', os.homedir());
  rl.history = (await fs.readFile(file, {encoding: 'utf8'}))
      .trim().split('\n');
}

/**
 * Saves the readline history to a file. Expands ~ in filename
 * @param {String} file    the file to save history to.
 */
async function saveHistory(file) {
  file = file.replace('~', os.homedir());
  await fs.writeFile(file, rl.history.join('\n'));
}

/**
 * The main function that will run this small mysql cli interface.
 */
async function main() {
  config.SQLCREDS.multipleStatements = true;
  const db = new sqldb.SQLDatabase(config.SQLCREDS);
  try {
    await loadHistory('~/.enarc-mysql');
  } catch (e) {
    console.error(e);
  }

  try {
    const trans = await db.beginTransaction();
    await loader.loadIntoDB(trans);
    while (true) {
      const qstr = await getline();
      if (qstr === undefined) break;
      if (qstr.trim().toUpperCase() === 'QUIT') break;
      try {
        const {field, result} = await trans._query(qstr);
        if (field) {
          const flds = field.map((fld) => fld.name);
          const tbl = new Table({head: flds});
          for (const ent of result) {
            tbl.push(flds.map((fld) => ent[fld] === null ? 'null' : ent[fld]));
          }
          console.log(tbl.toString());
        } else {
          console.log('Affected Rows: ' + result.affectedRows);
          if (result.message) console.log(result.message);
        }
      } catch (e) {
        if (e.code && e.sqlMessage) console.log(e.code + ': ' + e.sqlMessage);
        else console.error(e);
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    rl.close();
    await trans.rollback();
    await saveHistory('~/.enarc-mysql');
  }
}

main();
