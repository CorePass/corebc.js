import { concat, hexlify } from "@corepass/corebc-bytes";
import { nameprep, toUtf8Bytes } from "@corepass/corebc-strings";
import { sha256 } from "@corepass/corebc-sha3";

import { Logger } from "@corepass/corebc-logger";
import { version } from "./_version";
const logger = new Logger(version);

const Zeros = new Uint8Array(32);
Zeros.fill(0);

const Partition = new RegExp("^((.*)\\.)?([^.]+)$");

export function isValidName(name: string): boolean {
    try {
        const comps = name.split(".");
        for (let i = 0; i < comps.length; i++) {
            if (nameprep(comps[i]).length === 0) {
                throw new Error("empty")
            }
        }
        return true;
    } catch (error) { }
    return false;
}

export function namehash(name: string): string {
    /* istanbul ignore if */
    if (typeof(name) !== "string") {
        logger.throwArgumentError("invalid ENS name; not a string", "name", name);
    }

    let current = name;
    let result: string | Uint8Array = Zeros;
    while (current.length) {
        const partition = current.match(Partition);
        if (partition == null || partition[2] === "") {
            logger.throwArgumentError("invalid ENS address; missing component", "name", name);
        }
        const label = toUtf8Bytes(nameprep(partition[3]));
        result = sha256(concat([result, sha256(label)]));

        current = partition[2] || "";
    }

    return hexlify(result);
}

