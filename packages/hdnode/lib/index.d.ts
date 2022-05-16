import { ExternallyOwnedAccount } from "@corepass/corebc-abstract-signer";
import { BytesLike } from "@corepass/corebc-bytes";
import { Wordlist } from "@corepass/corebc-wordlists";
export declare const defaultPath = "m/44'/654'/0'/0'/5";
export interface Mnemonic {
    readonly phrase: string;
    readonly path: string;
    readonly locale: string;
}
export declare class HDNode implements ExternallyOwnedAccount {
    readonly extendedPrivateKey: string;
    readonly privateKey: string;
    readonly publicKey: string;
    readonly fingerprint: string;
    readonly parentFingerprint: string;
    readonly address: string;
    readonly mnemonic?: Mnemonic;
    readonly path: string;
    readonly prefix: string;
    readonly index: number;
    readonly depth: number;
    /**
     *  This constructor should not be called directly.
     *
     *  Please use:
     *   - fromMnemonic
     *   - fromSeed
     */
    constructor(constructorGuard: any, extendedPrivateKey: string, publicKey: string, parentFingerprint: string, prefix: string, index: number, depth: number, mnemonicOrPath: Mnemonic | string);
    neuter(): HDNode;
    private _derive;
    derivePath(path: string): HDNode;
    static _fromSeed(seed: BytesLike, mnemonic: Mnemonic, prefix: string): HDNode;
    static fromMnemonic(mnemonic: string, prefix: string, password?: string, wordlist?: string | Wordlist): HDNode;
    static fromSeed(seed: BytesLike, prefix: string): HDNode;
}
export declare function mnemonicToSeed(mnemonic: string, password?: string): string;
export declare function mnemonicToEntropy(mnemonic: string, wordlist?: string | Wordlist): string;
export declare function entropyToMnemonic(entropy: BytesLike, wordlist?: string | Wordlist): string;
export declare function isValidMnemonic(mnemonic: string, wordlist?: Wordlist): boolean;
export declare function getAccountPath(index: number): string;
//# sourceMappingURL=index.d.ts.map