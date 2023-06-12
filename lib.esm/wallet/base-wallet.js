import { getAddress } from "../address/index.js";
import { hashMessage, TypedDataEncoder } from "../hash/index.js";
import { AbstractSigner } from "../providers/index.js";
import { computeAddress, Transaction } from "../transaction/index.js";
import { defineProperties, resolveProperties, assert, assertArgument } from "../utils/index.js";
import { sha256 } from "../crypto/index.js";
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
export class BaseWallet extends AbstractSigner {
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
        assertArgument(signingKey && typeof (signingKey.sign) === "function", "invalid signingKey key", "signingKey", "[ REDACTED ]");
        this.#signingKey = signingKey;
        const address = computeAddress(this.#signingKey, prefix);
        defineProperties(this, { address });
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
        const { to, from } = await resolveProperties({
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
            assertArgument(getAddress((tx.from)) === this.address, "transaction from address mismatch", "tx.from", tx.from);
            delete tx.from;
        }
        // Build the transaction
        const btx = Transaction.from(tx);
        const unSignedSerialized = btx.unsignedSerialized;
        const unsignedHash = sha256(unSignedSerialized);
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
        return this.signingKey.sign(hashMessage(message));
    }
    async signTypedData(domain, types, value) {
        // Populate any ENS names
        const populated = await TypedDataEncoder.resolveNames(domain, types, value, async (name) => {
            // @TODO: this should use resolveName; addresses don't
            //        need a provider
            assert(this.provider != null, "cannot resolve ENS names without a provider", "UNSUPPORTED_OPERATION", {
                operation: "resolveName",
                info: { name }
            });
            const address = getAddress(name);
            assert(address != null, "unconfigured ENS name", "UNCONFIGURED_NAME", {
                value: name
            });
            return address;
        });
        return this.signingKey.sign(TypedDataEncoder.hash(populated.domain, types, populated.value));
    }
}
//# sourceMappingURL=base-wallet.js.map