"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pbkdf2 = void 0;
var crypto_1 = require("crypto");
var corebc_bytes_1 = require("@corepass/corebc-bytes");
var corebc_logger_1 = require("@corepass/corebc-logger");
var _version_1 = require("./_version");
var logger = new corebc_logger_1.Logger(_version_1.version);
function bufferify(value) {
    return Buffer.from((0, corebc_bytes_1.arrayify)(value));
}
function pbkdf2(password, salt, iterations, keylen, hashAlgorithm) {
    var hash;
    if (hashAlgorithm === "sha256") {
        hash = "sha3-256";
    }
    else if (hashAlgorithm === "sha512") {
        hash = "sha3-512";
    }
    else {
        logger.throwError("unsupported algorithm - " + hashAlgorithm, corebc_logger_1.Logger.errors.UNSUPPORTED_OPERATION, {
            operation: "pbkdf2",
            algorithm: hashAlgorithm
        });
    }
    return (0, corebc_bytes_1.hexlify)((0, crypto_1.pbkdf2Sync)(bufferify(password), bufferify(salt), iterations, keylen, hash));
}
exports.pbkdf2 = pbkdf2;
//# sourceMappingURL=pbkdf2.js.map