"use strict";
/* Browser Crypto Shims */
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomBytes = exports.pbkdf2Sync = exports.createHmac = exports.createHash = exports.Ed448Goldilock = exports.ed448 = void 0;
const tslib_1 = require("tslib");
const hmac_1 = require("@noble/hashes/hmac");
const pbkdf2_1 = require("@noble/hashes/pbkdf2");
const sha256_1 = require("@noble/hashes/sha256");
const sha512_1 = require("@noble/hashes/sha512");
const sha3_1 = require("@noble/hashes/sha3");
const browser_ed448_js_1 = tslib_1.__importDefault(require("./browser-ed448.js"));
exports.ed448 = browser_ed448_js_1.default;
const index_js_1 = require("../utils/index.js");
var ed448goldilock_browser_js_1 = require("./ed448goldilock-browser.js");
Object.defineProperty(exports, "Ed448Goldilock", { enumerable: true, get: function () { return ed448goldilock_browser_js_1.Ed448Goldilock; } });
function getGlobal() {
    if (typeof self !== "undefined") {
        return self;
    }
    if (typeof window !== "undefined") {
        return window;
    }
    if (typeof global !== "undefined") {
        return global;
    }
    throw new Error("unable to locate global object");
}
const anyGlobal = getGlobal();
const crypto = anyGlobal.crypto || anyGlobal.msCrypto;
function createHash(algo) {
    switch (algo) {
        case "sha256":
            return sha256_1.sha256.create();
        case "sha512":
            return sha512_1.sha512.create();
        case "sha3-256":
            return sha3_1.sha3_256.create();
        case "sha3-512":
            return sha3_1.sha3_512.create();
    }
    (0, index_js_1.assertArgument)(false, "invalid hashing algorithm name", "algorithm", algo);
}
exports.createHash = createHash;
function createHmac(_algo, key) {
    const algo = { sha256: sha256_1.sha256, sha512: sha512_1.sha512 }[_algo];
    (0, index_js_1.assertArgument)(algo != null, "invalid hmac algorithm", "algorithm", _algo);
    return hmac_1.hmac.create(algo, key);
}
exports.createHmac = createHmac;
function pbkdf2Sync(password, salt, iterations, keylen, _algo) {
    const algo = { sha256: sha256_1.sha256, sha512: sha512_1.sha512 }[_algo];
    (0, index_js_1.assertArgument)(algo != null, "invalid pbkdf2 algorithm", "algorithm", _algo);
    return (0, pbkdf2_1.pbkdf2)(algo, password, salt, { c: iterations, dkLen: keylen });
}
exports.pbkdf2Sync = pbkdf2Sync;
function randomBytes(length) {
    (0, index_js_1.assert)(crypto != null, "platform does not support secure random numbers", "UNSUPPORTED_OPERATION", {
        operation: "randomBytes",
    });
    (0, index_js_1.assertArgument)(Number.isInteger(length) && length > 0 && length <= 1024, "invalid length", "length", length);
    const result = new Uint8Array(length);
    crypto.getRandomValues(result);
    return result;
}
exports.randomBytes = randomBytes;
//# sourceMappingURL=crypto-browser.js.map