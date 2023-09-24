"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha512 = exports.computeHmac = exports.legacySha256 = exports.sha256 = exports.ripemd160 = exports.SupportedAlgorithm = void 0;
const logger_js_1 = require("../logger/logger.js");
const data_js_1 = require("../utils/data.js");
const crypto_js_1 = require("./crypto.js");
const buffer_1 = require("buffer");
const logger = new logger_js_1.Logger("sha3/0.0.1");
const _sha256 = function (data) {
    let v = "0x" +
        (0, crypto_js_1.createHash)("sha3-256")
            .update(buffer_1.Buffer.from((0, data_js_1.arrayify)(data)))
            .digest("hex");
    return v;
};
const _sha512 = function (data) {
    let v = "0x" +
        (0, crypto_js_1.createHash)("sha3-512")
            .update(buffer_1.Buffer.from((0, data_js_1.arrayify)(data)))
            .digest("hex");
    return v;
};
// @ts-ignore
let __sha256 = _sha256;
// @ts-ignore
let __sha512 = _sha512;
let locked256 = false, locked512 = false;
/**
 *  Compute the cryptographic SHA2-256 hash of %%data%%.
 *
 *  @_docloc: api/crypto:Hash Functions
 *  @returns DataHexstring
 *
 *  @example:
 *    sha256("0x")
 *    //_result:
 *
 *    sha256("0x1337")
 *    //_result:
 *
 *    sha256(new Uint8Array([ 0x13, 0x37 ]))
 *    //_result:
 *
 */
var SupportedAlgorithm;
(function (SupportedAlgorithm) {
    SupportedAlgorithm["sha256"] = "sha256";
    SupportedAlgorithm["sha512"] = "sha512";
})(SupportedAlgorithm || (exports.SupportedAlgorithm = SupportedAlgorithm = {}));
function ripemd160(data) {
    let createdHash = "0x" +
        (0, crypto_js_1.createHash)("ripemd160")
            .update(buffer_1.Buffer.from((0, data_js_1.arrayify)(data)))
            .digest("hex");
    const v = "0x" + createdHash;
    if (typeof createdHash !== "string") {
        createdHash = (0, data_js_1.hexlify)(createdHash);
        return createdHash;
    }
    return v;
}
exports.ripemd160 = ripemd160;
function sha256(data) {
    let createdHash = (0, crypto_js_1.createHash)("sha3-256")
        .update(buffer_1.Buffer.from((0, data_js_1.arrayify)(data)))
        .digest("hex");
    const v = "0x" + createdHash;
    if (typeof createdHash !== "string") {
        createdHash = (0, data_js_1.hexlify)(createdHash);
        return createdHash;
    }
    return v;
}
exports.sha256 = sha256;
function legacySha256(data) {
    const _data = (0, data_js_1.getBytes)(data, "data");
    const hexlified = (0, data_js_1.hexlify)((0, crypto_js_1.createHash)("sha256").update(_data).digest());
    return hexlified;
}
exports.legacySha256 = legacySha256;
function computeHmac(algorithm, key, data) {
    const d = buffer_1.Buffer.from((0, data_js_1.arrayify)(data));
    const k = buffer_1.Buffer.from((0, data_js_1.arrayify)(key));
    if (algorithm === SupportedAlgorithm.sha256) {
        return "0x" + (0, crypto_js_1.createHmac)("sha3-256", k).update(d).digest("hex");
    }
    else if (algorithm === SupportedAlgorithm.sha512) {
        return "0x" + (0, crypto_js_1.createHmac)("sha3-512", k).update(d).digest("hex");
    }
    logger.throwError("unsupported algorithm - " + algorithm, logger_js_1.Logger.errors.UNSUPPORTED_OPERATION, {
        operation: "computeHmac",
        algorithm: algorithm,
    });
    return "";
}
exports.computeHmac = computeHmac;
sha256._ = _sha256;
sha256.lock = function () {
    locked256 = true;
};
sha256.register = function (func) {
    if (locked256) {
        throw new Error("sha256 is locked");
    }
    __sha256 = func;
};
Object.freeze(sha256);
/**
 *  Compute the cryptographic SHA2-512 hash of %%data%%.
 *
 *  @_docloc: api/crypto:Hash Functions
 *  @returns DataHexstring
 *
 *  @example:
 *    sha512("0x")
 *    //_result:
 *
 *    sha512("0x1337")
 *    //_result:
 *
 *    sha512(new Uint8Array([ 0x13, 0x37 ]))
 *    //_result:
 */
function sha512(data) {
    let createdHash = (0, crypto_js_1.createHash)("sha3-512")
        .update(buffer_1.Buffer.from((0, data_js_1.arrayify)(data)))
        .digest("hex");
    const v = "0x" + createdHash;
    if (typeof createdHash !== "string") {
        createdHash = (0, data_js_1.hexlify)(createdHash);
        return createdHash;
    }
    return v;
}
exports.sha512 = sha512;
sha512._ = _sha512;
sha512.lock = function () {
    locked512 = true;
};
sha512.register = function (func) {
    if (locked512) {
        throw new Error("sha512 is locked");
    }
    __sha512 = func;
};
Object.freeze(sha256);
//# sourceMappingURL=sha3.js.map