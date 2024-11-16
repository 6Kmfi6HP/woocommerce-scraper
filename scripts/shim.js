const path = require('path');
global.__filename = __filename;
global.__dirname = __dirname;

const originalRequire = require;
module.require = require = function(id) {
  if (id.startsWith('./') || id.startsWith('../')) {
    id = path.join(__dirname, id);
  }
  return originalRequire(id);
}; 