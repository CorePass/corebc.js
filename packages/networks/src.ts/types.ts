"use strict";

export type Network = {
    name: string,
    networkId: number,
    ensAddress?: string,
    _defaultProvider?: (providers: any, options?: any) => any
}

export type Networkish = Network | string | number;
