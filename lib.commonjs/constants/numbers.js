'use strict';

/**
 *  A constant for the order N for the secp256k1 curve.
 *
 *  (**i.e.** ``0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n``)
 */
const N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
/**
 *  A constant for the number of ore in a single xcb.
 *
 *  (**i.e.** ``1000000000000000000n``)
 */
const OrePerXCB = BigInt("1000000000000000000");
/**
 *  A constant for the maximum value for a ``uint256``.
 *
 *  (**i.e.** ``0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn``)
 */
const MaxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
/**
 *  A constant for the minimum value for an ``int256``.
 *
 *  (**i.e.** ``-8000000000000000000000000000000000000000000000000000000000000000n``)
 */
const MinInt256 = BigInt("0x8000000000000000000000000000000000000000000000000000000000000000") *
    BigInt(-1);
/**
 *  A constant for the maximum value for an ``int256``.
 *
 *  (**i.e.** ``0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn``)
 */
const MaxInt256 = BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
const NegativeOne = /*#__PURE__*/ BigInt(-1);
const Zero = /*#__PURE__*/ BigInt(0);
const One = /*#__PURE__*/ BigInt(1);
const Two = /*#__PURE__*/ BigInt(2);

exports.MaxInt256 = MaxInt256;
exports.MaxUint256 = MaxUint256;
exports.MinInt256 = MinInt256;
exports.N = N;
exports.NegativeOne = NegativeOne;
exports.One = One;
exports.OrePerXCB = OrePerXCB;
exports.Two = Two;
exports.Zero = Zero;
//# sourceMappingURL=numbers.js.map
