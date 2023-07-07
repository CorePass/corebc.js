"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseWallet = void 0;
const index_js_1 = require("../address/index.js");
const index_js_2 = require("../hash/index.js");
const index_js_3 = require("../providers/index.js");
const index_js_4 = require("../transaction/index.js");
const index_js_5 = require("../utils/index.js");
const index_js_6 = require("../crypto/index.js");
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
class BaseWallet extends index_js_3.AbstractSigner {
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
    constructor({ signingKey, prefix, provider }) {
        super(provider);
        this.prefix = prefix;
        (0, index_js_5.assertArgument)(signingKey && typeof (signingKey.sign) === "function", "invalid signingKey key", "signingKey", "[ REDACTED ]");
        this.#signingKey = signingKey;
        const address = (0, index_js_4.computeAddress)(this.#signingKey, prefix);
        (0, index_js_5.defineProperties)(this, { address });
    }
    // Store private values behind getters to reduce visibility
    // in console.log
    /**
     *  The [[SigningKey]] used for signing payloads.
     */
    get signingKey() { return this.#signingKey; }
    /**
     *  The private key for this wallet.
     */
    get privateKey() { return this.signingKey.privateKey; }
    async getAddress() { return this.address; }
    connect(provider) {
        return new BaseWallet({
            signingKey: this.#signingKey, prefix: this.prefix, provider
        });
    }
    async signTransaction(tx) {
        // Replace any Addressable or ENS name with an address
        const { to, from } = await (0, index_js_5.resolveProperties)({
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
            (0, index_js_5.assertArgument)((0, index_js_1.getAddress)((tx.from)) === this.address, "transaction from address mismatch", "tx.from", tx.from);
            delete tx.from;
        }
        // Build the transaction
        const btx = index_js_4.Transaction.from(tx);
        const unSignedSerialized = btx.unsignedSerialized;
        const unsignedHash = (0, index_js_6.sha256)(unSignedSerialized);
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
    signMessageSync(message) {
        return this.signingKey.sign((0, index_js_2.hashMessage)(message));
    }
    async signTypedData(domain, types, value) {
        // Populate any ENS names
        const populated = await index_js_2.TypedDataEncoder.resolveNames(domain, types, value, async (name) => {
            // @TODO: this should use resolveName; addresses don't
            //        need a provider
            (0, index_js_5.assert)(this.provider != null, "cannot resolve ENS names without a provider", "UNSUPPORTED_OPERATION", {
                operation: "resolveName",
                info: { name }
            });
            const address = (0, index_js_1.getAddress)(name);
            (0, index_js_5.assert)(address != null, "unconfigured ENS name", "UNCONFIGURED_NAME", {
                value: name
            });
            return address;
        });
        return this.signingKey.sign(index_js_2.TypedDataEncoder.hash(populated.domain, types, populated.value));
    }
}
exports.BaseWallet = BaseWallet;
//# sourceMappingURL=base-wallet.js.map