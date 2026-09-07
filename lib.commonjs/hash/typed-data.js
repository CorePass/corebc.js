'use strict';

var index = require('../address/index.js');
require('../utils/base58.js');
var data = require('../utils/data.js');
var errors = require('../utils/errors.js');
var properties = require('../utils/properties.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
var maths = require('../utils/maths.js');
var address = require('../transaction/address.js');
require('../transaction/transaction.js');
var id = require('./id.js');
require('../crypto/hmac.js');
require('../crypto/ripemd160.js');
require('../crypto/pbkdf2.js');
require('../crypto/random.js');
require('../crypto/scrypt.js');
var sha3 = require('../crypto/sha3.js');
require('bcrypto/lib/ed448.js');
require('buffer');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
require('crypto');
require('../crypto/keccak.js');
require('../logger/logger.js');
require('../crypto/signature.js');

const padding = new Uint8Array(32);
padding.fill(0);
const BN__1 = BigInt(-1);
const BN_0 = BigInt(0);
const BN_1 = BigInt(1);
const BN_MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
function hexPadRight(value) {
    const bytes = data.getBytes(value);
    const padOffset = bytes.length % 32;
    if (padOffset) {
        return data.concat([bytes, padding.slice(padOffset)]);
    }
    return data.hexlify(bytes);
}
const hexTrue = maths.toBeHex(BN_1, 32);
const hexFalse = maths.toBeHex(BN_0, 32);
const domainFieldTypes = {
    name: "string",
    version: "string",
    networkId: "uint256",
    verifyingContract: "address",
    salt: "bytes32",
};
const domainFieldNames = [
    "name",
    "version",
    "networkId",
    "verifyingContract",
    "salt",
];
function checkString(key) {
    return function (value) {
        errors.assertArgument(typeof value === "string", `invalid domain value for ${JSON.stringify(key)}`, `domain.${key}`, value);
        return value;
    };
}
const domainChecks = {
    name: checkString("name"),
    version: checkString("version"),
    networkId: function (_value) {
        const value = maths.getBigInt(_value, "domain.networkId");
        errors.assertArgument(value >= 0, "invalid chain ID", "domain.networkId", _value);
        if (Number.isSafeInteger(value)) {
            return Number(value);
        }
        return maths.toQuantity(value);
    },
    verifyingContract: function (value) {
        try {
            return index.getAddress(value).toLowerCase();
        }
        catch (error) { }
        errors.assertArgument(false, `invalid domain value "verifyingContract"`, "domain.verifyingContract", value);
    },
    salt: function (value) {
        const bytes = data.getBytes(value, "domain.salt");
        errors.assertArgument(bytes.length === 32, `invalid domain value "salt"`, "domain.salt", value);
        return data.hexlify(bytes);
    },
};
function getBaseEncoder(type) {
    // intXX and uintXX
    {
        const match = type.match(/^(u?)int(\d*)$/);
        if (match) {
            const signed = match[1] === "";
            const width = parseInt(match[2] || "256");
            errors.assertArgument(width % 8 === 0 &&
                width !== 0 &&
                width <= 256 &&
                (match[2] == null || match[2] === String(width)), "invalid numeric width", "type", type);
            const boundsUpper = maths.mask(BN_MAX_UINT256, signed ? width - 1 : width);
            const boundsLower = signed ? (boundsUpper + BN_1) * BN__1 : BN_0;
            return function (_value) {
                const value = maths.getBigInt(_value, "value");
                errors.assertArgument(value >= boundsLower && value <= boundsUpper, `value out-of-bounds for ${type}`, "value", value);
                return maths.toBeHex(signed ? maths.toTwos(value, 256) : value, 32);
            };
        }
    }
    // bytesXX
    {
        const match = type.match(/^bytes(\d+)$/);
        if (match) {
            const width = parseInt(match[1]);
            errors.assertArgument(width !== 0 && width <= 32 && match[1] === String(width), "invalid bytes width", "type", type);
            return function (value) {
                const bytes = data.getBytes(value);
                errors.assertArgument(bytes.length === width, `invalid length for ${type}`, "value", value);
                return hexPadRight(value);
            };
        }
    }
    switch (type) {
        case "address":
            return function (value) {
                return data.zeroPadValue(index.getAddress(value), 32);
            };
        case "bool":
            return function (value) {
                return !value ? hexFalse : hexTrue;
            };
        case "bytes":
            return function (value) {
                return sha3.sha256(value);
            };
        case "string":
            return function (value) {
                return id.id(value);
            };
    }
    return null;
}
function encodeType(name, fields) {
    return `${name}(${fields
        .map(({ name, type }) => type + " " + name)
        .join(",")})`;
}
class TypedDataEncoder {
    primaryType;
    #types;
    get types() {
        return JSON.parse(this.#types);
    }
    #fullTypes;
    #encoderCache;
    constructor(types) {
        this.#types = JSON.stringify(types);
        this.#fullTypes = new Map();
        this.#encoderCache = new Map();
        // Link struct types to their direct child structs
        const links = new Map();
        // Link structs to structs which contain them as a child
        const parents = new Map();
        // Link all subtypes within a given struct
        const subtypes = new Map();
        Object.keys(types).forEach((type) => {
            links.set(type, new Set());
            parents.set(type, []);
            subtypes.set(type, new Set());
        });
        for (const name in types) {
            const uniqueNames = new Set();
            for (const field of types[name]) {
                // Check each field has a unique name
                errors.assertArgument(!uniqueNames.has(field.name), `duplicate variable name ${JSON.stringify(field.name)} in ${JSON.stringify(name)}`, "types", types);
                uniqueNames.add(field.name);
                // Get the base type (drop any array specifiers)
                const baseType = field.type.match(/^([^\x5b]*)(\x5b|$)/)[1] || null;
                errors.assertArgument(baseType !== name, `circular type reference to ${JSON.stringify(baseType)}`, "types", types);
                // Is this a base encoding type?
                const encoder = getBaseEncoder(baseType);
                if (encoder) {
                    continue;
                }
                errors.assertArgument(parents.has(baseType), `unknown type ${JSON.stringify(baseType)}`, "types", types);
                // Add linkage
                parents.get(baseType).push(name);
                links.get(name).add(baseType);
            }
        }
        // Deduce the primary type
        const primaryTypes = Array.from(parents.keys()).filter((n) => parents.get(n).length === 0);
        errors.assertArgument(primaryTypes.length !== 0, "missing primary type", "types", types);
        errors.assertArgument(primaryTypes.length === 1, `ambiguous primary types or unused types: ${primaryTypes
            .map((t) => JSON.stringify(t))
            .join(", ")}`, "types", types);
        properties.defineProperties(this, { primaryType: primaryTypes[0] });
        // Check for circular type references
        function checkCircular(type, found) {
            errors.assertArgument(!found.has(type), `circular type reference to ${JSON.stringify(type)}`, "types", types);
            found.add(type);
            for (const child of links.get(type)) {
                if (!parents.has(child)) {
                    continue;
                }
                // Recursively check children
                checkCircular(child, found);
                // Mark all ancestors as having this decendant
                for (const subtype of found) {
                    subtypes.get(subtype).add(child);
                }
            }
            found.delete(type);
        }
        checkCircular(this.primaryType, new Set());
        // Compute each fully describe type
        for (const [name, set] of subtypes) {
            const st = Array.from(set);
            st.sort();
            this.#fullTypes.set(name, encodeType(name, types[name]) +
                st.map((t) => encodeType(t, types[t])).join(""));
        }
    }
    getEncoder(type) {
        let encoder = this.#encoderCache.get(type);
        if (!encoder) {
            encoder = this.#getEncoder(type);
            this.#encoderCache.set(type, encoder);
        }
        return encoder;
    }
    #getEncoder(type) {
        // Basic encoder type (address, bool, uint256, etc)
        {
            const encoder = getBaseEncoder(type);
            if (encoder) {
                return encoder;
            }
        }
        // Array
        const match = type.match(/^(.*)(\x5b(\d*)\x5d)$/);
        if (match) {
            const subtype = match[1];
            const subEncoder = this.getEncoder(subtype);
            return (value) => {
                errors.assertArgument(!match[3] || parseInt(match[3]) === value.length, `array length mismatch; expected length ${parseInt(match[3])}`, "value", value);
                let result = value.map(subEncoder);
                if (this.#fullTypes.has(subtype)) {
                    result = result.map(sha3.sha256);
                }
                return sha3.sha256(data.concat(result));
            };
        }
        // Struct
        const fields = this.types[type];
        if (fields) {
            const encodedType = id.id(this.#fullTypes.get(type));
            return (value) => {
                const values = fields.map(({ name, type }) => {
                    const result = this.getEncoder(type)(value[name]);
                    if (this.#fullTypes.has(type)) {
                        return sha3.sha256(result);
                    }
                    return result;
                });
                values.unshift(encodedType);
                return data.concat(values);
            };
        }
        errors.assertArgument(false, `unknown type: ${type}`, "type", type);
    }
    encodeType(name) {
        const result = this.#fullTypes.get(name);
        errors.assertArgument(result, `unknown type: ${JSON.stringify(name)}`, "name", name);
        return result;
    }
    encodeData(type, value) {
        return this.getEncoder(type)(value);
    }
    hashStruct(name, value) {
        return sha3.sha256(this.encodeData(name, value));
    }
    encode(value) {
        return this.encodeData(this.primaryType, value);
    }
    hash(value) {
        return this.hashStruct(this.primaryType, value);
    }
    _visit(type, value, callback) {
        // Basic encoder type (address, bool, uint256, etc)
        {
            const encoder = getBaseEncoder(type);
            if (encoder) {
                return callback(type, value);
            }
        }
        // Array
        const match = type.match(/^(.*)(\x5b(\d*)\x5d)$/);
        if (match) {
            errors.assertArgument(!match[3] || parseInt(match[3]) === value.length, `array length mismatch; expected length ${parseInt(match[3])}`, "value", value);
            return value.map((v) => this._visit(match[1], v, callback));
        }
        // Struct
        const fields = this.types[type];
        if (fields) {
            return fields.reduce((accum, { name, type }) => {
                accum[name] = this._visit(type, value[name], callback);
                return accum;
            }, {});
        }
        errors.assertArgument(false, `unknown type: ${type}`, "type", type);
    }
    visit(value, callback) {
        return this._visit(this.primaryType, value, callback);
    }
    static from(types) {
        return new TypedDataEncoder(types);
    }
    static getPrimaryType(types) {
        return TypedDataEncoder.from(types).primaryType;
    }
    static hashStruct(name, types, value) {
        return TypedDataEncoder.from(types).hashStruct(name, value);
    }
    static hashDomain(domain) {
        const domainFields = [];
        for (const name in domain) {
            if (domain[name] == null) {
                continue;
            }
            const type = domainFieldTypes[name];
            errors.assertArgument(type, `invalid typed-data domain key: ${JSON.stringify(name)}`, "domain", domain);
            domainFields.push({ name, type });
        }
        domainFields.sort((a, b) => {
            return (domainFieldNames.indexOf(a.name) - domainFieldNames.indexOf(b.name));
        });
        return TypedDataEncoder.hashStruct("EIP712Domain", { EIP712Domain: domainFields }, domain);
    }
    static encode(domain, types, value) {
        return data.concat([
            "0x1901",
            TypedDataEncoder.hashDomain(domain),
            TypedDataEncoder.from(types).hash(value),
        ]);
    }
    static hash(domain, types, value) {
        return sha3.sha256(TypedDataEncoder.encode(domain, types, value));
    }
    // Replaces all address types with ENS names with their looked up address
    static async resolveNames(domain, types, value, resolveName) {
        // Make a copy to isolate it from the object passed in
        domain = Object.assign({}, domain);
        // Allow passing null to ignore value
        for (const key in domain) {
            if (domain[key] == null) {
                delete domain[key];
            }
        }
        // Look up all ENS names
        const ensCache = {};
        // Do we need to look up the domain's verifyingContract?
        if (domain.verifyingContract &&
            !data.isHexString(domain.verifyingContract, 20)) {
            ensCache[domain.verifyingContract] = "0x";
        }
        // We are going to use the encoder to visit all the base values
        const encoder = TypedDataEncoder.from(types);
        // Get a list of all the addresses
        encoder.visit(value, (type, value) => {
            if (type === "address" && !data.isHexString(value, 20)) {
                ensCache[value] = "0x";
            }
            return value;
        });
        // Lookup each name
        for (const name in ensCache) {
            ensCache[name] = await resolveName(name);
        }
        // Replace the domain verifyingContract if needed
        if (domain.verifyingContract && ensCache[domain.verifyingContract]) {
            domain.verifyingContract = ensCache[domain.verifyingContract];
        }
        // Replace all ENS names with their address
        value = encoder.visit(value, (type, value) => {
            if (type === "address" && ensCache[value]) {
                return ensCache[value];
            }
            return value;
        });
        return { domain, value };
    }
    static getPayload(domain, types, value) {
        // Validate the domain fields
        TypedDataEncoder.hashDomain(domain);
        // Derive the EIP712Domain Struct reference type
        const domainValues = {};
        const domainTypes = [];
        domainFieldNames.forEach((name) => {
            const value = domain[name];
            if (value == null) {
                return;
            }
            domainValues[name] = domainChecks[name](value);
            domainTypes.push({ name, type: domainFieldTypes[name] });
        });
        const encoder = TypedDataEncoder.from(types);
        const typesWithDomain = Object.assign({}, types);
        errors.assertArgument(typesWithDomain.EIP712Domain == null, "types must not contain EIP712Domain type", "types.EIP712Domain", types);
        typesWithDomain.EIP712Domain = domainTypes;
        // Validate the data structures and types
        encoder.encode(value);
        return {
            types: typesWithDomain,
            domain: domainValues,
            primaryType: encoder.primaryType,
            message: encoder.visit(value, (type, value) => {
                // bytes
                if (type.match(/^bytes(\d*)/)) {
                    return data.hexlify(data.getBytes(value));
                }
                // uint or int
                if (type.match(/^u?int/)) {
                    return maths.getBigInt(value).toString();
                }
                switch (type) {
                    case "address":
                        return value.toLowerCase();
                    case "bool":
                        return !!value;
                    case "string":
                        errors.assertArgument(typeof value === "string", "invalid string", "value", value);
                        return value;
                }
                errors.assertArgument(false, "unsupported type", "type", type);
            }),
        };
    }
}
/**
 *  Compute the address used to sign the typed data for the %%signature%%.
 */
function verifyTypedData(domain, types, value, signature, prefix) {
    return address.recoverAddress(TypedDataEncoder.hash(domain, types, value), signature, prefix);
}

exports.TypedDataEncoder = TypedDataEncoder;
exports.verifyTypedData = verifyTypedData;
//# sourceMappingURL=typed-data.js.map
