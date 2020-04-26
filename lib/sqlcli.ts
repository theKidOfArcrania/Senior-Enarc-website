import {promises as fs} from 'fs';
import * as os from 'os';
import * as readline from 'readline';
import * as Table from 'cli-table3';

import config from './config.js';
config.TESTING = true;

import SQLDatabase from './model/sqldb.js';

import loadIntoDB from '../test/data/loader.js';


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const readers = [];
const lines = [];

/**
 * Loads the readline history from a file. Expands ~ in filename
 * @param file - the file to load history from.
 */
async function loadHistory(file): Promise<void> {
  file = file.replace('~', os.homedir());
  (rl as any).history = (await fs.readFile(file, {encoding: 'utf8'}))
      .trim().split('\n');
}

/**
 * Saves the readline history to a file. Expands ~ in filename
 * @param file - the file to save history to.
 */
async function saveHistory(file): Promise<void> {
  file = file.replace('~', os.homedir());
  await fs.writeFile(file, (rl as any).history.join('\n'));
}

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
async function getline(): Promise<string> {
  rl.prompt();
  const listen = (line): void => {
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
    const ret = (await new Promise((resolve) => readers.push(resolve)) as
        string);
    rl.off('line', listen);
    rl.off('close', end);
    return ret;
  }
}

/**
 * The main function that will run this small mysql cli interface.
 */
async function main(): Promise<void> {
  config.SQLCREDS.multipleStatements = true;
  const db = new SQLDatabase(config.SQLCREDS);
  try {
    await loadHistory('~/.enarc-mysql');
  } catch (e) {
    console.error(e);
  }

  let commit = false;
  const trans = await db.beginTransaction();
  try {
    await loadIntoDB(trans);
    for (;;) {
      const qstr = await getline();
      if (qstr === undefined) break;
      if (qstr.trim().toUpperCase() === 'COMMIT') {
        commit = true;
        break;
      }
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
    if (commit) await trans.commit();
    else await trans.rollback();
    await saveHistory('~/.enarc-mysql');
  }
}

main();
