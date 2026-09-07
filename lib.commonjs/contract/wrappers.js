'use strict';

var provider = require('../providers/provider.js');
require('../utils/base58.js');
require('../logger/logger.js');
require('../utils/errors.js');
var events = require('../utils/events.js');
var properties = require('../utils/properties.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');

class EventLog extends provider.Log {
    interface;
    fragment;
    args;
    constructor(log, iface, fragment) {
        super(log, log.provider);
        const args = iface.decodeEventLog(fragment, log.data, log.topics);
        properties.defineProperties(this, { args, fragment, interface: iface });
    }
    get eventName() {
        return this.fragment.name;
    }
    get eventSignature() {
        return this.fragment.format();
    }
}
class ContractTransactionReceipt extends provider.TransactionReceipt {
    #iface;
    constructor(iface, provider, tx) {
        super(tx, provider);
        this.#iface = iface;
    }
    get logs() {
        return super.logs.map((log) => {
            const fragment = log.topics.length
                ? this.#iface.getEvent(log.topics[0])
                : null;
            if (fragment) {
                return new EventLog(log, this.#iface, fragment);
            }
            else {
                return log;
            }
        });
    }
}
class ContractTransactionResponse extends provider.TransactionResponse {
    #iface;
    constructor(iface, provider, tx) {
        super(tx, provider);
        this.#iface = iface;
    }
    async wait(confirms) {
        const receipt = await super.wait();
        if (receipt == null) {
            return null;
        }
        return new ContractTransactionReceipt(this.#iface, this.provider, receipt);
    }
}
class ContractUnknownEventPayload extends events.EventPayload {
    log;
    constructor(contract, listener, filter, log) {
        super(contract, listener, filter);
        properties.defineProperties(this, { log });
    }
    async getBlock() {
        return await this.log.getBlock();
    }
    async getTransaction() {
        return await this.log.getTransaction();
    }
    async getTransactionReceipt() {
        return await this.log.getTransactionReceipt();
    }
}
class ContractEventPayload extends ContractUnknownEventPayload {
    constructor(contract, listener, filter, fragment, _log) {
        super(contract, listener, filter, new EventLog(_log, contract.interface, fragment));
        const args = contract.interface.decodeEventLog(fragment, this.log.data, this.log.topics);
        properties.defineProperties(this, { args, fragment });
    }
    get eventName() {
        return this.fragment.name;
    }
    get eventSignature() {
        return this.fragment.format();
    }
}

exports.ContractEventPayload = ContractEventPayload;
exports.ContractTransactionReceipt = ContractTransactionReceipt;
exports.ContractTransactionResponse = ContractTransactionResponse;
exports.ContractUnknownEventPayload = ContractUnknownEventPayload;
exports.EventLog = EventLog;
//# sourceMappingURL=wrappers.js.map
