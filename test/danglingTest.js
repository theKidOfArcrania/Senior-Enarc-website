let test;
if (process.env['DANGLING_TEST']) test = require('../lib/dangling.js');
else test = () => false;

module.exports = test;
