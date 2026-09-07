'use strict';

var index = require('../address/index.js');
require('../crypto/keccak.js');
var sha3 = require('../crypto/sha3.js');
require('../utils/base58.js');
require('../logger/logger.js');
var errors = require('../utils/errors.js');
var properties = require('../utils/properties.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
var message = require('../hash/message.js');
require('../crypto/hmac.js');
require('../crypto/ripemd160.js');
require('../crypto/pbkdf2.js');
require('../crypto/random.js');
require('../crypto/scrypt.js');
require('bcrypto/lib/ed448.js');
require('buffer');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
require('crypto');
require('../crypto/signature.js');
var typedData = require('../hash/typed-data.js');
var address = require('../transaction/address.js');
var transaction = require('../transaction/transaction.js');
require('../providers/format.js');
require('../providers/provider.js');
var abstractSigner = require('../providers/abstract-signer.js');
require('../abi/abi-coder.js');
require('../abi/fragments.js');
require('ws');
require('../providers/provider-fallback.js');
require('net');

/**
 *  The **BaseWallet** is a stream-lined implementation of a
 *  [[Signer]] that operates with a private key.
 *
 *  It is preferred to use the [[Wallet]] class, as it offers
 *  additional functionality and simplifies loading a variety
 *  of JSON formats, Mnemonic Phrases, etc.
 *
 *  This class may be of use for those attempting to implement
 *  a minimal Signer.
 */
class BaseWallet extends abstractSigner.AbstractSigner {
    /**
     *  The wallet address.
     */
    address;
    prefix;
    #signingKey;
    /**
     *  Creates a new BaseWallet for %%privateKey%%, optionally
     *  connected to %%provider%%.
     *
     *  If %%provider%% is not specified, only offline methods can
     *  be used.
     */
    constructor({ signingKey, prefix, provider, }) {
        super(provider);
        this.prefix = prefix;
        errors.assertArgument(signingKey && typeof signingKey.sign === "function", "invalid signingKey key", "signingKey", "[ REDACTED ]");
        this.#signingKey = signingKey;
        const address$1 = address.computeAddress(this.#signingKey, prefix);
        properties.defineProperties(this, { address: address$1 });
    }
    // Store private values behind getters to reduce visibility
    // in console.log
    /**
     *  The [[SigningKey]] used for signing payloads.
     */
    get signingKey() {
        return this.#signingKey;
    }
    /**
     *  The private key for this wallet.
     */
    get privateKey() {
        return this.signingKey.privateKey;
    }
    async getAddress() {
        return this.address;
    }
    connect(provider) {
        return new BaseWallet({
            signingKey: this.#signingKey,
            prefix: this.prefix,
            provider,
        });
    }
    async signTransaction(tx) {
        // Replace any Addressable or ENS name with an address
        const { to, from } = await properties.resolveProperties({
            to: tx.to || undefined,
            from: tx.from || undefined,
        });
        if (to != null) {
            tx.to = to;
        }
        if (from != null) {
            tx.from = from;
        }
        if (tx.from != null) {
            errors.assertArgument(index.getAddress(tx.from) === this.address, "transaction from address mismatch", "tx.from", tx.from);
            delete tx.from;
        }
        // Build the transaction
        const btx = transaction.Transaction.from(tx);
        const unSignedSerialized = btx.unsignedSerialized;
        const unsignedHash = sha3.sha256(unSignedSerialized);
        // sha256(btx.unsignedSerialized)
        btx.signature = this.signingKey.sign(unsignedHash);
        return btx.serialized;
    }
    async signMessage(message) {
        return this.signMessageSync(message);
    }
    // @TODO: Add a secialized signTx and signTyped sync that enforces
    // all parameters are known?
    /**
     *  Returns the signature for %%message%% signed with this wallet.
     */
    signMessageSync(message$1) {
        return this.signingKey.sign(message.hashMessage(message$1));
    }
    async signTypedData(domain, types, value) {
        // Populate any ENS names
        const populated = await typedData.TypedDataEncoder.resolveNames(domain, types, value, async (name) => {
            // @TODO: this should use resolveName; addresses don't
            //        need a provider
            errors.assert(this.provider != null, "cannot resolve ENS names without a provider", "UNSUPPORTED_OPERATION", {
                operation: "resolveName",
                info: { name },
            });
            const address = index.getAddress(name);
            errors.assert(address != null, "unconfigured ENS name", "UNCONFIGURED_NAME", {
                value: name,
            });
            return address;
        });
        return this.signingKey.sign(typedData.TypedDataEncoder.hash(populated.domain, types, populated.value));
    }
}

exports.BaseWallet = BaseWallet;
//# sourceMappingURL=base-wallet.js.map
