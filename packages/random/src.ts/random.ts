import { randomBytes as _randomBytes } from "crypto";

import { arrayify } from "@corepass/corebc-bytes";

export function randomBytes(length: number): Uint8Array {
    return arrayify(_randomBytes(length));
}
