"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccountPath = exports.isValidMnemonic = exports.entropyToMnemonic = exports.mnemonicToEntropy = exports.mnemonicToSeed = exports.HDNode = exports.defaultPath = void 0;
var bytes_1 = require("@ethersproject/bytes");
var strings_1 = require("@ethersproject/strings");
var pbkdf2_1 = require("@ethersproject/pbkdf2");
var properties_1 = require("@ethersproject/properties");
var signing_key_1 = require("@ethersproject/signing-key");
var sha3_1 = require("@ethersproject/sha3");
var transactions_1 = require("@ethersproject/transactions");
var wordlists_1 = require("@ethersproject/wordlists");
var logger_1 = require("@ethersproject/logger");
var _version_1 = require("./_version");
var logger = new logger_1.Logger(_version_1.version);
var HardenedBit = 0x80000000;
// Returns a byte with the MSB bits set
function getUpperMask(bits) {
    return ((1 << bits) - 1) << (8 - bits);
}
// Returns a byte with the LSB bits set
function getLowerMask(bits) {
    return (1 << bits) - 1;
}
function getWordlist(wordlist) {
    if (wordlist == null) {
        return wordlists_1.wordlists["en"];
    }
    if (typeof (wordlist) === "string") {
        var words = wordlists_1.wordlists[wordlist];
        if (words == null) {
            logger.throwArgumentError("unknown locale", "wordlist", wordlist);
        }
        return words;
    }
    return wordlist;
}
function sha512Hash(password, salt) {
    var p = (0, bytes_1.arrayify)(password);
    var s = (0, bytes_1.arrayify)(salt);
    return (0, bytes_1.arrayify)((0, pbkdf2_1.pbkdf2)(p, s, 2048, 57, "sha256"));
}
function concatKeyIndexSalt(prefix, key, index, salt) {
    var ind = new Uint8Array(4);
    var p = new Uint8Array(1);
    p[0] = prefix % 256;
    var j = index;
    for (var i = 0; i < 4; i++) {
        ind[i] = j % 256;
        j = Math.floor(j / 256);
    }
    var t = (0, bytes_1.concat)([p, key, ind]);
    return sha512Hash(t, salt);
}
function addScalar(a, b) {
    b = (0, bytes_1.concat)([b.slice(0, 63) + "0x00000000"]);
    b[0] &= 0xfc;
    var c = new Uint8Array(57);
    var hold = 0;
    for (var i = 0; i < 57; i++) {
        hold += a[i] + b[i];
        c[i] = hold % 256;
        hold = Math.floor(hold / 256);
    }
    return c;
}
;
var _constructorGuard = {};
exports.defaultPath = "m/44'/60'/0'/0/0";
;
var HDNode = /** @class */ (function () {
    /**
     *  This constructor should not be called directly.
     *
     *  Please use:
     *   - fromMnemonic
     *   - fromSeed
     */
    function HDNode(constructorGuard, extendedPrivateKey, publicKey, parentFingerprint, prefix, index, depth, mnemonicOrPath) {
        var _newTarget = this.constructor;
        logger.checkNew(_newTarget, HDNode);
        /* istanbul ignore if */
        if (constructorGuard !== _constructorGuard) {
            throw new Error("HDNode constructor cannot be called directly");
        }
        if (extendedPrivateKey) {
            (0, properties_1.defineReadOnly)(this, "extendedPrivateKey", extendedPrivateKey);
            var privateKey = (0, bytes_1.hexDataSlice)(extendedPrivateKey, 57, 114);
            console.log("FUCK", extendedPrivateKey, privateKey);
            var signingKey = new signing_key_1.SigningKey(privateKey);
            (0, properties_1.defineReadOnly)(this, "privateKey", signingKey.privateKey);
            (0, properties_1.defineReadOnly)(this, "publicKey", signingKey.publicKey);
        }
        else {
            (0, properties_1.defineReadOnly)(this, "extendedPrivateKey", null);
            (0, properties_1.defineReadOnly)(this, "privateKey", null);
            (0, properties_1.defineReadOnly)(this, "publicKey", (0, bytes_1.hexlify)(publicKey));
        }
        (0, properties_1.defineReadOnly)(this, "parentFingerprint", parentFingerprint);
        (0, properties_1.defineReadOnly)(this, "fingerprint", (0, bytes_1.hexDataSlice)((0, sha3_1.ripemd160)((0, sha3_1.sha256)(this.publicKey)), 0, 4));
        (0, properties_1.defineReadOnly)(this, "prefix", prefix);
        (0, properties_1.defineReadOnly)(this, "address", (0, transactions_1.computeAddress)(this.publicKey, prefix));
        (0, properties_1.defineReadOnly)(this, "index", index);
        (0, properties_1.defineReadOnly)(this, "depth", depth);
        if (mnemonicOrPath == null) {
            // From a source that does not preserve the path (e.g. extended keys)
            (0, properties_1.defineReadOnly)(this, "mnemonic", null);
            (0, properties_1.defineReadOnly)(this, "path", null);
        }
        else if (typeof (mnemonicOrPath) === "string") {
            // From a source that does not preserve the mnemonic (e.g. neutered)
            (0, properties_1.defineReadOnly)(this, "mnemonic", null);
            (0, properties_1.defineReadOnly)(this, "path", mnemonicOrPath);
        }
        else {
            // From a fully qualified source
            (0, properties_1.defineReadOnly)(this, "mnemonic", mnemonicOrPath);
            (0, properties_1.defineReadOnly)(this, "path", mnemonicOrPath.path);
        }
    }
    HDNode.prototype.neuter = function () {
        return new HDNode(_constructorGuard, null, this.publicKey, this.parentFingerprint, this.prefix, this.index, this.depth, this.path);
    };
    HDNode.prototype._derive = function (index) {
        if (index > 0xffffffff) {
            throw new Error("invalid index - " + String(index));
        }
        if (!this.extendedPrivateKey) {
            throw new Error("cannot derive child of neutered node");
        }
        var extendedPrivateKey = (0, bytes_1.arrayify)(this.extendedPrivateKey);
        var salt = extendedPrivateKey.slice(0, 57);
        var key = extendedPrivateKey.slice(57, 114);
        var r0, r1;
        if (index >= HardenedBit) {
            r0 = concatKeyIndexSalt(1, key, index, salt);
            r1 = concatKeyIndexSalt(0, key, index, salt);
        }
        else {
            var pub = (0, bytes_1.arrayify)(this.publicKey);
            r0 = concatKeyIndexSalt(3, pub, index, salt);
            r1 = concatKeyIndexSalt(2, pub, index, salt);
        }
        var newKey = (0, bytes_1.hexlify)((0, bytes_1.concat)([r0, addScalar(key, r1)]));
        // Base path
        var path = this.path;
        if (path) {
            path += index >= HardenedBit ? "/" + (index - HardenedBit) + "'" : "/" + index;
        }
        var mnemonicOrPath = path;
        var srcMnemonic = this.mnemonic;
        if (srcMnemonic) {
            mnemonicOrPath = Object.freeze({
                phrase: srcMnemonic.phrase,
                path: path,
                locale: (srcMnemonic.locale || "en")
            });
        }
        return new HDNode(_constructorGuard, newKey, null, this.fingerprint, this.prefix, index, this.depth + 1, mnemonicOrPath);
    };
    HDNode.prototype.derivePath = function (path) {
        var components = path.split("/");
        if (components.length === 0 || (components[0] === "m" && this.depth !== 0)) {
            throw new Error("invalid path - " + path);
        }
        if (components[0] === "m") {
            components.shift();
        }
        var result = this;
        for (var i = 0; i < components.length; i++) {
            var component = components[i];
            if (component.match(/^[0-9]+'$/)) {
                var index = parseInt(component.substring(0, component.length - 1));
                if (index >= HardenedBit) {
                    throw new Error("invalid path index - " + component);
                }
                result = result._derive(HardenedBit + index);
            }
            else if (component.match(/^[0-9]+$/)) {
                var index = parseInt(component);
                if (index >= HardenedBit) {
                    throw new Error("invalid path index - " + component);
                }
                result = result._derive(index);
            }
            else {
                throw new Error("invalid path component - " + component);
            }
        }
        return result;
    };
    HDNode._fromSeed = function (seed, mnemonic, prefix) {
        var seedArray = (0, bytes_1.arrayify)(seed);
        if (seedArray.length < 16 || seedArray.length > 64) {
            throw new Error("invalid seed");
        }
        var s1 = sha512Hash(seed, "0x6d6e656d6f6e6963666f72746865636861696e");
        var s2 = sha512Hash(seed, "0x6d6e656d6f6e6963666f727468656b6579");
        s2[56] |= 0x80;
        s2[55] |= 0x80;
        s2[55] &= 0xbf;
        var key = (0, bytes_1.hexlify)((0, bytes_1.concat)([s1, s2]));
        return new HDNode(_constructorGuard, key, null, "0x00000000", prefix, 0, 0, mnemonic);
    };
    HDNode.fromMnemonic = function (mnemonic, prefix, password, wordlist) {
        // If a locale name was passed in, find the associated wordlist
        wordlist = getWordlist(wordlist);
        // Normalize the case and spacing in the mnemonic (throws if the mnemonic is invalid)
        mnemonic = entropyToMnemonic(mnemonicToEntropy(mnemonic, wordlist), wordlist);
        return HDNode._fromSeed(mnemonicToSeed(mnemonic, password), { phrase: mnemonic, path: "m", locale: wordlist.locale }, prefix);
    };
    HDNode.fromSeed = function (seed, prefix) {
        return HDNode._fromSeed(seed, null, prefix);
    };
    return HDNode;
}());
exports.HDNode = HDNode;
function mnemonicToSeed(mnemonic, password) {
    if (!password) {
        password = "";
    }
    var salt = (0, strings_1.toUtf8Bytes)("mnemonic" + password, strings_1.UnicodeNormalizationForm.NFKD);
    return (0, pbkdf2_1.pbkdf2)((0, strings_1.toUtf8Bytes)(mnemonic, strings_1.UnicodeNormalizationForm.NFKD), salt, 2048, 64, "sha512");
}
exports.mnemonicToSeed = mnemonicToSeed;
function mnemonicToEntropy(mnemonic, wordlist) {
    wordlist = getWordlist(wordlist);
    logger.checkNormalize();
    var words = wordlist.split(mnemonic);
    if ((words.length % 3) !== 0) {
        throw new Error("invalid mnemonic");
    }
    var entropy = (0, bytes_1.arrayify)(new Uint8Array(Math.ceil(11 * words.length / 8)));
    var offset = 0;
    for (var i = 0; i < words.length; i++) {
        var index = wordlist.getWordIndex(words[i].normalize("NFKD"));
        if (index === -1) {
            throw new Error("invalid mnemonic");
        }
        for (var bit = 0; bit < 11; bit++) {
            if (index & (1 << (10 - bit))) {
                entropy[offset >> 3] |= (1 << (7 - (offset % 8)));
            }
            offset++;
        }
    }
    var entropyBits = 32 * words.length / 3;
    var checksumBits = words.length / 3;
    var checksumMask = getUpperMask(checksumBits);
    var checksum = (0, bytes_1.arrayify)((0, sha3_1.sha256)(entropy.slice(0, entropyBits / 8)))[0] & checksumMask;
    if (checksum !== (entropy[entropy.length - 1] & checksumMask)) {
        throw new Error("invalid checksum");
    }
    return (0, bytes_1.hexlify)(entropy.slice(0, entropyBits / 8));
}
exports.mnemonicToEntropy = mnemonicToEntropy;
function entropyToMnemonic(entropy, wordlist) {
    wordlist = getWordlist(wordlist);
    entropy = (0, bytes_1.arrayify)(entropy);
    if ((entropy.length % 4) !== 0 || entropy.length < 16 || entropy.length > 32) {
        throw new Error("invalid entropy");
    }
    var indices = [0];
    var remainingBits = 11;
    for (var i = 0; i < entropy.length; i++) {
        // Consume the whole byte (with still more to go)
        if (remainingBits > 8) {
            indices[indices.length - 1] <<= 8;
            indices[indices.length - 1] |= entropy[i];
            remainingBits -= 8;
            // This byte will complete an 11-bit index
        }
        else {
            indices[indices.length - 1] <<= remainingBits;
            indices[indices.length - 1] |= entropy[i] >> (8 - remainingBits);
            // Start the next word
            indices.push(entropy[i] & getLowerMask(8 - remainingBits));
            remainingBits += 3;
        }
    }
    // Compute the checksum bits
    var checksumBits = entropy.length / 4;
    var checksum = (0, bytes_1.arrayify)((0, sha3_1.sha256)(entropy))[0] & getUpperMask(checksumBits);
    // Shift the checksum into the word indices
    indices[indices.length - 1] <<= checksumBits;
    indices[indices.length - 1] |= (checksum >> (8 - checksumBits));
    return wordlist.join(indices.map(function (index) { return wordlist.getWord(index); }));
}
exports.entropyToMnemonic = entropyToMnemonic;
function isValidMnemonic(mnemonic, wordlist) {
    try {
        mnemonicToEntropy(mnemonic, wordlist);
        return true;
    }
    catch (error) { }
    return false;
}
exports.isValidMnemonic = isValidMnemonic;
function getAccountPath(index) {
    if (typeof (index) !== "number" || index < 0 || index >= HardenedBit || index % 1) {
        logger.throwArgumentError("invalid account index", "index", index);
    }
    return "m/44'/654'/0'/0'/" + index;
}
exports.getAccountPath = getAccountPath;
//# sourceMappingURL=index.js.map