'use strict';

var checks = require('../address/checks.js');
var index = require('../address/index.js');
require('../utils/base58.js');
require('../logger/logger.js');
var errors = require('../utils/errors.js');
var properties = require('../utils/properties.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
var maths = require('../utils/maths.js');
require('../crypto/hmac.js');
require('../crypto/ripemd160.js');
require('../crypto/pbkdf2.js');
require('../crypto/random.js');
require('../crypto/scrypt.js');
require('../crypto/sha3.js');
require('bcrypto/lib/ed448.js');
require('buffer');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
require('crypto');
require('../crypto/keccak.js');
require('../crypto/signature.js');
var transaction = require('../transaction/transaction.js');
var provider = require('./provider.js');

/**
 *  About Abstract Signer and subclassing
 *
 *  @_section: api/providers/abstract-signer: Subclassing Signer [abstract-signer]
 */
function checkProvider(signer, operation) {
    if (signer.provider) {
        return signer.provider;
    }
    errors.assert(false, "missing provider", "UNSUPPORTED_OPERATION", { operation });
}
async function populate(signer, tx) {
    let pop = provider.copyRequest(tx);
    if (pop.to != null) {
        pop.to = checks.resolveAddress(pop.to);
    }
    if (pop.from != null) {
        const from = pop.from;
        pop.from = Promise.all([signer.getAddress(), checks.resolveAddress(from)]).then(([address, from]) => {
            errors.assertArgument(address.toLowerCase() === from.toLowerCase(), "transaction from mismatch", "tx.from", from);
            return address;
        });
    }
    else {
        pop.from = signer.getAddress();
    }
    return await properties.resolveProperties(pop);
}
class AbstractSigner {
    provider;
    constructor(provider) {
        properties.defineProperties(this, { provider: provider || null });
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
            const networkId = maths.getBigInt(pop.networkId);
            errors.assertArgument(networkId === network.networkId, "transaction networkId mismatch", "tx.networkId", tx.networkId);
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
            errors.assert(false, "failed to get consistent fee data", "UNSUPPORTED_OPERATION", {
                operation: "signer.getFeeData",
            });
        }
        //@TOOD: Don't await all over the place; save them up for
        // the end for better batching
        return await properties.resolveProperties(pop);
    }
    async estimateEnergy(tx) {
        return checkProvider(this, "estimateEnergy").estimateEnergy(await this.populateCall(tx));
    }
    async call(tx) {
        return checkProvider(this, "call").call(await this.populateCall(tx));
    }
    async resolveName(name) {
        return index.getAddress(name);
    }
    async sendTransaction(tx) {
        const provider = checkProvider(this, "sendTransaction");
        const pop = await this.populateTransaction(tx);
        delete pop.from;
        const txObj = transaction.Transaction.from(pop);
        return await provider.broadcastTransaction(await this.signTransaction(txObj));
    }
}
class VoidSigner extends AbstractSigner {
    address;
    constructor(address, provider) {
        super(provider);
        properties.defineProperties(this, { address });
    }
    async getAddress() {
        return this.address;
    }
    connect(provider) {
        return new VoidSigner(this.address, provider);
    }
    #throwUnsupported(suffix, operation) {
        errors.assert(false, `VoidSigner cannot sign ${suffix}`, "UNSUPPORTED_OPERATION", {
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

exports.AbstractSigner = AbstractSigner;
exports.VoidSigner = VoidSigner;
//# sourceMappingURL=abstract-signer.js.map
