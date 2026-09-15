import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { capture } from "./golden-capture.js";

const BASELINE = resolve(process.cwd(), "testcases/golden-vectors.json");

/** Flatten to path -> scalar so mismatches name the exact value that moved. */
function flatten(
	value: any,
	prefix = "",
	out: Map<string, string> = new Map(),
) {
	if (value !== null && typeof value === "object" && !Array.isArray(value)) {
		for (const key of Object.keys(value)) {
			flatten(value[key], prefix ? `${prefix}.${key}` : key, out);
		}
	} else {
		out.set(prefix, JSON.stringify(value));
	}
	return out;
}

describe("golden vectors (behavioural baseline)", function () {
	// The capture runs scrypt and PBKDF2 over a few hundred vectors.
	this.timeout(120000);

	it("reproduces the recorded behaviour exactly", async () => {
		if (!existsSync(BASELINE)) {
			assert.fail(
				`missing baseline ${BASELINE}; regenerate it from the pre-migration build`,
			);
		}

		const expected = flatten(JSON.parse(readFileSync(BASELINE, "utf8")));
		const actual = flatten(await capture());

		const changed: string[] = [];
		const missing: string[] = [];
		for (const [path, want] of expected) {
			if (!actual.has(path)) {
				missing.push(path);
			} else if (actual.get(path) !== want) {
				changed.push(
					`${path}\n    expected: ${want}\n    actual:   ${actual.get(path)}`,
				);
			}
		}
		const added = [...actual.keys()].filter((p) => !expected.has(p));

		const problems: string[] = [];
		if (changed.length) {
			problems.push(
				`${changed.length} value(s) changed:\n  ${changed.join("\n  ")}`,
			);
		}
		if (missing.length) {
			problems.push(
				`${missing.length} entry(ies) disappeared:\n  ${missing.join("\n  ")}`,
			);
		}
		assert.equal(problems.join("\n\n"), "", `\n${problems.join("\n\n")}\n`);

		// New coverage is fine, but say so rather than silently passing.
		if (added.length) {
			console.log(`    note: ${added.length} new vector(s) not in baseline`);
		}
		assert.ok(expected.size > 0, "baseline is empty");
	});
});
