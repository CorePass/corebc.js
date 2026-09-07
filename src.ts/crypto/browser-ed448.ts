// bcrypto does not ship TypeScript declarations.
// @ts-ignore
import backend from "bcrypto/lib/ed448-browser.js";
import type { Ed448Backend } from "./ed448-types.js";
const ed448: Ed448Backend = backend;
export default ed448;
