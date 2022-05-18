"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.id = void 0;
var corebc_sha3_1 = require("@corepass/corebc-sha3");
var corebc_strings_1 = require("@corepass/corebc-strings");
function id(text) {
    return (0, corebc_sha3_1.sha256)((0, corebc_strings_1.toUtf8Bytes)(text));
}
exports.id = id;
//# sourceMappingURL=id.js.map