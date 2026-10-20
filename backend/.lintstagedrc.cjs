// Runs `node --check` per file: node only parses the first path it is given.
module.exports = {
  'src/**/*.js': (files) => files.map((file) => `node --check "${file}"`),
};
