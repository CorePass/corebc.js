/**
 *  About provider formatting?
 *
 *  @_section: api/providers/formatting:Formatting  [provider-formatting]
 */
export interface BlockParams {
    hash?: null | string;
    number: number;
    timestamp: number;
    parentHash: string;
    nonce: string;
    difficulty: bigint;
    energyLimit: bigint;
    energyUsed: bigint;
    miner: string;
    extraData: string;
    baseFeePerEnergy: null | bigint;
    transactions: ReadonlyArray<string | TransactionResponseParams>;
}
export interface LogParams {
    transactionHash: string;
    blockHash: string;
    blockNumber: number;
    removed: boolean;
    address: string;
    data: string;
    topics: ReadonlyArray<string>;
    index: number;
    transactionIndex: number;
}
export interface TransactionReceiptParams {
    to: null | string;
    from: string;
    contractAddress: null | string;
    hash: string;
    index: number;
    blockHash: string;
    blockNumber: number;
    logsBloom: string;
    logs: ReadonlyArray<LogParams>;
    energyUsed: bigint;
    cumulativeEnergyUsed: bigint;
    energyPrice?: null | bigint;
    effectiveEnergyPrice?: null | bigint;
    type: number;
    status: null | number;
    root: null | string;
}
export interface TransactionResponseParams {
    blockNumber: null | number;
    blockHash: null | string;
    hash: string;
    index: number;
    type: number;
    to: null | string;
    from: string;
    nonce: number;
    energyLimit: bigint;
    energyPrice: bigint;
    data: string;
    value: bigint;
    networkId: bigint;
    signature: string;
}
//# sourceMappingURL=formatting.d.ts.map