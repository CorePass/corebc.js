"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.namehash = exports.isValidName = void 0;
var corebc_bytes_1 = require("@corepass/corebc-bytes");
var corebc_strings_1 = require("@corepass/corebc-strings");
var corebc_sha3_1 = require("@corepass/corebc-sha3");
var corebc_logger_1 = require("@corepass/corebc-logger");
var _version_1 = require("./_version");
var logger = new corebc_logger_1.Logger(_version_1.version);
var Zeros = new Uint8Array(32);
Zeros.fill(0);
var Partition = new RegExp("^((.*)\\.)?([^.]+)$");
function isValidName(name) {
    try {
        var comps = name.split(".");
        for (var i = 0; i < comps.length; i++) {
            if ((0, corebc_strings_1.nameprep)(comps[i]).length === 0) {
                throw new Error("empty");
            }
        }
        return true;
    }
    catch (error) { }
    return false;
}
exports.isValidName = isValidName;
function namehash(name) {
    /* istanbul ignore if */
    if (typeof (name) !== "string") {
        logger.throwArgumentError("invalid ENS name; not a string", "name", name);
    }
    var current = name;
    var result = Zeros;
    while (current.length) {
        var partition = current.match(Partition);
        if (partition == null || partition[2] === "") {
            logger.throwArgumentError("invalid ENS address; missing component", "name", name);
        }
        var label = (0, corebc_strings_1.toUtf8Bytes)((0, corebc_strings_1.nameprep)(partition[3]));
        result = (0, corebc_sha3_1.sha256)((0, corebc_bytes_1.concat)([result, (0, corebc_sha3_1.sha256)(label)]));
        current = partition[2] || "";
    }
    return (0, corebc_bytes_1.hexlify)(result);
}
exports.namehash = namehash;
//# sourceMappingURL=namehash.js.map