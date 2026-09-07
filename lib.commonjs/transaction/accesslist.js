'use strict';

var index = require('../address/index.js');
require('../utils/base58.js');
var data = require('../utils/data.js');
var errors = require('../utils/errors.js');
require('../logger/logger.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');

function accessSetify(addr, storageKeys) {
    return {
        address: index.getAddress(addr),
        storageKeys: storageKeys.map((storageKey, index) => {
            errors.assertArgument(data.isHexString(storageKey, 32), "invalid slot", `storageKeys[${index}]`, storageKey);
            return storageKey.toLowerCase();
        }),
    };
}
/**
 *  Returns a [[AccessList]] from any corebcsupported access-list structure.
 */
function accessListify(value) {
    if (Array.isArray(value)) {
        return value.map((set, index) => {
            if (Array.isArray(set)) {
                errors.assertArgument(set.length === 2, "invalid slot set", `value[${index}]`, set);
                return accessSetify(set[0], set[1]);
            }
            errors.assertArgument(set != null && typeof set === "object", "invalid address-slot set", "value", value);
            return accessSetify(set.address, set.storageKeys);
        });
    }
    errors.assertArgument(value != null && typeof value === "object", "invalid access list", "value", value);
    const result = Object.keys(value).map((addr) => {
        const storageKeys = value[addr].reduce((accum, storageKey) => {
            accum[storageKey] = true;
            return accum;
        }, {});
        return accessSetify(addr, Object.keys(storageKeys).sort());
    });
    result.sort((a, b) => a.address.localeCompare(b.address));
    return result;
}

exports.accessListify = accessListify;
//# sourceMappingURL=accesslist.js.map
