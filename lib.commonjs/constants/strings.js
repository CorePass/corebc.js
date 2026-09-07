'use strict';

// NFKC (composed)             // (decomposed)
/**
 *  A constant for the core symbol (normalized using NFKC).
 *
 *  (**i.e.** ``"\\u039e"``)
 */
const CoreSymbol = "\u039e"; // "\uD835\uDF63";
/**
 *  A constant for the [[link-eip-191]] personal message prefix.
 *
 *  (**i.e.** ``"\\x19Core Signed Message:\\n"``)
 */
const MessagePrefix = "\x19Core Signed Message:\n";

exports.CoreSymbol = CoreSymbol;
exports.MessagePrefix = MessagePrefix;
//# sourceMappingURL=strings.js.map
