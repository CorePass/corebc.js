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

const customUnitAbi = Object.freeze([
    "function supportsUnit(string unit) view returns (bool)",
    "function supportedUnits() view returns (string[])",
    "function preferredUnit() view returns (string)",
    "function balanceOf(address account) view returns (uint256)",
    "function balanceOfUnit(address account, string unit) view returns (uint256)",
]);
class CustomUnitDiscovery {
    preferredUnit;
    supportedUnits;
    constructor(units, preferredUnit) {
        this.preferredUnit = preferredUnit;
        this.supportedUnits = Object.freeze([...units]);
    }
    get isValid() {
        return (this.supports("units") &&
            this.preferredUnit !== "" &&
            this.supports(this.preferredUnit));
    }
    supports(unit) {
        return this.supportedUnits.includes(unit);
    }
}
/** Exact balances and multiplier ratio. A zero denominator has no multiplier. */
class CustomUnitBalance {
    canonicalAmount;
    unitAmount;
    unit;
    constructor(canonicalAmount, unitAmount, unit) {
        this.canonicalAmount = canonicalAmount;
        this.unitAmount = unitAmount;
        this.unit = unit;
    }
    get multiplierNumerator() {
        return this.unitAmount;
    }
    get multiplierDenominator() {
        return this.canonicalAmount;
    }
}
/** Core custom-unit contract convention used by Tone and Core API. */
class CustomUnitToken {
    contract;
    constructor(address, runner) {
        this.contract = new contract.Contract(address, customUnitAbi, runner);
    }
    async supportsUnit(unit, blockTag) {
        return (unit.trim() !== "" &&
            (await this.contract.supportsUnit(unit.trim(), { blockTag })));
    }
    async supportedUnits(blockTag) {
        return Object.freeze(Array.from(await this.contract.supportedUnits({ blockTag })));
    }
    async preferredUnit(blockTag) {
        return (await this.contract.preferredUnit({ blockTag })).trim();
    }
    async discover(blockTag) {
        if (!(await this.supportsUnit("units", blockTag)))
            return null;
        const discovery = new CustomUnitDiscovery(await this.supportedUnits(blockTag), await this.preferredUnit(blockTag));
        return discovery.isValid ? discovery : null;
    }
    canonicalBalance(account, blockTag) {
        return this.contract.balanceOf(account, { blockTag });
    }
    balanceOfUnit(account, unit, blockTag) {
        if (!unit.trim())
            throw new TypeError("unit must not be empty");
        return this.contract.balanceOfUnit(account, unit.trim(), { blockTag });
    }
    async balance(account, unit, blockTag) {
        const resolved = unit?.trim() || (await this.preferredUnit(blockTag));
        const [canonical, calculated] = await Promise.all([
            this.canonicalBalance(account, blockTag),
            this.balanceOfUnit(account, resolved, blockTag),
        ]);
        return new CustomUnitBalance(canonical, calculated, resolved);
    }
}

exports.CustomUnitBalance = CustomUnitBalance;
exports.CustomUnitDiscovery = CustomUnitDiscovery;
exports.CustomUnitToken = CustomUnitToken;
exports.customUnitAbi = customUnitAbi;
//# sourceMappingURL=custom-units.js.map
