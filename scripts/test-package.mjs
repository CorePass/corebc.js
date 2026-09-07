import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const temp = await mkdtemp(join(tmpdir(), "corebc-package-"));
try {
	const [packed] = JSON.parse(
		execFileSync(
			"npm",
			["pack", "--ignore-scripts", "--json", "--pack-destination", temp],
			{ encoding: "utf8" },
		),
	);
	assert.ok(
		!packed.files.some(({ path }) => /(?:^|\/)_(tests|admin)\//.test(path)),
	);
	await writeFile(
		join(temp, "package.json"),
		'{"private":true,"type":"module"}',
	);
	execFileSync(
		"npm",
		["install", "--no-audit", "--no-fund", join(temp, packed.filename)],
		{ cwd: temp, stdio: "pipe" },
	);
	for (const mode of ["module", "commonjs"]) {
		const code =
			(mode === "module"
				? `import { version } from "corebc"; if (version !== ${JSON.stringify(pkg.version)}) throw new Error("version mismatch");\n`
				: `if (require("corebc").version !== ${JSON.stringify(pkg.version)}) throw new Error("version mismatch");\n`) +
			Object.keys(pkg.exports)
				.map((key) => {
					const name = "corebc" + (key === "." ? "" : key.slice(1));
					return mode === "module"
						? `await import(${JSON.stringify(name)});`
						: `require(${JSON.stringify(name)});`;
				})
				.join("\n");
		execFileSync(process.execPath, ["--input-type=" + mode, "-e", code], {
			cwd: temp,
			stdio: "pipe",
		});
	}
	// Compile consumer imports against both package export conditions.
	const consumer =
		'import { Wallet, Cip150MetadataContract, IpfsGateway } from "corebc";\nimport { Cip151Lifecycle } from "corebc/cip";\nvoid [Wallet, Cip150MetadataContract, IpfsGateway, new Cip151Lifecycle()];\n';
	for (const ext of ["mts", "cts"]) {
		const filename = join(temp, `consumer.${ext}`);
		await writeFile(filename, consumer);
		execFileSync(
			resolve("node_modules/.bin/tsc"),
			[
				"--ignoreConfig",
				"--noEmit",
				"--strict",
				"--module",
				"nodenext",
				"--target",
				"es2022",
				filename,
			],
			{ cwd: temp, stdio: "inherit" },
		);
	}
	await import("./test-browser.mjs");
	console.log(
		`Package smoke checks passed: ${packed.files.length} files, ${packed.size} bytes; ESM, CommonJS, declarations and browser bundles.`,
	);
} finally {
	await rm(temp, { recursive: true, force: true });
}
