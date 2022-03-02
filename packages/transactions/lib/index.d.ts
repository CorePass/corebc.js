import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { BytesLike, SignatureLike } from "@ethersproject/bytes";
export declare type AccessList = Array<{
    address: string;
    storageKeys: Array<string>;
}>;
export declare type AccessListish = AccessList | Array<[string, Array<string>]> | Record<string, Array<string>>;
export declare enum TransactionTypes {
    legacy = 0,
    eip2930 = 1,
    eip1559 = 2
}
export declare type UnsignedTransaction = {
    to?: string;
    nonce?: number;
    energyLimit?: BigNumberish;
    energyPrice?: BigNumberish;
    data?: BytesLike;
    value?: BigNumberish;
    networkId?: number;
    type?: number | null;
    accessList?: AccessListish;
    maxPriorityFeePerEnergy?: BigNumberish;
    maxFeePerEnergy?: BigNumberish;
};
export interface Transaction {
    hash?: string;
    to?: string;
    from?: string;
    nonce: number;
    energyLimit: BigNumber;
    energyPrice?: BigNumber;
    data: string;
    value: BigNumber;
    networkId: number;
    r?: string;
    s?: string;
    v?: number;
    type?: number | null;
    accessList?: AccessList;
    maxPriorityFeePerEnergy?: BigNumber;
    maxFeePerEnergy?: BigNumber;
}
export declare function computeAddress(key: BytesLike | string): string;
export declare function recoverAddress(digest: BytesLike, signature: SignatureLike): string;
export declare function accessListify(value: AccessListish): AccessList;
export declare function serialize(transaction: UnsignedTransaction, signature?: SignatureLike): string;
export declare function parse(rawTransaction: BytesLike): Transaction;
//# sourceMappingURL=index.d.ts.map