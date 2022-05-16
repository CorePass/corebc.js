"use strict";

import fs from "fs";

import { colorify } from "../log";
import { resolve } from "../path";

const sourceCorebc = fs.readFileSync(resolve("packages/corebc/src.ts/corebc.ts")).toString();
const targets = sourceCorebc.match(/export\s*{\s*((.|\s)*)}/)[1].trim();

////////////////////
// Begin template
////////////////////

const output = `"use strict";

// To modify this file, you must update ./misc/admin/lib/cmds/update-exports.js

import * as corebc from "./corebc";

try {
    const anyGlobal = (window as any);

    if (anyGlobal._corebc == null) {
        anyGlobal._corebc = corebc;
    }
} catch (error) { }

export { corebc };

export {
    ${ targets }
} from "./corebc";
`;

////////////////////
// End template
////////////////////

console.log(colorify.bold(`Flattening exports...`))

fs.writeFileSync(resolve("packages/corebc/src.ts/index.ts"), output);
