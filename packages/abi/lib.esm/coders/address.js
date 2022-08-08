"use strict";
import { getAddress } from "@corepass/corebc-address";
import { hexZeroPad } from "@corepass/corebc-bytes";
import { Coder } from "./abstract-coder";
export class AddressCoder extends Coder {
    constructor(localName) {
        super("address", "address", localName, false);
    }
    defaultValue() {
        // Need to fix zero address according to the network
        return "0x0000000000000000000000000000000000000000";
    }
    encode(writer, value) {
        try {
            value = getAddress(value);
        }
        catch (error) {
            this._throwError(error.message, value);
        }
        return writer.writeValue(value);
    }
    decode(reader) {
        return getAddress(hexZeroPad(reader.readValue().toHexString(), 22));
    }
}
//# sourceMappingURL=address.js.map