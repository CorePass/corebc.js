import { readdir, rm } from "node:fs/promises";
for (const dir of ["dist", "lib.esm", "lib.commonjs", "types"]) {
	for (const entry of await readdir(dir).catch(() => [])) {
		if (entry === "README.md") continue;
		await rm(`${dir}/${entry}`, { recursive: true, force: true });
	}
}
