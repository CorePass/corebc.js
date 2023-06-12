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
/**
 *  An interface for objects which have an address, and can
 *  resolve it asyncronously.
 *
 *  This allows objects such as [[Signer]] or [[Contract]] to
 *  be used most places an address can be, for example getting
 *  the [balance](Provider-getBalance).
 */
export interface Addressable {
    /**
     *  Get the object address.
     */
    getAddress(): Promise<string>;
}
/**
 *  Anything that can be used to return or resolve an address.
 */
export type AddressLike = string | Promise<string> | Addressable;
/**
 *  An interface for any object which can resolve an ENS name.
 */
export interface NameResolver {
}
import { BigNumberish } from "../bigNumber/bigNumber.js";
declare function calculateCheckSum(_address: string, _prefix: string): string;
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
declare function getAddress(address: string): string;
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
declare function getIcapAddress(address: string): string;
declare function networkIdToPrefix(networkId: number): string;
declare function getContractAddress(transaction: {
    from: string;
    nonce: BigNumberish;
}): string;
export { getAddress, getIcapAddress, calculateCheckSum, networkIdToPrefix, getContractAddress };
export { getCreateAddress, getCreate2Address } from "./contract-address.js";
export { isAddressable, isAddress, resolveAddress } from "./checks.js";
//# sourceMappingURL=index.d.ts.map