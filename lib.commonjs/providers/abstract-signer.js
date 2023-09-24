"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoidSigner = exports.AbstractSigner = void 0;
/**
 *  About Abstract Signer and subclassing
 *
 *  @_section: api/providers/abstract-signer: Subclassing Signer [abstract-signer]
 */
const index_js_1 = require("../address/index.js");
const index_js_2 = require("../transaction/index.js");
const index_js_3 = require("../utils/index.js");
const provider_js_1 = require("./provider.js");
function checkProvider(signer, operation) {
    if (signer.provider) {
        return signer.provider;
    }
    (0, index_js_3.assert)(false, "missing provider", "UNSUPPORTED_OPERATION", { operation });
}
async function populate(signer, tx) {
    let pop = (0, provider_js_1.copyRequest)(tx);
    if (pop.to != null) {
        pop.to = (0, index_js_1.resolveAddress)(pop.to);
    }
    if (pop.from != null) {
        const from = pop.from;
        pop.from = Promise.all([signer.getAddress(), (0, index_js_1.resolveAddress)(from)]).then(([address, from]) => {
            (0, index_js_3.assertArgument)(address.toLowerCase() === from.toLowerCase(), "transaction from mismatch", "tx.from", from);
            return address;
        });
    }
    else {
        pop.from = signer.getAddress();
    }
    return await (0, index_js_3.resolveProperties)(pop);
}
class AbstractSigner {
    provider;
    constructor(provider) {
        (0, index_js_3.defineProperties)(this, { provider: provider || null });
    }
    async getNonce(blockTag) {
        return checkProvider(this, "getTransactionCount").getTransactionCount(await this.getAddress(), blockTag);
    }
    async populateCall(tx) {
        const pop = await populate(this, tx);
        return pop;
    }
    async populateTransaction(tx) {
        const provider = checkProvider(this, "populateTransaction");
        const pop = await populate(this, tx);
        if (pop.nonce == null) {
            pop.nonce = await this.getNonce("pending");
        }
        if (pop.energyLimit == null) {
            pop.energyLimit = await this.estimateEnergy(pop);
        }
        // Populate the chain ID
        const network = await this.provider.getNetwork();
        if (pop.networkId != null) {
            const networkId = (0, index_js_3.getBigInt)(pop.networkId);
            (0, index_js_3.assertArgument)(networkId === network.networkId, "transaction networkId mismatch", "tx.networkId", tx.networkId);
        }
        else {
            pop.networkId = network.networkId;
        }
        // We need to get fee data to determine things
        const feeData = await provider.getFeeData();
        // We need to auto-detect the intended type of this transaction...
        if (feeData.energyPrice != null) {
            // Network doesn't support EIP-1559...
            // Populate missing fee data
            if (pop.energyPrice == null) {
                pop.energyPrice = feeData.energyPrice;
            }
        }
        else {
            // getFeeData has failed us.
            (0, index_js_3.assert)(false, "failed to get consistent fee data", "UNSUPPORTED_OPERATION", {
                operation: "signer.getFeeData",
            });
        }
        //@TOOD: Don't await all over the place; save them up for
        // the end for better batching
        return await (0, index_js_3.resolveProperties)(pop);
    }
    async estimateEnergy(tx) {
        return checkProvider(this, "estimateEnergy").estimateEnergy(await this.populateCall(tx));
    }
    async call(tx) {
        return checkProvider(this, "call").call(await this.populateCall(tx));
    }
    async resolveName(name) {
        return (0, index_js_1.getAddress)(name);
    }
    async sendTransaction(tx) {
        const provider = checkProvider(this, "sendTransaction");
        const pop = await this.populateTransaction(tx);
        delete pop.from;
        const txObj = index_js_2.Transaction.from(pop);
        return await provider.broadcastTransaction(await this.signTransaction(txObj));
    }
}
exports.AbstractSigner = AbstractSigner;
class VoidSigner extends AbstractSigner {
    address;
    constructor(address, provider) {
        super(provider);
        (0, index_js_3.defineProperties)(this, { address });
    }
    async getAddress() {
        return this.address;
    }
    connect(provider) {
        return new VoidSigner(this.address, provider);
    }
    #throwUnsupported(suffix, operation) {
        (0, index_js_3.assert)(false, `VoidSigner cannot sign ${suffix}`, "UNSUPPORTED_OPERATION", {
            operation,
        });
    }
    async signTransaction(tx) {
        this.#throwUnsupported("transactions", "signTransaction");
    }
    async signMessage(message) {
        this.#throwUnsupported("messages", "signMessage");
    }
    async signTypedData(domain, types, value) {
        this.#throwUnsupported("typed-data", "signTypedData");
    }
}
exports.VoidSigner = VoidSigner;
//# sourceMappingURL=abstract-signer.js.map