import { sha256 } from "@corepass/corebc-sha3";
import { toUtf8Bytes } from "@corepass/corebc-strings";
export function id(text) {
    return sha256(toUtf8Bytes(text));
}
//# sourceMappingURL=id.js.map