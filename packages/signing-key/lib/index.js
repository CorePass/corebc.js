"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computePublicKey = exports.recoverPublicKey = exports.SigningKey = void 0;
// @ts-ignore: TS7016
var ed448_1 = __importDefault(require("bcrypto/lib/ed448"));
var bytes_1 = require("@ethersproject/bytes");
var properties_1 = require("@ethersproject/properties");
var logger_1 = require("@ethersproject/logger");
var _version_1 = require("./_version");
var logger = new logger_1.Logger(_version_1.version);
var SigningKey = /** @class */ (function () {
    function SigningKey(privateKey) {
        (0, properties_1.defineReadOnly)(this, "privateKey", (0, bytes_1.hexlify)(privateKey));
        (0, properties_1.defineReadOnly)(this, "publicKey", computePublicKey(privateKey));
        (0, properties_1.defineReadOnly)(this, "_isSigningKey", true);
    }
    SigningKey.prototype.signDigest = function (digest) {
        var pub = computePublicKey(this.privateKey);
        var sig = sign(this.privateKey, digest);
        return (0, bytes_1.hexConcat)([sig, pub]);
    };
    SigningKey.isSigningKey = function (value) {
        return !!(value && value._isSigningKey);
    };
    return SigningKey;
}());
exports.SigningKey = SigningKey;
function sign(key, digest) {
    var keyBuffer = Buffer.from((0, bytes_1.arrayify)(key));
    if (keyBuffer.length !== 57) {
        logger.throwArgumentError("invalid private key", "key", "[REDACTED]");
    }
    var digestBuffer = Buffer.from((0, bytes_1.arrayify)(digest));
    if (digestBuffer.length !== 32) {
        logger.throwArgumentError("bad digest length", "digest", digest);
    }
    if (keyBuffer[56] > 127) {
        var prefix = keyBuffer.slice(0, 57);
        prefix[0] &= 0xfc;
        prefix[55] |= 0x80;
        prefix[56] = 0;
        var scalar = prefix.slice(0, 56);
        var sig_1 = ed448_1.default.signWithScalar(digestBuffer, scalar, prefix);
        return (0, bytes_1.hexlify)(sig_1);
    }
    var sig = ed448_1.default.sign(digestBuffer, keyBuffer);
    return (0, bytes_1.hexlify)(sig);
}
function recoverPublicKey(digest, signature) {
    var digestBuffer = Buffer.from((0, bytes_1.arrayify)(digest));
    if (digestBuffer.length !== 32) {
        logger.throwArgumentError("bad digest length", "digest", digest);
    }
    var sigBuffer = Buffer.from((0, bytes_1.arrayify)(signature));
    if (sigBuffer.length !== 171) {
        logger.throwArgumentError("invalid signature", "signature", signature);
    }
    var sig = sigBuffer.slice(0, 114);
    var pub = sigBuffer.slice(114);
    if (ed448_1.default.verify(digestBuffer, sig, pub)) {
        return (0, bytes_1.hexlify)(pub);
    }
    logger.throwArgumentError("invalid signature", "signature", signature);
    return "";
}
exports.recoverPublicKey = recoverPublicKey;
function computePublicKey(key) {
    var bytes = Buffer.from((0, bytes_1.arrayify)(key));
    if (bytes.length !== 57) {
        logger.throwArgumentError("invalid private key", "key", "[REDACTED]");
    }
    if (bytes[56] > 127) {
        var scalar = bytes.slice(0, 56);
        scalar[0] &= 0xfc;
        scalar[55] |= 0x80;
        var pub_1 = ed448_1.default.publicKeyFromScalar(bytes);
        return (0, bytes_1.hexlify)(pub_1);
    }
    var pub = ed448_1.default.publicKeyCreate(bytes);
    return (0, bytes_1.hexlify)(pub);
}
exports.computePublicKey = computePublicKey;
//# sourceMappingURL=index.js.map