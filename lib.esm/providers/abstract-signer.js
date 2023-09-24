/**
 *  About Abstract Signer and subclassing
 *
 *  @_section: api/providers/abstract-signer: Subclassing Signer [abstract-signer]
 */
import { getAddress, resolveAddress } from "../address/index.js";
import { Transaction } from "../transaction/index.js";
import { defineProperties, getBigInt, resolveProperties, assert, assertArgument, } from "../utils/index.js";
import { copyRequest } from "./provider.js";
function checkProvider(signer, operation) {
    if (signer.provider) {
        return signer.provider;
    }
    assert(false, "missing provider", "UNSUPPORTED_OPERATION", { operation });
}
async function populate(signer, tx) {
    let pop = copyRequest(tx);
    if (pop.to != null) {
        pop.to = resolveAddress(pop.to);
    }
    if (pop.from != null) {
        const from = pop.from;
        pop.from = Promise.all([signer.getAddress(), resolveAddress(from)]).then(([address, from]) => {
            assertArgument(address.toLowerCase() === from.toLowerCase(), "transaction from mismatch", "tx.from", from);
            return address;
        });
    }
    else {
        pop.from = signer.getAddress();
    }
    return await resolveProperties(pop);
}
export class AbstractSigner {
    provider;
    constructor(provider) {
        defineProperties(this, { provider: provider || null });
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
            const networkId = getBigInt(pop.networkId);
            assertArgument(networkId === network.networkId, "transaction networkId mismatch", "tx.networkId", tx.networkId);
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
            assert(false, "failed to get consistent fee data", "UNSUPPORTED_OPERATION", {
                operation: "signer.getFeeData",
            });
        }
        //@TOOD: Don't await all over the place; save them up for
        // the end for better batching
        return await resolveProperties(pop);
    }
    async estimateEnergy(tx) {
        return checkProvider(this, "estimateEnergy").estimateEnergy(await this.populateCall(tx));
    }
    async call(tx) {
        return checkProvider(this, "call").call(await this.populateCall(tx));
    }
    async resolveName(name) {
        return getAddress(name);
    }
    async sendTransaction(tx) {
        const provider = checkProvider(this, "sendTransaction");
        const pop = await this.populateTransaction(tx);
        delete pop.from;
        const txObj = Transaction.from(pop);
        return await provider.broadcastTransaction(await this.signTransaction(txObj));
    }
}
export class VoidSigner extends AbstractSigner {
    address;
    constructor(address, provider) {
        super(provider);
        defineProperties(this, { address });
    }
    async getAddress() {
        return this.address;
    }
    connect(provider) {
        return new VoidSigner(this.address, provider);
    }
    #throwUnsupported(suffix, operation) {
        assert(false, `VoidSigner cannot sign ${suffix}`, "UNSUPPORTED_OPERATION", {
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
//# sourceMappingURL=abstract-signer.js.map