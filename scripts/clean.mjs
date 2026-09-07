import { rm } from "node:fs/promises";
for (const dir of ["dist", "lib.esm", "lib.commonjs", "types"]) {
	await rm(dir, { recursive: true, force: true });
}
