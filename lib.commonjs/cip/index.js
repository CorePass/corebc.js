'use strict';

var contract = require('../contract/contract.js');
require('../abi/abi-coder.js');
require('../utils/base58.js');
require('../logger/logger.js');
require('../utils/errors.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
require('../abi/fragments.js');
require('../crypto/keccak.js');
require('../crypto/sha3.js');
require('../constants/numbers.js');
require('../address/index.js');
require('../crypto/hmac.js');
require('../crypto/ripemd160.js');
require('../crypto/pbkdf2.js');
require('../crypto/random.js');
require('../crypto/scrypt.js');
require('bcrypto/lib/ed448.js');
require('buffer');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
require('crypto');
require('../crypto/signature.js');
require('../transaction/transaction.js');
require('../hash/typed-data.js');
require('../providers/provider.js');
var customUnits = require('./custom-units.js');

/** On-chain interface defined by CIP-150. */
const cip150Abi = Object.freeze([
    "function getMetadataValue(string key) view returns (string value)",
    "function hasMetadataKey(string key) view returns (bool exists)",
    "function isMetadataSealed(string key) view returns (bool sealed)",
    "function listMetadataKeys() view returns (string[] keys)",
    "function getMetadataByIndex(uint256 index) view returns (string key, string value)",
    "function metadataCount() view returns (uint256 total)",
    "function setMetadataValue(string key, string value)",
    "function sealMetadataKey(string key)",
]);
const cip151TokenExpirationKey = "tokenExpiration";
const cip151TradingStopKey = "tradingStop";
const cip152LabKey = "lab";
/** Lifecycle timestamps in exact Unix seconds; absent values impose no limit. */
class Cip151Lifecycle {
    tokenExpiration;
    tradingStop;
    constructor(metadata = {}) {
        const parse = (key) => {
            const value = metadata[key];
            if (value == null || value === "")
                return null;
            if (!/^\d+$/.test(value))
                throw new TypeError(`${key} must be a non-negative Unix timestamp`);
            return BigInt(value);
        };
        this.tokenExpiration = parse(cip151TokenExpirationKey);
        this.tradingStop = parse(cip151TradingStopKey);
    }
    isExpiredAt(seconds) {
        return this.tokenExpiration !== null && seconds >= this.tokenExpiration;
    }
    isTradingStoppedAt(seconds) {
        return this.tradingStop !== null && seconds >= this.tradingStop;
    }
}
/** Validates certificate structure, not the authenticity of its issuer. */
class Cip152LabCertificate {
    measurements;
    constructor(json) {
        if (json === null || typeof json !== "object" || Array.isArray(json))
            throw new TypeError("CIP-152 lab.json must be an object");
        const measurements = Object.create(null);
        for (const [key, property] of Object.entries(json)) {
            if (!property ||
                typeof property !== "object" ||
                Array.isArray(property) ||
                !Object.hasOwn(property, "value"))
                throw new TypeError(`CIP-152 property ${key} must contain a value`);
            const { value, unit } = property;
            if (!(typeof value === "string" ||
                (typeof value === "number" && Number.isFinite(value))))
                throw new TypeError(`CIP-152 property ${key} has an invalid value`);
            if (unit != null && typeof unit !== "string")
                throw new TypeError(`CIP-152 property ${key} has an invalid unit`);
            measurements[key] = Object.freeze(unit == null ? { value } : { value, unit });
        }
        this.measurements = Object.freeze(measurements);
    }
}
/** Typed metadata reader and writer. Writes require a signer as runner. */
class Cip150MetadataContract {
    contract;
    constructor(address, runner) {
        this.contract = new contract.Contract(address, cip150Abi, runner);
    }
    getValue(key, blockTag) {
        return this.contract.getMetadataValue(key, { blockTag });
    }
    hasKey(key, blockTag) {
        return this.contract.hasMetadataKey(key, { blockTag });
    }
    isSealed(key, blockTag) {
        return this.contract.isMetadataSealed(key, { blockTag });
    }
    async listKeys(blockTag) {
        return Object.freeze(Array.from(await this.contract.listMetadataKeys({ blockTag })));
    }
    async getByIndex(index, blockTag) {
        const [key, value] = await this.contract.getMetadataByIndex(index, {
            blockTag,
        });
        return Object.freeze({ key, value });
    }
    count(blockTag) {
        return this.contract.metadataCount({ blockTag });
    }
    async readAll(blockTag, includeSealedState = true) {
        const entries = [];
        for (const key of await this.listKeys(blockTag)) {
            const value = await this.getValue(key, blockTag);
            entries.push(Object.freeze(includeSealedState
                ? { key, value, sealed: await this.isSealed(key, blockTag) }
                : { key, value }));
        }
        return Object.freeze(entries);
    }
    setValue(key, value, overrides = {}) {
        return this.contract.setMetadataValue(key, value, overrides);
    }
    sealKey(key, overrides = {}) {
        return this.contract.sealMetadataKey(key, overrides);
    }
    async readLifecycle(blockTag) {
        const metadata = {};
        for (const key of [cip151TokenExpirationKey, cip151TradingStopKey]) {
            if (await this.hasKey(key, blockTag))
                metadata[key] = await this.getValue(key, blockTag);
        }
        return new Cip151Lifecycle(metadata);
    }
    async readLabCertificate(gateway, blockTag) {
        if (!(await this.hasKey(cip152LabKey, blockTag)))
            return null;
        const reference = await this.getValue(cip152LabKey, blockTag);
        if (!gateway.resolve(reference).pathname.endsWith("/lab.json"))
            throw new TypeError("CIP-152 reference must point to lab.json");
        return new Cip152LabCertificate(await gateway.readJson(reference));
    }
}

exports.CustomUnitBalance = customUnits.CustomUnitBalance;
exports.CustomUnitDiscovery = customUnits.CustomUnitDiscovery;
exports.CustomUnitToken = customUnits.CustomUnitToken;
exports.customUnitAbi = customUnits.customUnitAbi;
exports.Cip150MetadataContract = Cip150MetadataContract;
exports.Cip151Lifecycle = Cip151Lifecycle;
exports.Cip152LabCertificate = Cip152LabCertificate;
exports.cip150Abi = cip150Abi;
exports.cip151TokenExpirationKey = cip151TokenExpirationKey;
exports.cip151TradingStopKey = cip151TradingStopKey;
exports.cip152LabKey = cip152LabKey;
//# sourceMappingURL=index.js.map
