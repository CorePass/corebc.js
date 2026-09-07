'use strict';

require('../abi/abi-coder.js');
require('../utils/base58.js');
var data = require('../utils/data.js');
var errors = require('../utils/errors.js');
var properties = require('../utils/properties.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
require('../abi/fragments.js');
var _interface = require('../abi/interface.js');
var contractAddress = require('../address/contract-address.js');
var contract = require('./contract.js');

// A = Arguments to the constructor
// I = Interface of deployed contracts
class ContractFactory {
    interface;
    bytecode;
    runner;
    constructor(abi, bytecode, runner) {
        const iface = _interface.Interface.from(abi);
        // Dereference Solidity bytecode objects and allow a missing `0x`-prefix
        if (bytecode instanceof Uint8Array) {
            bytecode = data.hexlify(data.getBytes(bytecode));
        }
        else if (typeof bytecode === "string") {
            bytecode = bytecode;
        }
        else if (data.isBytes(bytecode)) {
            bytecode = data.hexlify(bytecode);
        }
        else if (bytecode && typeof bytecode.object === "string") {
            // Allow the bytecode object from the Solidity compiler
            bytecode = bytecode.object;
        }
        else {
            // Crash in the next verification step
            bytecode = "!";
        }
        properties.defineProperties(this, {
            // @ts-ignore
            bytecode,
            interface: iface,
            runner: runner || null,
        });
    }
    async getDeployTransaction(...args) {
        let overrides = {};
        const fragment = this.interface.deploy;
        if (fragment.inputs.length + 1 === args.length) {
            overrides = await contract.copyOverrides(args.pop());
        }
        if (fragment.inputs.length !== args.length) {
            throw new Error("incorrect number of arguments to constructor");
        }
        const resolvedArgs = await contract.resolveArgs(this.runner, fragment.inputs, args);
        const data$1 = data.concat([
            this.bytecode,
            this.interface.encodeDeploy(resolvedArgs),
        ]);
        return Object.assign({}, overrides, { data: data$1 });
    }
    async deploy(...args) {
        const tx = await this.getDeployTransaction(...args);
        errors.assert(this.runner && typeof this.runner.sendTransaction === "function", "factory runner does not support sending transactions", "UNSUPPORTED_OPERATION", {
            operation: "sendTransaction",
        });
        const sentTx = await this.runner.sendTransaction(tx);
        const address = contractAddress.getCreateAddress(sentTx);
        return new contract.BaseContract(address, this.interface, this.runner, sentTx);
    }
    connect(runner) {
        return new ContractFactory(this.interface, this.bytecode, runner);
    }
    static fromSolidity(output, runner) {
        errors.assertArgument(output != null, "bad compiler output", "output", output);
        if (typeof output === "string") {
            output = JSON.parse(output);
        }
        const abi = output.abi;
        let bytecode = "";
        if (output.bytecode) {
            bytecode = output.bytecode;
        }
        else if (output.evm && output.evm.bytecode) {
            bytecode = output.evm.bytecode;
        }
        return new this(abi, bytecode, runner);
    }
}

exports.ContractFactory = ContractFactory;
//# sourceMappingURL=factory.js.map
