export declare const defaultIpfsGatewayTemplate = "https://ipf.sk/{cid}";
export interface IpfsGatewayOptions {
    template?: string;
    maxResponseBytes?: number;
    timeoutMs?: number;
    fetch?: typeof globalThis.fetch;
}
/** Configurable IPFS resolution and bounded JSON loading. */
export declare class IpfsGateway {
    #private;
    readonly template: string;
    readonly maxResponseBytes: number;
    readonly timeoutMs: number;
    constructor(options?: IpfsGatewayOptions);
    resolve(reference: string): URL;
    readJson(reference: string): Promise<unknown>;
}
//# sourceMappingURL=index.d.ts.map