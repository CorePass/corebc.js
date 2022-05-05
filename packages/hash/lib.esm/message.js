import { concat } from "@ethersproject/bytes";
import { sha256 } from "@ethersproject/sha3";
import { toUtf8Bytes } from "@ethersproject/strings";
export const messagePrefix = "\x19Core Signed Message:\n";
export function hashMessage(message) {
    if (typeof (message) === "string") {
        message = toUtf8Bytes(message);
    }
    return sha256(concat([
        toUtf8Bytes(messagePrefix),
        toUtf8Bytes(String(message.length)),
        message
    ]));
}
//# sourceMappingURL=message.js.map