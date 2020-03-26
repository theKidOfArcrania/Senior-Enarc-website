//  Importing Packages
const mysql = require('mysql');
const promisify  = require('util').promisify;
const user = require('./lib/model/user.js');

// For reading input
const readline = require("readline");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(q) { return new Promise(rl.question.bind(rl, q)); }

function promisifyObj(obj) {
  function Promisified() {
    // Make a getter/setter pair to the original object for convenience
    for (const name of Object.getOwnPropertyNames(obj)) {
      Object.defineProperty(this, name,
        {get: () => obj[name],
         set: (val) => obj[name] = val});
    }
  }

  const ret = new Promisified();

  // Take all functions in object prototype, and wrap it around a promisify API
  const proto = obj.constructor.prototype;
  for (let name of Object.getOwnPropertyNames(proto)) {
    if (promisify.custom in proto[name]) {
      Promisified.prototype[name] = proto[name][promisify.custom].bind(obj);
    } else {
      Promisified.prototype[name] = promisify(proto[name].bind(obj));
    }
  }

  return ret;
}

const con = mysql.createConnection({
  //  Change Login Information as required
  host: '127.0.0.1',
  user: 'root',
  password: 'dayOsuntsihatwir77@sql',
  database: 'CSProjectSystem'});

// Promisify the query function
con.constructor.prototype.query[promisify.custom] = function(/*...*/) {
  const _this = this;
  const args = Array.prototype.slice.call(arguments);
  return new Promise((resolve, reject) => {
    args.push((error, res, flds) => {
      if (error) reject(error);
      else resolve({result: res, field: flds});
    });
    _this.query.apply(_this, args);
  });
};

const pcon = promisifyObj(con);

async function do_stuff() {


  // Make connection
  await pcon.connect();

  // Begin a transaction, make sure this transaction is atomic
  await pcon.beginTransaction();

  try {
    // This is how you make an insertion query
    await pcon.query('INSERT INTO Users (UserID, Fname, Lname, Email, Address, '+
      'is_utd, is_employee) VALUES (?, ?, ?, ?, ?, ?, ?)', // query
      // values to replace
      [1, 'John', 'Doe', 'john@example.com', '100 Fake Street', true, false]);

    // If an error occurs in the middle, we rollback all changes
    //throw 3;

    // Other connections will receive a snapshot before transaction began, and
    // if some other transaction tries to modify User table, that will be
    // stalled until this ends... try to wait for a bit...
    // await question("Press enter to continue...");

    await pcon.query('INSERT INTO UTD_Personnel (Uid, UType, NetID, isAdmin) ' +
      'VALUES (?, ?, ?, ?)', // query
      // values to replace
      [1, user.UTDPersonnel.types.STUDENT, 'jnd170033', false]);

    const results = (await pcon.query('SELECT * FROM Users')).result;
    console.log(results[0]); // Prints the first result
    console.log(results[0].Fname); // Prints "John"

    // Commit changes
    await pcon.commit();
    console.log('Success with inserting item');

    // End connection
    con.end();
  } catch (e) {
    // An exception has occurred... rollback all changes
    console.log('Rolling back...');
    await pcon.rollback();
    throw e;
  }
}

do_stuff();
