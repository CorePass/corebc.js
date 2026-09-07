import { Contract } from "../contract/index.js";
/** On-chain interface defined by CIP-150. */
export const cip150Abi = Object.freeze([
    "function getMetadataValue(string key) view returns (string value)",
    "function hasMetadataKey(string key) view returns (bool exists)",
    "function isMetadataSealed(string key) view returns (bool sealed)",
    "function listMetadataKeys() view returns (string[] keys)",
    "function getMetadataByIndex(uint256 index) view returns (string key, string value)",
    "function metadataCount() view returns (uint256 total)",
    "function setMetadataValue(string key, string value)",
    "function sealMetadataKey(string key)",
]);
export const cip151TokenExpirationKey = "tokenExpiration";
export const cip151TradingStopKey = "tradingStop";
export const cip152LabKey = "lab";
/** Lifecycle timestamps in exact Unix seconds; absent values impose no limit. */
export class Cip151Lifecycle {
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
export class Cip152LabCertificate {
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
export class Cip150MetadataContract {
    contract;
    constructor(address, runner) {
        this.contract = new Contract(address, cip150Abi, runner);
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
export { CustomUnitToken, CustomUnitBalance, CustomUnitDiscovery, customUnitAbi, } from "./custom-units.js";
//# sourceMappingURL=index.js.map