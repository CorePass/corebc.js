
import {
    concat, dataLength, getBigInt, getBytes, getNumber, hexlify,
    assertArgument, assertPrivate
} from "../utils/index.js";

import type {
    BigNumberish, BytesLike
} from "../utils/index.js";


// Constants
const BN_0 = BigInt(0);
const BN_1 = BigInt(1);
const BN_2 = BigInt(2);
const BN_27 = BigInt(27);
const BN_28 = BigInt(28);
const BN_35 = BigInt(35);


const _guard = { };

// @TODO: Allow Uint8Array

/**
 *  A SignatureLike
 *
 *  @_docloc: api/crypto:Signing
 */
export type SignatureLike =  string 


/**
 *  A Signature  @TODO
 *
 *
 *  @_docloc: api/crypto:Signing
 */
export class Signature {
    #r: string;
    #s: string;
    #v: 27 | 28;
    #networkV: null | bigint;

    /**
     *  The ``r`` value for a signautre.
     *
     *  This represents the ``x`` coordinate of a "reference" or
     *  challenge point, from which the ``y`` can be computed.
     */
    get r(): string { return this.#r; }
    set r(value: BytesLike) {
        assertArgument(dataLength(value) === 32, "invalid r", "value", value);
        this.#r = hexlify(value);
    }

    /**
     *  The ``s`` value for a signature.
     */
    get s(): string { return this.#s; }
    set s(_value: BytesLike) {
        assertArgument(dataLength(_value) === 32, "invalid s", "value", _value);
        const value = hexlify(_value);
        assertArgument(parseInt(value.substring(0, 3)) < 8, "non-canonical s", "value", value);
        this.#s = value;
    }

    /**
     *  The ``v`` value for a signature.
     *
     *  Since a given ``x`` value for ``r`` has two possible values for
     *  its correspondin ``y``, the ``v`` indicates which of the two ``y``
     *  values to use.
     *
     *  It is normalized to the values ``27`` or ``28`` for legacy
     *  purposes.
     */
    get v(): 27 | 28 { return this.#v; }
    set v(value: BigNumberish) {
        const v = getNumber(value, "value");
        assertArgument(v === 27 || v === 28, "invalid v", "v", value);
        this.#v = v;
    }

    /**
     *  The EIP-155 ``v`` for legacy transactions. For non-legacy
     *  transactions, this value is ``null``.
     */
    get networkV(): null | bigint { return this.#networkV; }

    /**
     *  The chain ID for EIP-155 legacy transactions. For non-legacy
     *  transactions, this value is ``null``.
     */
    get legacynetworkId(): null | bigint {
        const v = this.networkV;
        if (v == null) { return null; }
        return Signature.getnetworkId(v);
    }

    /**
     *  The ``yParity`` for the signature.
     *
     *  See ``v`` for more details on how this value is used.
     */
    get yParity(): 0 | 1 {
        return (this.v === 27) ? 0: 1;
    }

    /**
     *  The [[link-eip-2098]] compact representation of the ``yParity``
     *  and ``s`` compacted into a single ``bytes32``.
     */
    get yParityAndS(): string {
        // The EIP-2098 compact representation
        const yParityAndS = getBytes(this.s);
        if (this.yParity) { yParityAndS[0] |= 0x80; }
        return hexlify(yParityAndS);
    }

    /**
     *  The [[link-eip-2098]] compact representation.
     */
    get compactSerialized(): string {
        return concat([ this.r, this.yParityAndS ]) as string;
    }

    /**
     *  The serialized representation.
     */
    get serialized(): string {
        return concat([ this.r, this.s, (this.yParity ? "0x1c": "0x1b") ]) as string;
    }

    /**
     *  @private
     */
    constructor(guard: any, r: string, s: string, v: 27 | 28) {
        assertPrivate(guard, _guard, "Signature");
        this.#r = r;
        this.#s = s;
        this.#v = v;
        this.#networkV = null;
    }

    [Symbol.for('nodejs.util.inspect.custom')](): string {
        return `Signature { r: "${ this.r }", s: "${ this.s }", yParity: ${ this.yParity }, networkV: ${ this.networkV } }`;
    }

    /**
     *  Returns a new identical [[Signature]].
     */
    clone(): Signature {
        const clone = new Signature(_guard, this.r, this.s, this.v);
        if (this.networkV) { clone.#networkV = this.networkV; }
        return clone;
    }

    /**
     *  Returns a representation that is compatible with ``JSON.stringify``.
     */
    toJSON(): any {
        const networkV = this.networkV;
        return {
            _type: "signature",
            networkV: ((networkV != null) ? networkV.toString(): null),
            r: this.r, s: this.s, v: this.v,
        };
    }

    /**
     *  Compute the chain ID from the ``v`` in a legacy EIP-155 transactions.
     *
     *  @example:
     *    Signature.getnetworkId(45)
     *    //_result:
     *
     *    Signature.getnetworkId(46)
     *    //_result:
     */
    static getnetworkId(v: BigNumberish): bigint {
        const bv = getBigInt(v, "v");

        // The v is not an EIP-155 v, so it is the unspecified chain ID
        if ((bv == BN_27) || (bv == BN_28)) { return BN_0; }

        // Bad value for an EIP-155 v
        assertArgument(bv >= BN_35, "invalid EIP-155 v", "v", v);

        return (bv - BN_35) / BN_2;
    }

    /**
     *  Compute the ``v`` for a chain ID for a legacy EIP-155 transactions.
     *
     *  Legacy transactions which use [[link-eip-155]] hijack the ``v``
     *  property to include the chain ID.
     *
     *  @example:
     *    Signature.getnetworkIdV(5, 27)
     *    //_result:
     *
     *    Signature.getnetworkIdV(5, 28)
     *    //_result:
     *
     */
    static getnetworkIdV(networkId: BigNumberish, v: 27 | 28): bigint {
        return (getBigInt(networkId) * BN_2) + BigInt(35 + v - 27);
    }

    /**
     *  Compute the normalized legacy transaction ``v`` from a ``yParirty``,
     *  a legacy transaction ``v`` or a legacy [[link-eip-155]] transaction.
     *
     *  @example:
     *    // The values 0 and 1 imply v is actually yParity
     *    Signature.getNormalizedV(0)
     *    //_result:
     *
     *    // Legacy non-EIP-1559 transaction (i.e. 27 or 28)
     *    Signature.getNormalizedV(27)
     *    //_result:
     *
     *    // Legacy EIP-155 transaction (i.e. >= 35)
     *    Signature.getNormalizedV(46)
     *    //_result:
     *
     *    // Invalid values throw
     *    Signature.getNormalizedV(5)
     *    //_error:
     */
    static getNormalizedV(v: BigNumberish): 27 | 28 {
        const bv = getBigInt(v);

        if (bv === BN_0 || bv === BN_27) { return 27; }
        if (bv === BN_1 || bv === BN_28) { return 28; }

        assertArgument(bv >= BN_35, "invalid v", "v", v);

        // Otherwise, EIP-155 v means odd is 27 and even is 28
        return (bv & BN_1) ? 27: 28;
    }

    /**
     *  Creates a new [[Signature]].
     *
     *  If no %%sig%% is provided, a new [[Signature]] is created
     *  with default values.
     *
     *  If %%sig%% is a string, it is parsed.
     */
}

