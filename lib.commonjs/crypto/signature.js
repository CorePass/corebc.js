"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Signature = void 0;
const index_js_1 = require("../utils/index.js");
// Constants
const BN_0 = BigInt(0);
const BN_1 = BigInt(1);
const BN_2 = BigInt(2);
const BN_27 = BigInt(27);
const BN_28 = BigInt(28);
const BN_35 = BigInt(35);
const _guard = {};
/**
 *  A Signature  @TODO
 *
 *
 *  @_docloc: api/crypto:Signing
 */
class Signature {
    #r;
    #s;
    #v;
    #networkV;
    /**
     *  The ``r`` value for a signautre.
     *
     *  This represents the ``x`` coordinate of a "reference" or
     *  challenge point, from which the ``y`` can be computed.
     */
    get r() { return this.#r; }
    set r(value) {
        (0, index_js_1.assertArgument)((0, index_js_1.dataLength)(value) === 32, "invalid r", "value", value);
        this.#r = (0, index_js_1.hexlify)(value);
    }
    /**
     *  The ``s`` value for a signature.
     */
    get s() { return this.#s; }
    set s(_value) {
        (0, index_js_1.assertArgument)((0, index_js_1.dataLength)(_value) === 32, "invalid s", "value", _value);
        const value = (0, index_js_1.hexlify)(_value);
        (0, index_js_1.assertArgument)(parseInt(value.substring(0, 3)) < 8, "non-canonical s", "value", value);
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
    get v() { return this.#v; }
    set v(value) {
        const v = (0, index_js_1.getNumber)(value, "value");
        (0, index_js_1.assertArgument)(v === 27 || v === 28, "invalid v", "v", value);
        this.#v = v;
    }
    /**
     *  The EIP-155 ``v`` for legacy transactions. For non-legacy
     *  transactions, this value is ``null``.
     */
    get networkV() { return this.#networkV; }
    /**
     *  The chain ID for EIP-155 legacy transactions. For non-legacy
     *  transactions, this value is ``null``.
     */
    get legacynetworkId() {
        const v = this.networkV;
        if (v == null) {
            return null;
        }
        return Signature.getnetworkId(v);
    }
    /**
     *  The ``yParity`` for the signature.
     *
     *  See ``v`` for more details on how this value is used.
     */
    get yParity() {
        return (this.v === 27) ? 0 : 1;
    }
    /**
     *  The [[link-eip-2098]] compact representation of the ``yParity``
     *  and ``s`` compacted into a single ``bytes32``.
     */
    get yParityAndS() {
        // The EIP-2098 compact representation
        const yParityAndS = (0, index_js_1.getBytes)(this.s);
        if (this.yParity) {
            yParityAndS[0] |= 0x80;
        }
        return (0, index_js_1.hexlify)(yParityAndS);
    }
    /**
     *  The [[link-eip-2098]] compact representation.
     */
    get compactSerialized() {
        return (0, index_js_1.concat)([this.r, this.yParityAndS]);
    }
    /**
     *  The serialized representation.
     */
    get serialized() {
        return (0, index_js_1.concat)([this.r, this.s, (this.yParity ? "0x1c" : "0x1b")]);
    }
    /**
     *  @private
     */
    constructor(guard, r, s, v) {
        (0, index_js_1.assertPrivate)(guard, _guard, "Signature");
        this.#r = r;
        this.#s = s;
        this.#v = v;
        this.#networkV = null;
    }
    [Symbol.for('nodejs.util.inspect.custom')]() {
        return `Signature { r: "${this.r}", s: "${this.s}", yParity: ${this.yParity}, networkV: ${this.networkV} }`;
    }
    /**
     *  Returns a new identical [[Signature]].
     */
    clone() {
        const clone = new Signature(_guard, this.r, this.s, this.v);
        if (this.networkV) {
            clone.#networkV = this.networkV;
        }
        return clone;
    }
    /**
     *  Returns a representation that is compatible with ``JSON.stringify``.
     */
    toJSON() {
        const networkV = this.networkV;
        return {
            _type: "signature",
            networkV: ((networkV != null) ? networkV.toString() : null),
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
    static getnetworkId(v) {
        const bv = (0, index_js_1.getBigInt)(v, "v");
        // The v is not an EIP-155 v, so it is the unspecified chain ID
        if ((bv == BN_27) || (bv == BN_28)) {
            return BN_0;
        }
        // Bad value for an EIP-155 v
        (0, index_js_1.assertArgument)(bv >= BN_35, "invalid EIP-155 v", "v", v);
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
    static getnetworkIdV(networkId, v) {
        return ((0, index_js_1.getBigInt)(networkId) * BN_2) + BigInt(35 + v - 27);
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
    static getNormalizedV(v) {
        const bv = (0, index_js_1.getBigInt)(v);
        if (bv === BN_0 || bv === BN_27) {
            return 27;
        }
        if (bv === BN_1 || bv === BN_28) {
            return 28;
        }
        (0, index_js_1.assertArgument)(bv >= BN_35, "invalid v", "v", v);
        // Otherwise, EIP-155 v means odd is 27 and even is 28
        return (bv & BN_1) ? 27 : 28;
    }
}
exports.Signature = Signature;
//# sourceMappingURL=signature.js.map