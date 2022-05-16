"use strict";
import { corebc } from "corebc";
export function randomBytes(seed, lower, upper) {
    if (!upper) {
        upper = lower;
    }
    if (upper === 0 && upper === lower) {
        return new Uint8Array(0);
    }
    let result = corebc.utils.arrayify(corebc.utils.sha256(corebc.utils.toUtf8Bytes(seed)));
    while (result.length < upper) {
        result = corebc.utils.concat([result, corebc.utils.sha256(result)]);
    }
    let top = corebc.utils.arrayify(corebc.utils.sha256(result));
    let percent = ((top[0] << 16) | (top[1] << 8) | top[2]) / 0x01000000;
    return result.slice(0, lower + Math.floor((upper - lower) * percent));
}
export function randomHexString(seed, lower, upper) {
    return corebc.utils.hexlify(randomBytes(seed, lower, upper));
}
export function randomNumber(seed, lower, upper) {
    let top = randomBytes(seed, 3);
    let percent = ((top[0] << 16) | (top[1] << 8) | top[2]) / 0x01000000;
    return lower + Math.floor((upper - lower) * percent);
}
//# sourceMappingURL=random.js.map