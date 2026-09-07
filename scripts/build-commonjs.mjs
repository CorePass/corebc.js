import { readdir, mkdir, writeFile, copyFile } from "node:fs/promises";
import { rollup } from "rollup";
const input = (await readdir("lib.esm", { recursive: true }))
	.filter((name) => name.endsWith(".js") && !name.startsWith("_admin/"))
	.map((name) => `lib.esm/${name}`);
const bundle = await rollup({
	input,
	external: (id) => !id.startsWith(".") && !id.startsWith("/"),
});
await bundle.write({
	dir: "lib.commonjs",
	format: "cjs",
	exports: "named",
	preserveModules: true,
	preserveModulesRoot: "lib.esm",
	sourcemap: true,
});
await bundle.close();
await writeFile(
	"lib.commonjs/package.json",
	JSON.stringify({ type: "commonjs" }),
);
for (const name of await readdir("lib.esm", { recursive: true })) {
	if (!/\.d\.ts(?:\.map)?$/.test(name) || name.startsWith("_admin/")) continue;
	const dest = `lib.commonjs/${name}`;
	await mkdir(dest.slice(0, dest.lastIndexOf("/")), { recursive: true });
	await copyFile(`lib.esm/${name}`, dest);
}
