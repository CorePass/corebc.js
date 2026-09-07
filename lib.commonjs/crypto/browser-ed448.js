'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var backend = require('bcrypto/lib/ed448-browser.js');

// bcrypto does not ship TypeScript declarations.
// @ts-ignore
const ed448 = backend;

exports.default = ed448;
//# sourceMappingURL=browser-ed448.js.map
