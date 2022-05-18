"use strict";

import { extractPrefix, getAddress, publicToAddress } from "@corepass/corebc-address";
import { Provider, TransactionRequest } from "@corepass/corebc-abstract-provider";
import { ExternallyOwnedAccount, Signer, TypedDataDomain, TypedDataField, TypedDataSigner } from "@corepass/corebc-abstract-signer";
import { arrayify, Bytes, BytesLike, concat, hexDataSlice, isHexString } from "@corepass/corebc-bytes";
import { hashMessage, _TypedDataEncoder } from "@corepass/corebc-hash";
import { defaultPath, HDNode, entropyToMnemonic, Mnemonic } from "@corepass/corebc-hdnode";
import { sha256 } from "@corepass/corebc-sha3";
import { defineReadOnly, resolveProperties } from "@corepass/corebc-properties";
import { randomBytes } from "@corepass/corebc-random";
import { SigningKey } from "@corepass/corebc-signing-key";
import { decryptJsonWallet, decryptJsonWalletSync, encryptKeystore, ProgressCallback } from "@corepass/corebc-json-wallets";
import { computeAddress, recoverAddress, serialize, UnsignedTransaction } from "@corepass/corebc-transactions";
import { Wordlist } from "@corepass/corebc-wordlists";

import { Logger } from "@corepass/corebc-logger";
import { version } from "./_version";
const logger = new Logger(version);

function isAccount(value: any): value is ExternallyOwnedAccount {
    return (value != null && isHexString(value.privateKey, 57) && value.address != null);
}

function hasMnemonic(value: any): value is { mnemonic: Mnemonic } {
    const mnemonic = value.mnemonic;
    return (mnemonic && mnemonic.phrase);
}

export class Wallet extends Signer implements ExternallyOwnedAccount, TypedDataSigner {

    readonly prefix: string;
    readonly address: string;
    readonly provider: Provider;

    // Wrapping the _signingKey and _mnemonic in a getter function prevents
    // leaking the private key in console.log; still, be careful! :)
    readonly _signingKey: () => SigningKey;
    readonly _mnemonic: () => Mnemonic;

    constructor(privateKey: BytesLike | ExternallyOwnedAccount | SigningKey, prefix: string, provider?: Provider) {
        logger.checkNew(new.target, Wallet);

        super();

        defineReadOnly(this, "prefix", prefix);
        if (isAccount(privateKey)) {
            const signingKey = new SigningKey(privateKey.privateKey);
            defineReadOnly(this, "_signingKey", () => signingKey);
            defineReadOnly(this, "address", publicToAddress(this.publicKey, prefix));

            if (this.address !== getAddress(privateKey.address)) {
                logger.throwArgumentError("privateKey/address mismatch", "privateKey", "[REDACTED]");
            }

            if (hasMnemonic(privateKey)) {
                const srcMnemonic = privateKey.mnemonic;
                defineReadOnly(this, "_mnemonic", () => (
                    {
                        phrase: srcMnemonic.phrase,
                        path: srcMnemonic.path || defaultPath,
                        locale: srcMnemonic.locale || "en"
                    }
                ));
                const mnemonic = this.mnemonic;
                const node = HDNode.fromMnemonic(mnemonic.phrase, prefix, null, mnemonic.locale).derivePath(mnemonic.path);
                if (computeAddress(node.privateKey, prefix) !== this.address) {
                    logger.throwArgumentError("mnemonic/address mismatch", "privateKey", "[REDACTED]");
                }
            } else {
                defineReadOnly(this, "_mnemonic", (): Mnemonic => null);
            }
        } else {
            if (SigningKey.isSigningKey(privateKey)) {
                defineReadOnly(this, "_signingKey", () => (<SigningKey>privateKey));
            } else {
                // A lot of common tools do not prefix private keys with a 0x (see: #1166)
                if (typeof(privateKey) === "string") {
                    if (privateKey.match(/^[0-9a-f]*$/i) && privateKey.length === 114) {
                        privateKey = "0x" + privateKey;
                    }
                }

                const signingKey = new SigningKey(privateKey);
                defineReadOnly(this, "_signingKey", () => signingKey);
            }

            defineReadOnly(this, "_mnemonic", (): Mnemonic => null);
            defineReadOnly(this, "address", publicToAddress(this.publicKey, prefix));
        }

        /* istanbul ignore if */
        if (provider && !Provider.isProvider(provider)) {
            logger.throwArgumentError("invalid provider", "provider", provider);
        }

        defineReadOnly(this, "provider", provider || null);
    }

    get mnemonic(): Mnemonic { return this._mnemonic(); }
    get privateKey(): string { return this._signingKey().privateKey; }
    get publicKey(): string { return this._signingKey().publicKey; }

    getAddress(): Promise<string> {
        return Promise.resolve(this.address);
    }

    connect(provider: Provider): Wallet {
        return new Wallet(this, this.prefix, provider);
    }

    signTransaction(transaction: TransactionRequest): Promise<string> {
        return resolveProperties(transaction).then((tx) => {
            if (tx.from != null) {
                if (getAddress(tx.from) !== this.address) {
                    logger.throwArgumentError("transaction from address mismatch", "transaction.from", transaction.from);
                }
                delete tx.from;
            }

            const signature = this._signingKey().signDigest(sha256(serialize(<UnsignedTransaction>tx)));
            return serialize(<UnsignedTransaction>tx, signature);
        });
    }

    async signMessage(message: Bytes | string): Promise<string> {
        return this._signingKey().signDigest(hashMessage(message));
    }

    async _signTypedData(domain: TypedDataDomain, types: Record<string, Array<TypedDataField>>, value: Record<string, any>): Promise<string> {
        // Populate any ENS names
        const populated = await _TypedDataEncoder.resolveNames(domain, types, value, (name: string) => {
            if (this.provider == null) {
                logger.throwError("cannot resolve ENS names without a provider", Logger.errors.UNSUPPORTED_OPERATION, {
                    operation: "resolveName",
                    value: name
                });
            }
            return this.provider.resolveName(name);
        });

        return this._signingKey().signDigest(_TypedDataEncoder.hash(populated.domain, types, populated.value));
    }

    encrypt(password: Bytes | string, options?: any, progressCallback?: ProgressCallback): Promise<string> {
        if (typeof(options) === "function" && !progressCallback) {
            progressCallback = options;
            options = {};
        }

        if (progressCallback && typeof(progressCallback) !== "function") {
            throw new Error("invalid callback");
        }

        if (!options) { options = {}; }

        return encryptKeystore(this, password, options, progressCallback);
    }


    /**
     *  Static methods to create Wallet instances.
     */
    static createRandom(prefix: string, options?: any): Wallet {
        let entropy: Uint8Array = randomBytes(16);

        if (!options) { options = { }; }

        if (options.extraEntropy) {
            entropy = arrayify(hexDataSlice(sha256(concat([ entropy, options.extraEntropy ])), 0, 16));
        }

        const mnemonic = entropyToMnemonic(entropy, options.locale);
        return Wallet.fromMnemonic(mnemonic, prefix, options.path, options.locale);
    }

    static fromEncryptedJson(json: string, password: Bytes | string, progressCallback?: ProgressCallback): Promise<Wallet> {
        return decryptJsonWallet(json, password, progressCallback).then((account) => {
            const prefix = extractPrefix(account.address);
            return new Wallet(account, prefix);
        });
    }

    static fromEncryptedJsonSync(json: string, password: Bytes | string): Wallet {
        const account = decryptJsonWalletSync(json, password);
        const prefix = extractPrefix(account.address);
        return new Wallet(account, prefix);
    }

    static fromMnemonic(mnemonic: string, prefix: string, path?: string, wordlist?: Wordlist): Wallet {
        if (!path) { path = defaultPath; }
        return new Wallet(HDNode.fromMnemonic(mnemonic, prefix, null, wordlist).derivePath(path), prefix);
    }
}

export function verifyMessage(message: Bytes | string, signature: string, prefix: string): string {
    return recoverAddress(hashMessage(message), signature, prefix);
}

export function verifyTypedData(domain: TypedDataDomain, types: Record<string, Array<TypedDataField>>, value: Record<string, any>, signature: string, prefix: string): string {
    return recoverAddress(_TypedDataEncoder.hash(domain, types, value), signature, prefix);
}
