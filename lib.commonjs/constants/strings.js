"use strict";
// NFKC (composed)             // (decomposed)
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagePrefix = exports.CoreSymbol = void 0;
/**
 *  A constant for the core symbol (normalized using NFKC).
 *
 *  (**i.e.** ``"\\u039e"``)
 */
exports.CoreSymbol = "\u039e"; // "\uD835\uDF63";
/**
 *  A constant for the [[link-eip-191]] personal message prefix.
 *
 *  (**i.e.** ``"\\x19Core Signed Message:\\n"``)
 */
exports.MessagePrefix = "\x19Core Signed Message:\n";
//# sourceMappingURL=strings.js.map