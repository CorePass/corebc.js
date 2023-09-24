/**
 *  Addresses are a fundamental part of interacting with Core. They
 *  represent the gloabal identity of Externally Owned Accounts (accounts
 *  backed by a private key) and contracts.
 *
 *  The Core Naming Service (CNS) provides an interconnected ecosystem
 *  of contracts, standards and libraries which enable looking up an
 *  address for an ENS name.
 *
 *  These functions help convert between various formats, validate
 *  addresses and safely resolve ENS names.
 *
 *  @_section: api/address:Addresses  [about-addresses]
 */
null;
import { BigNumber } from "../bigNumber/bigNumber.js";
import { encode } from "../crypto/rlp.js";
import { sha256 } from "../crypto/sha3.js";
import { Logger } from "../logger/logger.js";
import { arrayify, getBytes, hexDataSlice, hexlify, stripZeros, } from "../utils/data.js";
const logger = new Logger("address/0.0.1");
const precompiledAddresses = [
    "0000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000001",
    "0000000000000000000000000000000000000000000000000000000000000002",
    "0000000000000000000000000000000000000000000000000000000000000003",
    "0000000000000000000000000000000000000000000000000000000000000004",
    "0000000000000000000000000000000000000000000000000000000000000005",
    "0000000000000000000000000000000000000000000000000000000000000006",
    "0000000000000000000000000000000000000000000000000000000000000007",
    "0000000000000000000000000000000000000000000000000000000000000008",
    "0000000000000000000000000000000000000000000000000000000000000009",
];
function removeHexPrefix(val) {
    return val.substring(0, 2) === "0x" ? val.substring(2) : val;
}
function calculateCheckSum(_address, _prefix) {
    const address = getBytes("0x" + _address.replace("0x", ""));
    const prefix = getBytes("0x" + _prefix.replace("0x", ""));
    const tmpConcated = new Uint8Array([...address, ...prefix]);
    const hexedConcat = hexlify(tmpConcated).replace("0x", "") + "00";
    const mods = Array.from(hexedConcat.toUpperCase(), (c) => {
        const charCode = c.charCodeAt(0);
        return charCode > 64 && charCode < 91
            ? (charCode - 55).toString()
            : (charCode - 48).toString();
    }).join("");
    const bigVal = BigInt(mods);
    const val97 = BigInt(97);
    const val98 = BigInt(98);
    const remainder = bigVal % val97;
    const checkSum = val98 - remainder;
    const result = checkSum > 9 ? checkSum.toString() : "0" + checkSum.toString();
    return result;
}
// See: https://en.wikipedia.org/wiki/International_Bank_Account_Number
// Create lookup table
const ibanLookup = {};
for (let i = 0; i < 10; i++) {
    ibanLookup[String(i)] = String(i);
}
for (let i = 0; i < 26; i++) {
    ibanLookup[String.fromCharCode(65 + i)] = String(10 + i);
}
// How many decimal digits can we process? (for 64-bit float, this is 15)
// i.e. Math.floor(Math.log10(Number.MAX_SAFE_INTEGER));
const safeDigits = 15;
function ibanChecksum(address) {
    address = address.toUpperCase();
    address = address.substring(4) + address.substring(0, 2) + "00";
    let expanded = address
        .split("")
        .map((c) => {
        return ibanLookup[c];
    })
        .join("");
    // Javascript can handle integers safely up to 15 (decimal) digits
    while (expanded.length >= safeDigits) {
        let block = expanded.substring(0, safeDigits);
        expanded = (parseInt(block, 10) % 97) + expanded.substring(block.length);
    }
    let checksum = String(98 - (parseInt(expanded, 10) % 97));
    while (checksum.length < 2) {
        checksum = "0" + checksum;
    }
    return checksum;
}
/**
 *  Returns a normalized and checksumed address for %%address%%.
 *  This accepts non-checksum addresses, checksum addresses and
 *  [[getIcapAddress]] formats.
 *
 *  The checksum in Core uses the capitalization (upper-case
 *  vs lower-case) of the characters within an address to encode
 *  its checksum, which offers, on average, a checksum of 15-bits.
 *
 *  If %%address%% contains both upper-case and lower-case, it is
 *  assumed to already be a checksum address and its checksum is
 *  validated, and if the address fails its expected checksum an
 *  error is thrown.
 *
 *  If you wish the checksum of %%address%% to be ignore, it should
 *  be converted to lower-case (i.e. ``.toLowercase()``) before
 *  being passed in. This should be a very rare situation though,
 *  that you wish to bypass the safegaurds in place to protect
 *  against an address that has been incorrectly copied from another
 *  source.
 *
 *  @example:
 *    // Adds the checksum (via upper-casing specific letters)
 *    getAddress("0x8ba1f109551bd432803012645ac136ddd64dba72")
 *    //_result:
 *
 *    // Converts ICAP address and adds checksum
 *    getAddress("XE65GB6LDNXYOFTX0NSV3FUWKOWIXAMJK36");
 *    //_result:
 *
 *    // Throws an error if an address contains mixed case,
 *    // but the checksum fails
 *    getAddress("0x8Ba1f109551bD432803012645Ac136ddd64DBA72")
 *    //_error:
 */
function getAddress(address) {
    if (typeof address !== "string") {
        logger.throwArgumentError("invalid address", "address", address);
    }
    if (!address.match(/^(0x)?[0-9a-fA-F]{44}$/)) {
        logger.throwArgumentError("invalid address", "address", address);
    }
    const raw = removeHexPrefix(address);
    if (precompiledAddresses.includes(raw)) {
        return "0x" + raw;
    }
    const prefix = raw.substring(0, 2);
    const val = raw.substring(4);
    const checksum = calculateCheckSum(val, prefix);
    if (checksum !== raw.substring(2, 4)) {
        logger.throwArgumentError("bad address checksum", "address", address);
    }
    return "0x" + prefix + checksum + val;
}
/**
 *  The [ICAP Address format](link-icap) format is an early checksum
 *  format which attempts to be compatible with the banking
 *  industry [IBAN format](link-wiki-iban) for bank accounts.
 *
 *  It is no longer common or a recommended format.
 *
 *  @example:
 *    getIcapAddress("0x8ba1f109551bd432803012645ac136ddd64dba72");
 *    //_result:
 *
 *    getIcapAddress("XE65GB6LDNXYOFTX0NSV3FUWKOWIXAMJK36");
 *    //_result:
 *
 *    // Throws an error if the ICAP checksum is wrong
 *    getIcapAddress("XE65GB6LDNXYOFTX0NSV3FUWKOWIXAMJK37");
 *    //_error:
 */
function getIcapAddress(address) {
    //let base36 = _base16To36(getAddress(address).substring(2)).toUpperCase();
    let base36 = BigInt(getAddress(address)).toString(36).toUpperCase();
    while (base36.length < 30) {
        base36 = "0" + base36;
    }
    return "XE" + ibanChecksum("XE00" + base36) + base36;
}
function networkIdToPrefix(networkId) {
    if (networkId == 1) {
        return "cb";
    }
    else if (networkId == 3 || networkId == 4) {
        return "ab";
    }
    else if (networkId > 10 || networkId == 0) {
        return "ce";
    }
    else {
        logger.throwArgumentError("bad networkId", "networkId", networkId);
        return "";
    }
}
function getContractAddress(transaction) {
    let from = null;
    try {
        from = getAddress(transaction.from);
    }
    catch (error) {
        logger.throwArgumentError("missing from address", "transaction", transaction);
    }
    const nonce = stripZeros(arrayify(BigNumber.from(transaction.nonce).toHexString()));
    const val = hexDataSlice(sha256(encode([from, nonce])), 12);
    const prefix = from.substring(2, 4);
    const checksum = calculateCheckSum(val, prefix);
    return "0x" + prefix + checksum + removeHexPrefix(val);
}
export { getAddress, getIcapAddress, calculateCheckSum, networkIdToPrefix, getContractAddress, };
//# sourceMappingURL=index.js.map