'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var backend = require('bcrypto/lib/ed448.js');

// bcrypto does not ship TypeScript declarations.
// @ts-ignore
const ed448 = backend;

exports.default = ed448;
//# sourceMappingURL=ed448.js.map
