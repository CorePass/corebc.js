import type { BigNumberish, BytesLike } from "../utils/index.js";
/**
 *  Returns the address that would result from a ``CREATE`` for %%tx%%.
 *
 *  This can be used to compute the address a contract will be
 *  deployed to by an EOA when sending a deployment transaction (i.e.
 *  when the ``to`` address is ``null``).
 *
 *  This can also be used to compute the address a contract will be
 *  deployed to by a contract, by using the contract's address as the
 *  ``to`` and the contract's nonce.
 *
 *  @example
 *    from = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";
 *    nonce = 5;
 *
 *    getCreateAddress({ from, nonce });
 *    //_result:
 */
export declare function getCreateAddress(tx: {
    from: string;
    nonce: BigNumberish;
}): string;
/**
 *  Returns the address that would result from a ``CREATE2`` operation
 *  with the given %%from%%, %%salt%% and %%initCodeHash%%.

 *  For a quick overview and example of ``CREATE2``, see [[link-ricmoo-wisps]].
 *
 *  @example
 *    // The address of the contract
 *    from = "0x8ba1f109551bD432803012645Ac136ddd64DBA72"
 *
 *    // The salt
 *    salt = id("HelloWorld")
 *
 *    getCreate2Address(from, salt, initCodeHash)
 *    //_result:
 */
export declare function getCreate2Address(from: string, salt: BytesLike, initCodeHash: BytesLike): string;
//# sourceMappingURL=contract-address.d.ts.map