import { BytesLike } from "@ethersproject/bytes";
export declare class SigningKey {
    readonly privateKey: string;
    readonly publicKey: string;
    readonly _isSigningKey: boolean;
    constructor(privateKey: BytesLike);
    signDigest(digest: BytesLike): string;
    static isSigningKey(value: any): value is SigningKey;
}
export declare function recoverPublicKey(digest: BytesLike, signature: string): string;
export declare function computePublicKey(key: BytesLike): string;
//# sourceMappingURL=index.d.ts.map