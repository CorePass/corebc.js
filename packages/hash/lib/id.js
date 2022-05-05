"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.id = void 0;
var sha3_1 = require("@ethersproject/sha3");
var strings_1 = require("@ethersproject/strings");
function id(text) {
    return (0, sha3_1.sha256)((0, strings_1.toUtf8Bytes)(text));
}
exports.id = id;
//# sourceMappingURL=id.js.map