"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const log_1 = require("../log");
const path_1 = require("../path");
const sourceCorebc = fs_1.default.readFileSync((0, path_1.resolve)("packages/corebc/src.ts/corebc.ts")).toString();
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
    ${targets}
} from "./corebc";
`;
////////////////////
// End template
////////////////////
console.log(log_1.colorify.bold(`Flattening exports...`));
fs_1.default.writeFileSync((0, path_1.resolve)("packages/corebc/src.ts/index.ts"), output);
