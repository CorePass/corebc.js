/**
 *  A constant for the zero address on the main network.
 *
 *  A Core address carries its network in its prefix and a checksum in the two
 *  characters after it, so unlike Ethereum there is no single all-zero
 *  address: each network has its own. This is the main network's.
 *
 *  (**i.e.** ``"0xcb540000000000000000000000000000000000000000"``)
 */
export const ZeroAddress: string =
	"0xcb540000000000000000000000000000000000000000";

/**
 *  A constant for the zero address on the Devin test network.
 *
 *  (**i.e.** ``"0xab720000000000000000000000000000000000000000"``)
 */
export const ZeroAddressDevin: string =
	"0xab720000000000000000000000000000000000000000";

/**
 *  A constant for the zero address on a private network.
 *
 *  (**i.e.** ``"0xce450000000000000000000000000000000000000000"``)
 */
export const ZeroAddressPrivate: string =
	"0xce450000000000000000000000000000000000000000";
