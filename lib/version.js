const { readFileSync } = require('fs');
const { join } = require('path');

const pkgPath = join(__dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

exports.VERSION = pkg.version;
exports.PKG_NAME = pkg.name;
exports.PKG_DESCRIPTION = pkg.description;
