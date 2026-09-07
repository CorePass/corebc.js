'use strict';

require('../crypto/hmac.js');
require('../crypto/ripemd160.js');
require('../crypto/pbkdf2.js');
require('../crypto/random.js');
require('../crypto/scrypt.js');
require('../crypto/sha3.js');
require('bcrypto/lib/ed448.js');
require('buffer');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
require('crypto');
require('../crypto/keccak.js');
var signingKey = require('../crypto/signing-key.js');
require('../crypto/signature.js');
require('../utils/base58.js');
require('../logger/logger.js');
var errors = require('../utils/errors.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
var baseWallet = require('./base-wallet.js');
var hdwallet = require('./hdwallet.js');
var jsonCrowdsale = require('./json-crowdsale.js');
var jsonKeystore = require('./json-keystore.js');
var mnemonic = require('./mnemonic.js');
var address = require('../transaction/address.js');

function stall(duration) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, duration);
    });
}
/**
 *  A **Wallet** manages a single private key which is used to sign
 *  transactions, messages and other common payloads.
 *
 *  This class is generally the main entry point for developers
 *  that wish to use a private key directly, as it can create
 *  instances from a large variety of common sources, including
 *  raw private key, [[link-bip-39]] mnemonics and encrypte JSON
 *  wallets.
 */
class Wallet extends baseWallet.BaseWallet {
    /**
     *  Create a new wallet for the %%privateKey%% or %%signingKey%%, optionally connected
     *  to %%provider%%.
     */
    constructor({ key, prefix, provider, }) {
        if (typeof key === "string" && !key.startsWith("0x")) {
            key = "0x" + key;
        }
        let signingKey$1 = typeof key === "string" ? new signingKey.SigningKey(key) : key;
        super({
            signingKey: signingKey$1,
            prefix,
            provider,
        });
    }
    connect(provider) {
        return new Wallet({
            key: this.signingKey,
            prefix: this.prefix,
            provider,
        });
    }
    /**
     *  Resolves to a [JSON Keystore Wallet](json-wallets) encrypted with
     *  %%password%%.
     *
     *  If %%progressCallback%% is specified, it will receive periodic
     *  updates as the encryption process progreses.
     */
    async encrypt(password, progressCallback) {
        const account = { address: this.address, privateKey: this.privateKey };
        return await jsonKeystore.encryptKeystoreJson(account, password, { progressCallback });
    }
    /**
     *  Returns a [JSON Keystore Wallet](json-wallets) encryped with
     *  %%password%%.
     *
     *  It is preferred to use the [async version](encrypt) instead,
     *  which allows a [[ProgressCallback]] to keep the user informed.
     *
     *  This method will block the event loop (freezing all UI) until
     *  it is complete, which may be a non-trivial duration.
     */
    encryptSync(password) {
        const account = { address: this.address, privateKey: this.privateKey };
        return jsonKeystore.encryptKeystoreJsonSync(account, password);
    }
    static #fromAccount(account) {
        errors.assertArgument(account, "invalid JSON wallet", "json", "[ REDACTED ]");
        const address$1 = account.address;
        const prefix = address.extractPrefix(address$1);
        if ("mnemonic" in account &&
            account.mnemonic &&
            account.mnemonic.locale === "en") {
            const mnemonic$1 = mnemonic.Mnemonic.fromEntropy(account.mnemonic.entropy);
            const wallet = hdwallet.HDNodeWallet.fromMnemonic(mnemonic$1, prefix, account.mnemonic.path);
            if (wallet.address === account.address &&
                wallet.privateKey === account.privateKey) {
                return wallet;
            }
            console.log("WARNING: JSON mismatch address/privateKey != mnemonic; fallback onto private key");
        }
        const wallet = new Wallet({
            key: account.privateKey,
            prefix,
        });
        errors.assertArgument(wallet.address === account.address, "address/privateKey mismatch", "json", "[ REDACTED ]");
        return wallet;
    }
    /**
     *  Creates (asynchronously) a **Wallet** by decrypting the %%json%%
     *  with %%password%%.
     *
     *  If %%progress%% is provided, it is called periodically during
     *  decryption so that any UI can be updated.
     */
    static async fromEncryptedJson(json, password, progress) {
        let account = null;
        if (jsonKeystore.isKeystoreJson(json)) {
            account = await jsonKeystore.decryptKeystoreJson(json, password, progress);
        }
        else if (jsonCrowdsale.isCrowdsaleJson(json)) {
            if (progress) {
                progress(0);
                await stall(0);
            }
            account = jsonCrowdsale.decryptCrowdsaleJson(json, password);
            if (progress) {
                progress(1);
                await stall(0);
            }
        }
        return Wallet.#fromAccount(account);
    }
    /**
     *  Creates a **Wallet** by decrypting the %%json%% with %%password%%.
     *
     *  The [[fromEncryptedJson]] method is preferred, as this method
     *  will lock up and freeze the UI during decryption, which may take
     *  some time.
     */
    static fromEncryptedJsonSync(json, password) {
        let account = null;
        if (jsonKeystore.isKeystoreJson(json)) {
            account = jsonKeystore.decryptKeystoreJsonSync(json, password);
        }
        else if (jsonCrowdsale.isCrowdsaleJson(json)) {
            account = jsonCrowdsale.decryptCrowdsaleJson(json, password);
        }
        else {
            errors.assertArgument(false, "invalid JSON wallet", "json", "[ REDACTED ]");
        }
        return Wallet.#fromAccount(account);
    }
    /**
     *  Creates a new random [[HDNodeWallet]] using the avavilable
     *  [cryptographic random source](randomBytes).
     *
     *  If there is no crytographic random source, this will throw.
     */
    static createRandom(prefix, provider) {
        const wallet = hdwallet.HDNodeWallet.createRandom(prefix, undefined, undefined, undefined);
        if (provider) {
            return wallet.connect(provider);
        }
        return wallet;
    }
    /**
     *  Creates a [[HDNodeWallet]] for %%phrase%%.
     */
    static fromPhrase({ phrase, prefix, provider, password, }) {
        const wallet = hdwallet.HDNodeWallet.fromPhrase({
            phrase,
            prefix,
            password,
        });
        if (provider) {
            return wallet.connect(provider);
        }
        return wallet;
    }
    static fromSeed({ seed, prefix, provider, path, }) {
        const wallet = hdwallet.HDNodeWallet.fromSeed({
            seed,
            prefix,
            path: path || hdwallet.defaultPath,
        });
        if (provider) {
            return wallet.connect(provider);
        }
        return wallet;
    }
}

exports.Wallet = Wallet;
//# sourceMappingURL=wallet.js.map
