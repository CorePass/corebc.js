"use strict";
import { arrayify, concat, hexDataSlice, hexlify } from "@corepass/corebc-bytes";
import { toUtf8Bytes, UnicodeNormalizationForm } from "@corepass/corebc-strings";
import { pbkdf2 } from "@corepass/corebc-pbkdf2";
import { defineReadOnly } from "@corepass/corebc-properties";
import { SigningKey } from "@corepass/corebc-signing-key";
import { ripemd160, sha256 } from "@corepass/corebc-sha3";
import { publicToAddress } from "@corepass/corebc-address";
import { wordlists } from "@corepass/corebc-wordlists";
import { Logger } from "@corepass/corebc-logger";
import { version } from "./_version";
const logger = new Logger(version);
const HardenedBit = 0x80000000;
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
        return wordlists["en"];
    }
    if (typeof (wordlist) === "string") {
        const words = wordlists[wordlist];
        if (words == null) {
            logger.throwArgumentError("unknown locale", "wordlist", wordlist);
        }
        return words;
    }
    return wordlist;
}
function sha512Hash(password, salt) {
    const p = arrayify(password);
    const s = arrayify(salt);
    return arrayify(pbkdf2(p, s, 2048, 57, "sha512"));
}
function concatKeyIndexSalt(prefix, key, index, salt) {
    const ind = new Uint8Array(4);
    const p = new Uint8Array(1);
    p[0] = prefix % 256;
    let j = index;
    for (let i = 0; i < 4; i++) {
        ind[i] = j % 256;
        j = Math.floor(j / 256);
    }
    const t = concat([p, key, ind]);
    return sha512Hash(t, salt);
}
function addScalar(a, b) {
    b = concat([b.slice(0, 53), "0x00000000"]);
    b[0] &= 0xfc;
    const c = new Uint8Array(57);
    let hold = 0;
    for (let i = 0; i < 57; i++) {
        hold += a[i] + b[i];
        c[i] = hold % 256;
        hold = Math.floor(hold / 256);
    }
    return c;
}
;
const _constructorGuard = {};
export const defaultPath = "m/44'/654'/0'/0'/5";
;
export class HDNode {
    /**
     *  This constructor should not be called directly.
     *
     *  Please use:
     *   - fromMnemonic
     *   - fromSeed
     */
    constructor(constructorGuard, extendedPrivateKey, publicKey, parentFingerprint, prefix, index, depth, mnemonicOrPath) {
        logger.checkNew(new.target, HDNode);
        /* istanbul ignore if */
        if (constructorGuard !== _constructorGuard) {
            throw new Error("HDNode constructor cannot be called directly");
        }
        if (extendedPrivateKey) {
            defineReadOnly(this, "extendedPrivateKey", extendedPrivateKey);
            const privateKey = hexDataSlice(extendedPrivateKey, 57, 114);
            const signingKey = new SigningKey(privateKey);
            defineReadOnly(this, "privateKey", signingKey.privateKey);
            defineReadOnly(this, "publicKey", signingKey.publicKey);
        }
        else {
            defineReadOnly(this, "extendedPrivateKey", null);
            defineReadOnly(this, "privateKey", null);
            defineReadOnly(this, "publicKey", hexlify(publicKey));
        }
        defineReadOnly(this, "parentFingerprint", parentFingerprint);
        defineReadOnly(this, "fingerprint", hexDataSlice(ripemd160(sha256(this.publicKey)), 0, 4));
        defineReadOnly(this, "prefix", prefix);
        defineReadOnly(this, "address", publicToAddress(this.publicKey, prefix));
        defineReadOnly(this, "index", index);
        defineReadOnly(this, "depth", depth);
        if (mnemonicOrPath == null) {
            // From a source that does not preserve the path (e.g. extended keys)
            defineReadOnly(this, "mnemonic", null);
            defineReadOnly(this, "path", null);
        }
        else if (typeof (mnemonicOrPath) === "string") {
            // From a source that does not preserve the mnemonic (e.g. neutered)
            defineReadOnly(this, "mnemonic", null);
            defineReadOnly(this, "path", mnemonicOrPath);
        }
        else {
            // From a fully qualified source
            defineReadOnly(this, "mnemonic", mnemonicOrPath);
            defineReadOnly(this, "path", mnemonicOrPath.path);
        }
    }
    neuter() {
        return new HDNode(_constructorGuard, null, this.publicKey, this.parentFingerprint, this.prefix, this.index, this.depth, this.path);
    }
    _derive(index) {
        if (index > 0xffffffff) {
            throw new Error("invalid index - " + String(index));
        }
        if (!this.extendedPrivateKey) {
            throw new Error("cannot derive child of neutered node");
        }
        const extendedPrivateKey = arrayify(this.extendedPrivateKey);
        const salt = extendedPrivateKey.slice(0, 57);
        const key = extendedPrivateKey.slice(57, 114);
        let r0, r1;
        if (index >= HardenedBit) {
            r0 = concatKeyIndexSalt(1, key, index, salt);
            r1 = concatKeyIndexSalt(0, key, index, salt);
        }
        else {
            const pub = arrayify(this.publicKey);
            r0 = concatKeyIndexSalt(3, pub, index, salt);
            r1 = concatKeyIndexSalt(2, pub, index, salt);
        }
        const newKey = hexlify(concat([r0, addScalar(key, r1)]));
        // Base path
        let path = this.path;
        if (path) {
            path += index >= HardenedBit ? `/${index - HardenedBit}'` : `/${index}`;
        }
        let mnemonicOrPath = path;
        const srcMnemonic = this.mnemonic;
        if (srcMnemonic) {
            mnemonicOrPath = Object.freeze({
                phrase: srcMnemonic.phrase,
                path: path,
                locale: (srcMnemonic.locale || "en")
            });
        }
        return new HDNode(_constructorGuard, newKey, null, this.fingerprint, this.prefix, index, this.depth + 1, mnemonicOrPath);
    }
    derivePath(path) {
        const components = path.split("/");
        if (components.length === 0 || (components[0] === "m" && this.depth !== 0)) {
            throw new Error("invalid path - " + path);
        }
        if (components[0] === "m") {
            components.shift();
        }
        let result = this;
        for (let i = 0; i < components.length; i++) {
            const component = components[i];
            if (component.match(/^[0-9]+'$/)) {
                const index = parseInt(component.substring(0, component.length - 1));
                if (index >= HardenedBit) {
                    throw new Error("invalid path index - " + component);
                }
                result = result._derive(HardenedBit + index);
            }
            else if (component.match(/^[0-9]+$/)) {
                const index = parseInt(component);
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
    }
    static _fromSeed(seed, mnemonic, prefix) {
        const seedArray = arrayify(seed);
        if (seedArray.length < 16 || seedArray.length > 64) {
            throw new Error("invalid seed");
        }
        const s1 = sha512Hash(seed, "0x6d6e656d6f6e6963666f72746865636861696e");
        const s2 = sha512Hash(seed, "0x6d6e656d6f6e6963666f727468656b6579");
        s2[56] |= 0x80;
        s2[55] |= 0x80;
        s2[55] &= 0xbf;
        const key = hexlify(concat([s1, s2]));
        return new HDNode(_constructorGuard, key, null, "0x00000000", prefix, 0, 0, mnemonic);
    }
    static fromMnemonic(mnemonic, prefix, password, wordlist) {
        // If a locale name was passed in, find the associated wordlist
        wordlist = getWordlist(wordlist);
        // Normalize the case and spacing in the mnemonic (throws if the mnemonic is invalid)
        mnemonic = entropyToMnemonic(mnemonicToEntropy(mnemonic, wordlist), wordlist);
        return HDNode._fromSeed(mnemonicToSeed(mnemonic, password), { phrase: mnemonic, path: "m", locale: wordlist.locale }, prefix);
    }
    static fromSeed(seed, prefix) {
        return HDNode._fromSeed(seed, null, prefix);
    }
}
export function mnemonicToSeed(mnemonic, password) {
    if (!password) {
        password = "";
    }
    const salt = toUtf8Bytes("mnemonic" + password, UnicodeNormalizationForm.NFKD);
    return pbkdf2(toUtf8Bytes(mnemonic, UnicodeNormalizationForm.NFKD), salt, 2048, 64, "sha512");
}
export function mnemonicToEntropy(mnemonic, wordlist) {
    wordlist = getWordlist(wordlist);
    logger.checkNormalize();
    const words = wordlist.split(mnemonic);
    if ((words.length % 3) !== 0) {
        throw new Error("invalid mnemonic");
    }
    const entropy = arrayify(new Uint8Array(Math.ceil(11 * words.length / 8)));
    let offset = 0;
    for (let i = 0; i < words.length; i++) {
        let index = wordlist.getWordIndex(words[i].normalize("NFKD"));
        if (index === -1) {
            throw new Error("invalid mnemonic");
        }
        for (let bit = 0; bit < 11; bit++) {
            if (index & (1 << (10 - bit))) {
                entropy[offset >> 3] |= (1 << (7 - (offset % 8)));
            }
            offset++;
        }
    }
    const entropyBits = 32 * words.length / 3;
    const checksumBits = words.length / 3;
    const checksumMask = getUpperMask(checksumBits);
    const checksum = arrayify(sha256(entropy.slice(0, entropyBits / 8)))[0] & checksumMask;
    if (checksum !== (entropy[entropy.length - 1] & checksumMask)) {
        throw new Error("invalid checksum");
    }
    return hexlify(entropy.slice(0, entropyBits / 8));
}
export function entropyToMnemonic(entropy, wordlist) {
    wordlist = getWordlist(wordlist);
    entropy = arrayify(entropy);
    if ((entropy.length % 4) !== 0 || entropy.length < 16 || entropy.length > 32) {
        throw new Error("invalid entropy");
    }
    const indices = [0];
    let remainingBits = 11;
    for (let i = 0; i < entropy.length; i++) {
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
    const checksumBits = entropy.length / 4;
    const checksum = arrayify(sha256(entropy))[0] & getUpperMask(checksumBits);
    // Shift the checksum into the word indices
    indices[indices.length - 1] <<= checksumBits;
    indices[indices.length - 1] |= (checksum >> (8 - checksumBits));
    return wordlist.join(indices.map((index) => wordlist.getWord(index)));
}
export function isValidMnemonic(mnemonic, wordlist) {
    try {
        mnemonicToEntropy(mnemonic, wordlist);
        return true;
    }
    catch (error) { }
    return false;
}
export function getAccountPath(index) {
    if (typeof (index) !== "number" || index < 0 || index >= HardenedBit || index % 1) {
        logger.throwArgumentError("invalid account index", "index", index);
    }
    return `m/44'/654'/0'/0'/${index}`;
}
//# sourceMappingURL=index.js.map