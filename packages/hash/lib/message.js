"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashMessage = exports.messagePrefix = void 0;
var bytes_1 = require("@ethersproject/bytes");
var sha3_1 = require("@ethersproject/sha3");
var strings_1 = require("@ethersproject/strings");
exports.messagePrefix = "\x19Core Signed Message:\n";
function hashMessage(message) {
    if (typeof (message) === "string") {
        message = (0, strings_1.toUtf8Bytes)(message);
    }
    return (0, sha3_1.sha256)((0, bytes_1.concat)([
        (0, strings_1.toUtf8Bytes)(exports.messagePrefix),
        (0, strings_1.toUtf8Bytes)(String(message.length)),
        message
    ]));
}
exports.hashMessage = hashMessage;
//# sourceMappingURL=message.js.map