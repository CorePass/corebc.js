import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { BytesLike } from "@ethersproject/bytes";
export declare type UnsignedTransaction = {
    to?: string;
    nonce?: number;
    networkId?: number;
    energyLimit?: BigNumberish;
    energyPrice?: BigNumberish;
    data?: BytesLike;
    value?: BigNumberish;
};
export interface Transaction {
    hash?: string;
    to?: string;
    from?: string;
    nonce: number;
    networkId: number;
    energyLimit: BigNumber;
    energyPrice?: BigNumber;
    data: string;
    value: BigNumber;
    signature?: string;
}
export declare function computeAddress(key: BytesLike | string, prefix: string): string;
export declare function recoverAddress(digest: BytesLike, signature: string, prefix: string): string;
export declare function serialize(transaction: UnsignedTransaction, signature?: string): string;
export declare function parse(rawTransaction: BytesLike): Transaction;
//# sourceMappingURL=index.d.ts.map