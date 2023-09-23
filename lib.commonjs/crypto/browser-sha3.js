"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeHmac = exports.sha512 = exports.sha256 = exports.ripemd160 = void 0;
const tslib_1 = require("tslib");
// @ts-ignore
const ripemd160_browser_1 = tslib_1.__importDefault(require("bcrypto/lib/ripemd160-browser"));
// @ts-ignore
const sha3_browser_js_1 = tslib_1.__importDefault(require("bcrypto/lib/sha3-browser.js"));
const logger_js_1 = require("../logger/logger.js");
const data_js_1 = require("../utils/data.js");
const sha3_js_1 = require("./sha3.js");
const logger = new logger_js_1.Logger('corebc-crypto/browser-sha3/0.0.1');
function ripemd160(data) {
    const d = Buffer.from((0, data_js_1.arrayify)(data));
    const h = ripemd160_browser_1.default.digest(d);
    return (0, data_js_1.hexlify)(h);
}
exports.ripemd160 = ripemd160;
function sha256(data) {
    const d = Buffer.from((0, data_js_1.arrayify)(data));
    const h = sha3_browser_js_1.default.digest(d, 256);
    return (0, data_js_1.hexlify)(h);
}
exports.sha256 = sha256;
function sha512(data) {
    const d = Buffer.from((0, data_js_1.arrayify)(data));
    const h = sha3_browser_js_1.default.digest(d, 512);
    return (0, data_js_1.hexlify)(h);
}
exports.sha512 = sha512;
function computeHmac(algorithm, key, data) {
    const d = Buffer.from((0, data_js_1.arrayify)(data));
    const k = Buffer.from((0, data_js_1.arrayify)(key));
    if (algorithm === sha3_js_1.SupportedAlgorithm.sha256) {
        return (0, data_js_1.hexlify)(sha3_browser_js_1.default.mac(d, k, 256));
    }
    else if (algorithm === sha3_js_1.SupportedAlgorithm.sha512) {
        return (0, data_js_1.hexlify)(sha3_browser_js_1.default.mac(d, k, 512));
    }
    logger.throwError("unsupported algorithm - " + algorithm, logger_js_1.Logger.errors.UNSUPPORTED_OPERATION, {
        operation: "computeHmac",
        algorithm: algorithm
    });
    return "";
}
exports.computeHmac = computeHmac;
//# sourceMappingURL=browser-sha3.js.map