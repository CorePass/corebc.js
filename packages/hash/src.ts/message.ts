import { Bytes, concat } from "@corepass/corebc-bytes";
import { sha256 } from "@corepass/corebc-sha3";
import { toUtf8Bytes } from "@corepass/corebc-strings";

export const messagePrefix = "\x19Core Signed Message:\n";

export function hashMessage(message: Bytes | string): string {
    if (typeof(message) === "string") { message = toUtf8Bytes(message); }
    return sha256(concat([
        toUtf8Bytes(messagePrefix),
        toUtf8Bytes(String(message.length)),
        message
    ]));
}

