/**
 *  A constant for the group order N of the Ed448-Goldilocks curve, the curve
 *  Core signs with.
 *
 *  (**i.e.** ``2n ** 446n - 13818066809895115352007386748515426880336692474882178609894547503885n``)
 */
export const N: bigint =
	BigInt(2) ** BigInt(446) -
	BigInt(
		"13818066809895115352007386748515426880336692474882178609894547503885",
	);

/**
 *  A constant for the number of ore in a single xcb.
 *
 *  (**i.e.** ``1000000000000000000n``)
 */
export const OrePerXCB: bigint = BigInt("1000000000000000000");

/**
 *  A constant for the maximum value for a ``uint256``.
 *
 *  (**i.e.** ``0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn``)
 */
export const MaxUint256: bigint = BigInt(
	"0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
);

/**
 *  A constant for the minimum value for an ``int256``.
 *
 *  (**i.e.** ``-8000000000000000000000000000000000000000000000000000000000000000n``)
 */
export const MinInt256: bigint =
	BigInt("0x8000000000000000000000000000000000000000000000000000000000000000") *
	BigInt(-1);

/**
 *  A constant for the maximum value for an ``int256``.
 *
 *  (**i.e.** ``0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn``)
 */
export const MaxInt256: bigint = BigInt(
	"0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
);

export const NegativeOne: bigint = /*#__PURE__*/ BigInt(-1);
export const Zero: bigint = /*#__PURE__*/ BigInt(0);
export const One: bigint = /*#__PURE__*/ BigInt(1);
export const Two: bigint = /*#__PURE__*/ BigInt(2);
