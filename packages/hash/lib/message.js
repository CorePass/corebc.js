"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashMessage = exports.messagePrefix = void 0;
var corebc_bytes_1 = require("@corepass/corebc-bytes");
var corebc_sha3_1 = require("@corepass/corebc-sha3");
var corebc_strings_1 = require("@corepass/corebc-strings");
exports.messagePrefix = "\x19Core Signed Message:\n";
function hashMessage(message) {
    if (typeof (message) === "string") {
        message = (0, corebc_strings_1.toUtf8Bytes)(message);
    }
    return (0, corebc_sha3_1.sha256)((0, corebc_bytes_1.concat)([
        (0, corebc_strings_1.toUtf8Bytes)(exports.messagePrefix),
        (0, corebc_strings_1.toUtf8Bytes)(String(message.length)),
        message
    ]));
}
exports.hashMessage = hashMessage;
//# sourceMappingURL=message.js.map