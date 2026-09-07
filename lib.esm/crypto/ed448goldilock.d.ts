import { Buffer } from "buffer";
export declare class Ed448Goldilock {
    static _channel: import("./ed448-types.js").Ed448Backend;
    static generatePrivateKey(): Buffer<ArrayBufferLike>;
    static getPublicKeyFromPrivateKey(privateKey: string): string;
    static signWithPrivateKey(privateKey: string, msg: string): string;
    static signWithPrivateKeyNConcatPubkey(privateKey: string, msg: string): string;
    static verifySignature(msgHash: string, signedMsg: string, pubKey: string): boolean;
    static SHA512Hash(password: string, salt: string): string;
    static concatenateAndHex(prefix: number, key: string, index: number, salt: string): string;
    static addScalar(a: string, b: string): string;
    static seedToExtendedPrivate(seed: string): string;
    static childPrivateToPrivate(s: string, index: number): string;
    static HDWalletGenerateKeyFromSeed(seed: string, index: number): string;
}
//# sourceMappingURL=ed448goldilock.d.ts.map