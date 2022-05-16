"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeHmac = exports.sha512 = exports.sha256 = exports.ripemd160 = void 0;
// @ts-ignore
var ripemd160_browser_1 = __importDefault(require("bcrypto/lib/ripemd160-browser"));
// @ts-ignore
var sha3_browser_1 = __importDefault(require("bcrypto/lib/sha3-browser"));
var corebc_bytes_1 = require("@corepass/corebc-bytes");
var types_1 = require("./types");
var corebc_logger_1 = require("@corepass/corebc-logger");
var _version_1 = require("./_version");
var logger = new corebc_logger_1.Logger(_version_1.version);
function ripemd160(data) {
    var d = Buffer.from((0, corebc_bytes_1.arrayify)(data));
    var h = ripemd160_browser_1.default.digest(d);
    return (0, corebc_bytes_1.hexlify)(h);
}
exports.ripemd160 = ripemd160;
function sha256(data) {
    var d = Buffer.from((0, corebc_bytes_1.arrayify)(data));
    var h = sha3_browser_1.default.digest(d, 256);
    return (0, corebc_bytes_1.hexlify)(h);
}
exports.sha256 = sha256;
function sha512(data) {
    var d = Buffer.from((0, corebc_bytes_1.arrayify)(data));
    var h = sha3_browser_1.default.digest(d, 512);
    return (0, corebc_bytes_1.hexlify)(h);
}
exports.sha512 = sha512;
function computeHmac(algorithm, key, data) {
    var d = Buffer.from((0, corebc_bytes_1.arrayify)(data));
    var k = Buffer.from((0, corebc_bytes_1.arrayify)(key));
    if (algorithm === types_1.SupportedAlgorithm.sha256) {
        return (0, corebc_bytes_1.hexlify)(sha3_browser_1.default.mac(d, k, 256));
    }
    else if (algorithm === types_1.SupportedAlgorithm.sha512) {
        return (0, corebc_bytes_1.hexlify)(sha3_browser_1.default.mac(d, k, 512));
    }
    logger.throwError("unsupported algorithm - " + algorithm, corebc_logger_1.Logger.errors.UNSUPPORTED_OPERATION, {
        operation: "computeHmac",
        algorithm: algorithm
    });
    return "";
}
exports.computeHmac = computeHmac;
//# sourceMappingURL=browser-sha3.js.map