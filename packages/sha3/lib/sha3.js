"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeHmac = exports.sha512 = exports.sha256 = exports.ripemd160 = void 0;
var crypto_1 = require("crypto");
var corebc_bytes_1 = require("@corepass/corebc-bytes");
var types_1 = require("./types");
var corebc_logger_1 = require("@corepass/corebc-logger");
var _version_1 = require("./_version");
var logger = new corebc_logger_1.Logger(_version_1.version);
function ripemd160(data) {
    return "0x" + (0, crypto_1.createHash)("ripemd160").update(Buffer.from((0, corebc_bytes_1.arrayify)(data))).digest("hex");
}
exports.ripemd160 = ripemd160;
function sha256(data) {
    return "0x" + (0, crypto_1.createHash)("sha3-256").update(Buffer.from((0, corebc_bytes_1.arrayify)(data))).digest("hex");
}
exports.sha256 = sha256;
function sha512(data) {
    return "0x" + (0, crypto_1.createHash)("sha3-512").update(Buffer.from((0, corebc_bytes_1.arrayify)(data))).digest("hex");
}
exports.sha512 = sha512;
function computeHmac(algorithm, key, data) {
    var d = Buffer.from((0, corebc_bytes_1.arrayify)(data));
    var k = Buffer.from((0, corebc_bytes_1.arrayify)(key));
    if (algorithm === types_1.SupportedAlgorithm.sha256) {
        return "0x" + (0, crypto_1.createHmac)("sha3-256", k).update(d).digest("hex");
    }
    else if (algorithm === types_1.SupportedAlgorithm.sha512) {
        return "0x" + (0, crypto_1.createHmac)("sha3-512", k).update(d).digest("hex");
    }
    logger.throwError("unsupported algorithm - " + algorithm, corebc_logger_1.Logger.errors.UNSUPPORTED_OPERATION, {
        operation: "computeHmac",
        algorithm: algorithm
    });
    return "";
}
exports.computeHmac = computeHmac;
//# sourceMappingURL=sha3.js.map