'use strict';

var pkg = require('aes-js');
var index = require('../address/index.js');
require('../crypto/hmac.js');
require('../crypto/ripemd160.js');
var pbkdf2 = require('../crypto/pbkdf2.js');
var random = require('../crypto/random.js');
var scrypt = require('../crypto/scrypt.js');
var sha3 = require('../crypto/sha3.js');
require('bcrypto/lib/ed448.js');
require('buffer');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
require('crypto');
require('../crypto/keccak.js');
require('../utils/base58.js');
var data = require('../utils/data.js');
var errors = require('../utils/errors.js');
require('../logger/logger.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
var uuid = require('../utils/uuid.js');
require('../crypto/signature.js');
var utils = require('./utils.js');
var _version = require('../_version.js');
var address = require('../transaction/address.js');

/**
 *  The JSON Wallet formats allow a simple way to store the private
 *  keys needed in Core along with related information and allows
 *  for extensible forms of encryption.
 *
 *  These utilities facilitate decrypting and encrypting the most common
 *  JSON Wallet formats.
 *
 *  @_subsection: api/wallet:JSON Wallets  [json-wallets]
 */
// @ts-ignore
const { Counter, ModeOfOperation: { ctr: CTR }, } = pkg;
const defaultPath = "m/44'/60'/0'/0/0";
/**
 *  Returns true if %%json%% is a valid JSON Keystore Wallet.
 */
function isKeystoreJson(json) {
    try {
        const data = JSON.parse(json);
        const version = data.version != null ? parseInt(data.version) : 0;
        if (version === 3) {
            return true;
        }
    }
    catch (error) { }
    return false;
}
function decrypt(data$1, key, ciphertext) {
    const cipher = utils.spelunk(data$1, "crypto.cipher:string");
    if (cipher === "aes-128-ctr") {
        const iv = utils.spelunk(data$1, "crypto.cipherparams.iv:data!");
        const aesCtr = new CTR(key, new Counter(iv));
        return data.hexlify(aesCtr.decrypt(ciphertext));
    }
    errors.assert(false, "unsupported cipher", "UNSUPPORTED_OPERATION", {
        operation: "decrypt",
    });
}
function getAccount(data$1, _key) {
    const key = data.getBytes(_key);
    const ciphertext = utils.spelunk(data$1, "crypto.ciphertext:data!");
    const computedMAC = data.hexlify(sha3.sha256(data.concat([key.slice(16, 32), ciphertext]))).substring(2);
    const expectedMAC = utils.spelunk(data$1, "crypto.mac:string!");
    let difference = 0;
    const validMAC = /^[0-9a-f]{64}$/i.test(expectedMAC);
    if (validMAC) {
        const actual = data.getBytes("0x" + computedMAC);
        const expected = data.getBytes("0x" + expectedMAC);
        for (let i = 0; i < actual.length; i++)
            difference |= actual[i] ^ expected[i];
    }
    errors.assertArgument(validMAC && difference === 0, "incorrect password", "password", "[REDACTED]");
    const privateKey = decrypt(data$1, key.slice(0, 16), ciphertext);
    const address$1 = index.getAddress(data$1.address);
    const prefix = address.extractPrefix(address$1);
    if (address.computeAddress(privateKey, prefix) !== address$1) {
        throw new Error("address mismatch");
    }
    if (data$1.address) {
        let check = data$1.address.toLowerCase();
        if (!check.startsWith("0x")) {
            check = "0x" + check;
        }
        errors.assertArgument(index.getAddress(check) === address$1, "keystore address/privateKey mismatch", "address", data$1.address);
    }
    const account = { address: address$1, privateKey };
    // Version 0.1 x-corebc metadata must contain an encrypted mnemonic phrase
    const version = utils.spelunk(data$1, "x-corebc.version:string");
    if (version === "0.1") {
        const mnemonicKey = key.slice(32, 64);
        const mnemonicCiphertext = utils.spelunk(data$1, "x-corebc.mnemonicCiphertext:data!");
        const mnemonicIv = utils.spelunk(data$1, "x-corebc.mnemonicCounter:data!");
        const mnemonicAesCtr = new CTR(mnemonicKey, new Counter(mnemonicIv));
        account.mnemonic = {
            path: utils.spelunk(data$1, "x-corebc.path:string") || defaultPath,
            locale: utils.spelunk(data$1, "x-corebc.locale:string") || "en",
            entropy: data.hexlify(data.getBytes(mnemonicAesCtr.decrypt(mnemonicCiphertext))),
        };
    }
    return account;
}
// Match Core Web3Dart's wallet KDF resource limits.
function validateScrypt(N, r, p) {
    errors.assertArgument(Number.isSafeInteger(N) && N > 1 && N <= 1048576 && (N & (N - 1)) === 0, "unsafe scrypt N", "kdf.N", N);
    errors.assertArgument(Number.isSafeInteger(r) &&
        Number.isSafeInteger(p) &&
        r > 0 &&
        p > 0 &&
        r * p <= 1048576 &&
        128 * N * r <= 256 * 1024 * 1024, "unsafe scrypt work or memory requirement", "kdf", { N, r, p });
}
function getDecryptKdfParams(data) {
    const kdf = utils.spelunk(data, "crypto.kdf:string");
    if (kdf && typeof kdf === "string") {
        if (kdf.toLowerCase() === "scrypt") {
            const salt = utils.spelunk(data, "crypto.kdfparams.salt:data!");
            const N = utils.spelunk(data, "crypto.kdfparams.n:int!");
            const r = utils.spelunk(data, "crypto.kdfparams.r:int!");
            const p = utils.spelunk(data, "crypto.kdfparams.p:int!");
            validateScrypt(N, r, p);
            const dkLen = utils.spelunk(data, "crypto.kdfparams.dklen:int!");
            errors.assertArgument(dkLen === 32, "invalid kdf.dklen", "kdf.dflen", dkLen);
            return { name: "scrypt", salt, N, r, p, dkLen: 64 };
        }
        else if (kdf.toLowerCase() === "pbkdf2") {
            const salt = utils.spelunk(data, "crypto.kdfparams.salt:data!");
            const prf = utils.spelunk(data, "crypto.kdfparams.prf:string!");
            const algorithm = prf.split("-").pop();
            errors.assertArgument(prf === "hmac-sha256" || prf === "hmac-sha512", "invalid kdf.pdf", "kdf.pdf", prf);
            const count = utils.spelunk(data, "crypto.kdfparams.c:int!");
            errors.assertArgument(Number.isSafeInteger(count) && count > 0 && count <= 10_000_000, "unsafe PBKDF2 iteration count", "kdf.c", count);
            const dkLen = utils.spelunk(data, "crypto.kdfparams.dklen:int!");
            errors.assertArgument(dkLen === 32, "invalid kdf.dklen", "kdf.dklen", dkLen);
            return {
                name: "pbkdf2",
                salt,
                count,
                dkLen,
                algorithm: algorithm,
            };
        }
    }
    errors.assertArgument(false, "unsupported key-derivation function", "kdf", kdf);
}
/**
 *  Returns the account details for the JSON Keystore Wallet %%json%%
 *  using %%password%%.
 *
 *  It is preferred to use the [async version](decryptKeystoreJson)
 *  instead, which allows a [[ProgressCallback]] to keep the user informed
 *  as to the decryption status.
 *
 *  This method will block the event loop (freezing all UI) until decryption
 *  is complete, which can take quite some time, depending on the wallet
 *  paramters and platform.
 */
function decryptKeystoreJsonSync(json, _password) {
    const data = JSON.parse(json);
    const password = utils.getPassword(_password);
    const params = getDecryptKdfParams(data);
    if (params.name === "pbkdf2") {
        const { salt, count, dkLen, algorithm } = params;
        const key = pbkdf2.pbkdf2(password, salt, count, dkLen, algorithm);
        return getAccount(data, key);
    }
    errors.assert(params.name === "scrypt", "cannot be reached", "UNKNOWN_ERROR", {
        params,
    });
    const { salt, N, r, p, dkLen } = params;
    const key = scrypt.scryptSync(password, salt, N, r, p, dkLen);
    return getAccount(data, key);
}
function stall(duration) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, duration);
    });
}
/**
 *  Resolves to the decrypted JSON Keystore Wallet %%json%% using the
 *  %%password%%.
 *
 *  If provided, %%progress%% will be called periodically during the
 *  decrpytion to provide feedback, and if the function returns
 *  ``false`` will halt decryption.
 *
 *  The %%progressCallback%% will **always** receive ``0`` before
 *  decryption begins and ``1`` when complete.
 */
async function decryptKeystoreJson(json, _password, progress) {
    const data = JSON.parse(json);
    const password = utils.getPassword(_password);
    const params = getDecryptKdfParams(data);
    if (params.name === "pbkdf2") {
        if (progress) {
            progress(0);
            await stall(0);
        }
        const { salt, count, dkLen, algorithm } = params;
        const key = pbkdf2.pbkdf2(password, salt, count, dkLen, algorithm);
        if (progress) {
            progress(1);
            await stall(0);
        }
        return getAccount(data, key);
    }
    errors.assert(params.name === "scrypt", "cannot be reached", "UNKNOWN_ERROR", {
        params,
    });
    const { salt, N, r, p, dkLen } = params;
    const key = await scrypt.scrypt(password, salt, N, r, p, dkLen, progress);
    return getAccount(data, key);
}
function getEncryptKdfParams(options) {
    // Check/generate the salt
    const salt = options.salt != null
        ? data.getBytes(options.salt, "options.salt")
        : random.randomBytes(32);
    // Override the scrypt password-based key derivation function parameters
    let N = 1 << 17, r = 8, p = 1;
    if (options.scrypt) {
        if (options.scrypt.N != null) {
            N = options.scrypt.N;
        }
        if (options.scrypt.r != null) {
            r = options.scrypt.r;
        }
        if (options.scrypt.p != null) {
            p = options.scrypt.p;
        }
    }
    validateScrypt(N, r, p);
    return { name: "scrypt", dkLen: 32, salt, N, r, p };
}
function _encryptKeystore(key, kdf, account, options) {
    const privateKey = data.getBytes(account.privateKey, "privateKey");
    // Override initialization vector
    const iv = options.iv != null ? data.getBytes(options.iv, "options.iv") : random.randomBytes(16);
    errors.assertArgument(iv.length === 16, "invalid options.iv length", "options.iv", options.iv);
    // Override the uuid
    const uuidRandom = options.uuid != null
        ? data.getBytes(options.uuid, "options.uuid")
        : random.randomBytes(16);
    errors.assertArgument(uuidRandom.length === 16, "invalid options.uuid length", "options.uuid", options.iv);
    // This will be used to encrypt the wallet (as per Web3 secret storage)
    // - 32 bytes   As normal for the Web3 secret storage (derivedKey, macPrefix)
    // - 32 bytes   AES key to encrypt mnemonic with (required here to be corebc Wallet)
    const derivedKey = key.slice(0, 16);
    const macPrefix = key.slice(16, 32);
    // Encrypt the private key
    const aesCtr = new CTR(derivedKey, new Counter(iv));
    const ciphertext = data.getBytes(aesCtr.encrypt(privateKey));
    // Compute the message authentication code, used to check the password
    const mac = sha3.sha256(data.concat([macPrefix, ciphertext]));
    const data$1 = {
        address: account.address.substring(2).toLowerCase(),
        id: uuid.uuidV4(uuidRandom),
        version: 3,
        Crypto: {
            cipher: "aes-128-ctr",
            cipherparams: {
                iv: data.hexlify(iv).substring(2),
            },
            ciphertext: data.hexlify(ciphertext).substring(2),
            kdf: "scrypt",
            kdfparams: {
                salt: data.hexlify(kdf.salt).substring(2),
                n: kdf.N,
                dklen: 32,
                p: kdf.p,
                r: kdf.r,
            },
            mac: mac.substring(2),
        },
    };
    // If we have a mnemonic, encrypt it into the JSON wallet
    if (account.mnemonic) {
        const client = options.client != null ? options.client : `corebc/${_version.version}`;
        const path = account.mnemonic.path || defaultPath;
        const locale = account.mnemonic.locale || "en";
        const mnemonicKey = key.slice(32, 64);
        const entropy = data.getBytes(account.mnemonic.entropy, "account.mnemonic.entropy");
        const mnemonicIv = random.randomBytes(16);
        const mnemonicAesCtr = new CTR(mnemonicKey, new Counter(mnemonicIv));
        const mnemonicCiphertext = data.getBytes(mnemonicAesCtr.encrypt(entropy));
        const now = new Date();
        const timestamp = now.getUTCFullYear() +
            "-" +
            utils.zpad(now.getUTCMonth() + 1, 2) +
            "-" +
            utils.zpad(now.getUTCDate(), 2) +
            "T" +
            utils.zpad(now.getUTCHours(), 2) +
            "-" +
            utils.zpad(now.getUTCMinutes(), 2) +
            "-" +
            utils.zpad(now.getUTCSeconds(), 2) +
            ".0Z";
        const gethFilename = "UTC--" + timestamp + "--" + data$1.address;
        data$1["x-corebc"] = {
            client,
            gethFilename,
            path,
            locale,
            mnemonicCounter: data.hexlify(mnemonicIv).substring(2),
            mnemonicCiphertext: data.hexlify(mnemonicCiphertext).substring(2),
            version: "0.1",
        };
    }
    return JSON.stringify(data$1);
}
/**
 *  Return the JSON Keystore Wallet for %%account%% encrypted with
 *  %%password%%.
 *
 *  The %%options%% can be used to tune the password-based key
 *  derivation function parameters, explicitly set the random values
 *  used. Any provided [[ProgressCallback]] is ignord.
 */
function encryptKeystoreJsonSync(account, password, options) {
    if (options == null) {
        options = {};
    }
    const passwordBytes = utils.getPassword(password);
    const kdf = getEncryptKdfParams(options);
    const key = scrypt.scryptSync(passwordBytes, kdf.salt, kdf.N, kdf.r, kdf.p, 64);
    return _encryptKeystore(data.getBytes(key), kdf, account, options);
}
/**
 *  Resolved to the JSON Keystore Wallet for %%account%% encrypted
 *  with %%password%%.
 *
 *  The %%options%% can be used to tune the password-based key
 *  derivation function parameters, explicitly set the random values
 *  used and provide a [[ProgressCallback]] to receive periodic updates
 *  on the completion status..
 */
async function encryptKeystoreJson(account, password, options) {
    if (options == null) {
        options = {};
    }
    const passwordBytes = utils.getPassword(password);
    const kdf = getEncryptKdfParams(options);
    const key = await scrypt.scrypt(passwordBytes, kdf.salt, kdf.N, kdf.r, kdf.p, 64, options.progressCallback);
    return _encryptKeystore(data.getBytes(key), kdf, account, options);
}

exports.decryptKeystoreJson = decryptKeystoreJson;
exports.decryptKeystoreJsonSync = decryptKeystoreJsonSync;
exports.encryptKeystoreJson = encryptKeystoreJson;
exports.encryptKeystoreJsonSync = encryptKeystoreJsonSync;
exports.isKeystoreJson = isKeystoreJson;
//# sourceMappingURL=json-keystore.js.map
