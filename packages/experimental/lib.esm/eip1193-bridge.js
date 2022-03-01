"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import EventEmitter from "events";
import { ethers } from "ethers";
import { version } from "./_version";
const logger = new ethers.utils.Logger(version);
/*
function getBlockTag(tag) {
    if (tag == null) { return "latest"; }
    if (tag === "earliest" || tag === "latest" || tag === "pending") {
        return tag;
    }
    return ethers.utils.hexValue(tag)
}
*/
export class Eip1193Bridge extends EventEmitter {
    constructor(signer, provider) {
        super();
        ethers.utils.defineReadOnly(this, "signer", signer);
        ethers.utils.defineReadOnly(this, "provider", provider || null);
    }
    request(request) {
        return this.send(request.method, request.params || []);
    }
    send(method, params) {
        return __awaiter(this, void 0, void 0, function* () {
            function throwUnsupported(message) {
                return logger.throwError(message, ethers.utils.Logger.errors.UNSUPPORTED_OPERATION, {
                    method: method,
                    params: params
                });
            }
            let coerce = (value) => value;
            switch (method) {
                case "xcb_gasPrice": {
                    const result = yield this.provider.getGasPrice();
                    return result.toHexString();
                }
                case "xcb_accounts": {
                    const result = [];
                    if (this.signer) {
                        const address = yield this.signer.getAddress();
                        result.push(address);
                    }
                    return result;
                }
                case "xcb_blockNumber": {
                    return yield this.provider.getBlockNumber();
                }
                case "xcb_networkId": {
                    const result = yield this.provider.getNetwork();
                    return result.networkId;
                }
                case "xcb_getBalance": {
                    const result = yield this.provider.getBalance(params[0], params[1]);
                    return result.toHexString();
                }
                case "xcb_getStorageAt": {
                    return this.provider.getStorageAt(params[0], params[1], params[2]);
                }
                case "xcb_getTransactionCount": {
                    const result = yield this.provider.getTransactionCount(params[0], params[1]);
                    return ethers.utils.hexValue(result);
                }
                case "xcb_getBlockTransactionCountByHash":
                case "xcb_getBlockTransactionCountByNumber": {
                    const result = yield this.provider.getBlock(params[0]);
                    return ethers.utils.hexValue(result.transactions.length);
                }
                case "xcb_getCode": {
                    const result = yield this.provider.getBlock(params[0]);
                    return result;
                }
                case "xcb_sendRawTransaction": {
                    return yield this.provider.sendTransaction(params[0]);
                }
                case "xcb_call": {
                    const req = ethers.providers.JsonRpcProvider.hexlifyTransaction(params[0]);
                    return yield this.provider.call(req, params[1]);
                }
                case "estimateGas": {
                    if (params[1] && params[1] !== "latest") {
                        throwUnsupported("estimateGas does not support blockTag");
                    }
                    const req = ethers.providers.JsonRpcProvider.hexlifyTransaction(params[0]);
                    const result = yield this.provider.estimateGas(req);
                    return result.toHexString();
                }
                // @TODO: Transform? No uncles?
                case "xcb_getBlockByHash":
                case "xcb_getBlockByNumber": {
                    if (params[1]) {
                        return yield this.provider.getBlockWithTransactions(params[0]);
                    }
                    else {
                        return yield this.provider.getBlock(params[0]);
                    }
                }
                case "xcb_getTransactionByHash": {
                    return yield this.provider.getTransaction(params[0]);
                }
                case "xcb_getTransactionReceipt": {
                    return yield this.provider.getTransactionReceipt(params[0]);
                }
                case "xcb_sign": {
                    if (!this.signer) {
                        return throwUnsupported("xcb_sign requires an account");
                    }
                    const address = yield this.signer.getAddress();
                    if (address !== ethers.utils.getAddress(params[0])) {
                        logger.throwArgumentError("account mismatch or account not found", "params[0]", params[0]);
                    }
                    return this.signer.signMessage(ethers.utils.arrayify(params[1]));
                }
                case "xcb_sendTransaction": {
                    if (!this.signer) {
                        return throwUnsupported("xcb_sendTransaction requires an account");
                    }
                    const req = ethers.providers.JsonRpcProvider.hexlifyTransaction(params[0]);
                    const tx = yield this.signer.sendTransaction(req);
                    return tx.hash;
                }
                case "xcb_getUncleCountByBlockHash":
                case "xcb_getUncleCountByBlockNumber":
                    {
                        coerce = ethers.utils.hexValue;
                        break;
                    }
                case "xcb_getTransactionByBlockHashAndIndex":
                case "xcb_getTransactionByBlockNumberAndIndex":
                case "xcb_getUncleByBlockHashAndIndex":
                case "xcb_getUncleByBlockNumberAndIndex":
                case "xcb_newFilter":
                case "xcb_newBlockFilter":
                case "xcb_newPendingTransactionFilter":
                case "xcb_uninstallFilter":
                case "xcb_getFilterChanges":
                case "xcb_getFilterLogs":
                case "xcb_getLogs":
                    break;
            }
            // If our provider supports send, maybe it can do a better job?
            if ((this.provider).send) {
                const result = yield (this.provider).send(method, params);
                return coerce(result);
            }
            return throwUnsupported(`unsupported method: ${method}`);
        });
    }
}
//# sourceMappingURL=eip1193-bridge.js.map