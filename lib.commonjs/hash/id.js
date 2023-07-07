"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.id = void 0;
const keccak_js_1 = require("../crypto/keccak.js");
const corebc_js_1 = require("../corebc.js");
const index_js_1 = require("../utils/index.js");
/**
 *  A simple hashing function which operates on UTF-8 strings to
 *  compute an 32-byte identifier.
 *
 *
 *  @example:
 *    id("hello world")
 *    //_result:
 */
function id(value, useKeccak) {
    if (useKeccak) {
        return (0, keccak_js_1.keccak256)((0, index_js_1.toUtf8Bytes)(value));
    }
    return (0, corebc_js_1.sha256)((0, index_js_1.toUtf8Bytes)(value));
}
exports.id = id;
//# sourceMappingURL=id.js.map