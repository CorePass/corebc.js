import { mkdir, readFile, writeFile } from "node:fs/promises";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const browser = Object.fromEntries(
	Object.entries(pkg.browser)
		.filter(([key]) => key.startsWith("./lib.esm/"))
		.map(([key, value]) => [
			key.replace("./lib.esm/", "./"),
			value.replace("./lib.esm/", "./"),
		]),
);
for (const dir of ["lib.esm", "lib.commonjs", "dist", "types"])
	await mkdir(dir, { recursive: true });
await writeFile(
	"lib.esm/package.json",
	JSON.stringify({ type: "module", sideEffects: false, browser }, null, "\t") +
		"\n",
);
