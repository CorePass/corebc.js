'use strict';

var pkg = require('aes-js');
var index = require('../address/index.js');
require('../crypto/hmac.js');
require('../crypto/ripemd160.js');
var pbkdf2 = require('../crypto/pbkdf2.js');
require('../crypto/random.js');
require('../crypto/scrypt.js');
require('../crypto/sha3.js');
require('bcrypto/lib/ed448.js');
require('buffer');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
require('crypto');
require('../crypto/keccak.js');
require('../utils/base58.js');
var data = require('../utils/data.js');
var errors = require('../utils/errors.js');
require('../logger/logger.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
require('../crypto/signature.js');
var id = require('../hash/id.js');
require('../constants/numbers.js');
require('../transaction/transaction.js');
require('../hash/typed-data.js');
var utils = require('./utils.js');

/**
 *  @_subsection: api/wallet:JSON Wallets  [json-wallets]
 */
// @ts-ignore
const { ModeOfOperation: { cbc: CBC }, padding: { pkcs7: { strip: pkcs7Strip }, }, } = pkg;
/**
 *  Returns true if %%json%% is a valid JSON Crowdsale wallet.
 */
function isCrowdsaleJson(json) {
    try {
        const data = JSON.parse(json);
        if (data.encseed) {
            return true;
        }
    }
    catch (error) { }
    return false;
}
/**
 *  Before Core launched, it was necessary to create a wallet
 *  format for backers to use, which would be used to receive xcb
 *  as a reward for contributing to the project.
 *
 *  The [[link-crowdsale]] format is now obsolete, but it is still
 *  useful to support and the additional code is fairly trivial as
 *  all the primitives required are used through core portions of
 *  the library.
 */
function decryptCrowdsaleJson(json, _password) {
    const data$1 = JSON.parse(json);
    const password = utils.getPassword(_password);
    // Core Address
    const address = index.getAddress(utils.spelunk(data$1, "ethaddr:string!"));
    // Encrypted Seed
    const encseed = utils.looseArrayify(utils.spelunk(data$1, "encseed:string!"));
    errors.assertArgument(encseed && encseed.length % 16 === 0, "invalid encseed", "json", json);
    const key = data.getBytes(pbkdf2.pbkdf2(password, password, 2000, 32, "sha256")).slice(0, 16);
    const iv = encseed.slice(0, 16);
    const encryptedSeed = encseed.slice(16);
    // Decrypt the seed
    const aesCbc = new CBC(key, iv);
    const seed = pkcs7Strip(data.getBytes(aesCbc.decrypt(encryptedSeed)));
    // This wallet format is weird... Convert the binary encoded hex to a string.
    let seedHex = "";
    for (let i = 0; i < seed.length; i++) {
        seedHex += String.fromCharCode(seed[i]);
    }
    return { address, privateKey: id.id(seedHex) };
}

exports.decryptCrowdsaleJson = decryptCrowdsaleJson;
exports.isCrowdsaleJson = isCrowdsaleJson;
//# sourceMappingURL=json-crowdsale.js.map
