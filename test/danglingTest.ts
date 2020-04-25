let test;
if (process.env['DANGLING_TEST']) test = require('../lib/dangling.js');
else test = () => false;

if (!test.before) test.before = () => false;

module.exports = test;
