import { sha256 } from "@ethersproject/sha3";
import { toUtf8Bytes } from "@ethersproject/strings";

export function id(text: string): string {
    return sha256(toUtf8Bytes(text));
}
