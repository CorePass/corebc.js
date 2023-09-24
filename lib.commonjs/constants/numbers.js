"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Two = exports.One = exports.Zero = exports.NegativeOne = exports.MaxInt256 = exports.MinInt256 = exports.MaxUint256 = exports.OrePerXCB = exports.N = void 0;
/**
 *  A constant for the order N for the secp256k1 curve.
 *
 *  (**i.e.** ``0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n``)
 */
exports.N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
/**
 *  A constant for the number of ore in a single xcb.
 *
 *  (**i.e.** ``1000000000000000000n``)
 */
exports.OrePerXCB = BigInt("1000000000000000000");
/**
 *  A constant for the maximum value for a ``uint256``.
 *
 *  (**i.e.** ``0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn``)
 */
exports.MaxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
/**
 *  A constant for the minimum value for an ``int256``.
 *
 *  (**i.e.** ``-8000000000000000000000000000000000000000000000000000000000000000n``)
 */
exports.MinInt256 = BigInt("0x8000000000000000000000000000000000000000000000000000000000000000") *
    BigInt(-1);
/**
 *  A constant for the maximum value for an ``int256``.
 *
 *  (**i.e.** ``0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn``)
 */
exports.MaxInt256 = BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
exports.NegativeOne = BigInt(-1);
exports.Zero = BigInt(0);
exports.One = BigInt(1);
exports.Two = BigInt(2);
//# sourceMappingURL=numbers.js.map