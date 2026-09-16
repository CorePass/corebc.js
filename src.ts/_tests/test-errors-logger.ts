/**
 *  Error, logger and property-helper tests.
 *
 *  Two error systems coexist in this library. `utils/errors.ts` is the current
 *  one, built around `makeError` and the `ErrorCode` string union; `logger/
 *  logger.ts` is the older BN.js-era `Logger` class, still used by
 *  `bigNumber/bigNumber.ts` and the transaction serializer. Both are covered
 *  here, including the places where their codes and messages differ.
 *
 *  The fork renamed the error interface from Ethereum branding to `CoreBCError`,
 *  so the branding is asserted too.
 */
import assert from "node:assert/strict";

import {
	assert as assertCondition,
	assertArgument,
	assertArgumentCount,
	assertNormalize,
	assertPrivate,
	isCallException,
	isError,
	makeError,
} from "../utils/errors.js";
import { ErrorCode, Logger, LogLevel } from "../logger/logger.js";
import {
	checkProperties,
	defineProperties,
	resolveProperties,
} from "../utils/properties.js";
import { EventPayload } from "../utils/events.js";

function hasCode(code: string) {
	return (err: any) => err.code === code;
}

describe("makeError", () => {
	it("produces a real Error with a machine-readable code", () => {
		const error = makeError("something broke", "UNKNOWN_ERROR", {});
		assert.ok(error instanceof Error);
		assert.equal(error.code, "UNKNOWN_ERROR");
		assert.equal(error.name, "Error");
	});

	it("keeps the bare message available as shortMessage", () => {
		const error = makeError("something broke", "UNKNOWN_ERROR", {});
		assert.equal(error.shortMessage, "something broke");
		assert.match(error.message, /^something broke \(/);
	});

	it("appends the code and library version to the message", () => {
		const error = makeError("something broke", "UNKNOWN_ERROR", {});
		assert.match(error.message, /code=UNKNOWN_ERROR/);
		assert.match(error.message, /version=/);
	});

	it("carries no Ethereum branding", () => {
		const error = makeError("something broke", "UNKNOWN_ERROR", {});
		assert.doesNotMatch(error.message, /ethers/i);
		assert.doesNotMatch(String(error.stack), /EthersError/);
	});

	it("copies the info properties onto the error", () => {
		const error = makeError("bad arg", "INVALID_ARGUMENT", {
			argument: "x",
			value: 42,
		});
		assert.equal(error.argument, "x");
		assert.equal(error.value, 42);
		assert.match(error.message, /argument="x"/);
		assert.match(error.message, /value=42/);
	});

	it("records a numeric fault", () => {
		const error = makeError("numeric", "NUMERIC_FAULT", {
			fault: "overflow",
			operation: "toNumber",
			value: 1,
		});
		assert.equal(error.fault, "overflow");
		assert.equal(error.operation, "toNumber");
	});

	it("serializes an info bag into the message", () => {
		const error = makeError("something broke", "UNKNOWN_ERROR", {
			info: { a: 1 },
		});
		assert.deepEqual(error.info, { a: 1 });
		assert.match(error.message, /info=/);
	});

	it("refuses info keys that would clobber the Error shape", () => {
		for (const key of ["message", "code", "name"]) {
			assert.throws(
				() => makeError("x", "UNKNOWN_ERROR", { [key]: "hijacked" } as any),
				Error,
				`accepted an info key named ${key}`,
			);
		}
	});
});

describe("isError", () => {
	it("matches on the code", () => {
		const error = makeError("x", "UNSUPPORTED_OPERATION", { operation: "y" });
		assert.equal(isError(error, "UNSUPPORTED_OPERATION"), true);
		assert.equal(isError(error, "NETWORK_ERROR"), false);
	});

	it("rejects a plain Error", () => {
		assert.equal(isError(new Error("x"), "UNKNOWN_ERROR"), false);
	});

	it("returns false, not a falsy value, for empty input", () => {
		// The guard is typed as returning a boolean, so callers comparing
		// against `false` need an actual boolean back.
		for (const value of [null, undefined, 0, "", false, NaN]) {
			assert.equal(
				isError(value, "UNKNOWN_ERROR"),
				false,
				`non-boolean for ${String(value)}`,
			);
		}
	});

	it("narrows call exceptions", () => {
		const error = makeError("reverted", "CALL_EXCEPTION", {
			action: "call",
			data: "0x",
			reason: null,
			transaction: { to: null, data: "0x" },
			invocation: null,
			revert: null,
		});
		assert.equal(isCallException(error), true);
		assert.equal(isCallException(makeError("x", "UNKNOWN_ERROR", {})), false);
		assert.equal(isCallException(null), false);
	});
});

describe("assertion helpers", () => {
	it("assert passes a true condition through", () => {
		assertCondition(true, "nope", "UNKNOWN_ERROR", {});
	});

	it("assert throws the requested code on a false condition", () => {
		assert.throws(
			() =>
				assertCondition(false, "boom", "UNSUPPORTED_OPERATION", {
					operation: "x",
				}),
			(err: any) => {
				assert.equal(err.code, "UNSUPPORTED_OPERATION");
				assert.equal(err.shortMessage, "boom");
				return true;
			},
		);
	});

	it("assertArgument names the offending argument", () => {
		assertArgument(true, "nope", "x", 1);
		assert.throws(
			() => assertArgument(false, "bad x", "x", 1),
			(err: any) => {
				assert.equal(err.code, "INVALID_ARGUMENT");
				assert.equal(err.argument, "x");
				assert.equal(err.value, 1);
				return true;
			},
		);
	});

	it("assertArgumentCount distinguishes too few from too many", () => {
		assertArgumentCount(2, 2);
		assert.throws(() => assertArgumentCount(1, 2), hasCode("MISSING_ARGUMENT"));
		assert.throws(
			() => assertArgumentCount(3, 2),
			hasCode("UNEXPECTED_ARGUMENT"),
		);
	});

	it("assertNormalize accepts the supported unicode forms", () => {
		for (const form of ["NFC", "NFD", "NFKC", "NFKD"]) {
			assertNormalize(form);
		}
	});

	it("assertNormalize rejects an unknown form", () => {
		assert.throws(
			() => assertNormalize("BOGUS"),
			hasCode("UNSUPPORTED_OPERATION"),
		);
	});

	it("assertPrivate enforces a constructor guard", () => {
		const guard = {};
		assertPrivate(guard, guard, "Thing");
		assert.throws(
			() => assertPrivate({}, guard, "Thing"),
			(err: any) => {
				assert.equal(err.code, "UNSUPPORTED_OPERATION");
				assert.match(err.message, /private constructor/);
				assert.match(err.message, /Thing\.from\*/);
				return true;
			},
		);
	});
});

describe("Logger errors", () => {
	const logger = new Logger("test/1.0.0");

	it("builds an error tagged with its own version, not the package version", () => {
		const error: any = logger.makeError("oops", ErrorCode.INVALID_ARGUMENT, {
			a: 1,
		});
		assert.equal(error.code, "INVALID_ARGUMENT");
		assert.match(error.message, /version=test\/1\.0\.0/);
		assert.equal(error.reason, "oops");
	});

	it("defaults to UNKNOWN_ERROR with no code", () => {
		const error: any = logger.makeError("oops");
		assert.equal(error.code, ErrorCode.UNKNOWN_ERROR);
	});

	it("hex-formats a Uint8Array param rather than JSON-stringifying it", () => {
		const error: any = logger.makeError("oops", ErrorCode.INVALID_ARGUMENT, {
			value: new Uint8Array([0xde, 0xad]),
		});
		assert.match(error.message, /value=Uint8Array\(0xdead\)/);
	});

	it("copies params onto the error", () => {
		const error: any = logger.makeError("oops", ErrorCode.INVALID_ARGUMENT, {
			argument: "n",
			value: 5,
		});
		assert.equal(error.argument, "n");
		assert.equal(error.value, 5);
	});

	it("throwError throws what makeError builds", () => {
		assert.throws(
			() => logger.throwError("nope", ErrorCode.UNSUPPORTED_OPERATION, {}),
			hasCode("UNSUPPORTED_OPERATION"),
		);
	});

	it("throwArgumentError records the argument and value", () => {
		assert.throws(
			() => logger.throwArgumentError("bad", "n", 5),
			(err: any) => {
				assert.equal(err.code, "INVALID_ARGUMENT");
				assert.equal(err.argument, "n");
				assert.equal(err.value, 5);
				return true;
			},
		);
	});

	it("assert and assertArgument only throw when the condition fails", () => {
		logger.assert(true, "x", ErrorCode.UNKNOWN_ERROR, {});
		logger.assertArgument(true, "x", "n", 1);
		assert.throws(
			() => logger.assert(false, "x", ErrorCode.UNKNOWN_ERROR, {}),
			hasCode("UNKNOWN_ERROR"),
		);
		assert.throws(
			() => logger.assertArgument(false, "x", "n", 1),
			hasCode("INVALID_ARGUMENT"),
		);
	});

	it("checkArgumentCount reports both directions", () => {
		logger.checkArgumentCount(2, 2);
		assert.throws(
			() => logger.checkArgumentCount(1, 2),
			hasCode("MISSING_ARGUMENT"),
		);
		assert.throws(
			() => logger.checkArgumentCount(3, 2),
			hasCode("UNEXPECTED_ARGUMENT"),
		);
	});

	it("checkNew requires the new operator", () => {
		class Thing {}
		logger.checkNew(Thing, Thing);
		assert.throws(
			() => logger.checkNew(undefined, Thing),
			hasCode("MISSING_NEW"),
		);
	});

	it("checkAbstract allows subclasses but not the base itself", () => {
		class Base {}
		class Derived extends Base {}
		logger.checkAbstract(Derived, Base);
		assert.throws(
			() => logger.checkAbstract(Base, Base),
			(err: any) => {
				assert.equal(err.code, "UNSUPPORTED_OPERATION");
				assert.match(err.message, /abstract class/);
				return true;
			},
		);
	});

	it("exposes the code and level enums as statics", () => {
		assert.equal(Logger.errors, ErrorCode);
		assert.equal(Logger.levels, LogLevel);
		assert.ok(Logger.from("x/1") instanceof Logger);
		assert.ok(Logger.globalLogger() instanceof Logger);
	});

	it("uses Core's energy naming in its error codes", () => {
		const codes = Object.keys(ErrorCode);
		assert.ok(codes.includes("UNPREDICTABLE_ENERGY_LIMIT"));
		assert.ok(!codes.includes("UNPREDICTABLE_GAS_LIMIT"));
	});
});

describe("Logger censorship", () => {
	const logger = new Logger("test/1.0.0");

	// Censorship is global, and the permanent variant can never be undone, so
	// only the reversible form is exercised and it is always restored.
	afterEach(() => {
		Logger.setCensorship(false);
	});

	it("replaces the message and drops the params when enabled", () => {
		Logger.setCensorship(true);
		const error: any = logger.makeError(
			"secret detail",
			ErrorCode.INVALID_ARGUMENT,
			{
				argument: "n",
				value: { secret: 42 },
			},
		);
		assert.match(error.message, /censored error/);
		assert.doesNotMatch(error.message, /secret/);
		assert.equal(error.value, undefined);
		assert.equal(error.argument, undefined);
	});

	it("keeps the code so callers can still branch on it", () => {
		Logger.setCensorship(true);
		const error: any = logger.makeError("secret", ErrorCode.NUMERIC_FAULT, {
			fault: "overflow",
		});
		assert.equal(error.code, ErrorCode.NUMERIC_FAULT);
	});

	it("restores full detail when disabled", () => {
		Logger.setCensorship(true);
		Logger.setCensorship(false);
		const error: any = logger.makeError(
			"secret detail",
			ErrorCode.INVALID_ARGUMENT,
			{
				value: 42,
			},
		);
		assert.match(error.message, /secret detail/);
		assert.equal(error.value, 42);
	});

	it("refuses to disable censorship permanently", () => {
		assert.throws(
			() => Logger.setCensorship(false, true),
			hasCode("UNSUPPORTED_OPERATION"),
		);
	});
});

describe("Logger log level", () => {
	const logger = new Logger("test/1.0.0");

	let level: LogLevel;
	beforeEach(() => {
		level = LogLevel.INFO;
	});
	afterEach(() => {
		Logger.setLogLevel(level);
	});

	it("suppresses output at or below the configured level", () => {
		const written: Array<string> = [];
		const original = console.log;
		console.log = (...args: Array<any>) => {
			written.push(args.join(" "));
		};
		try {
			Logger.setLogLevel(LogLevel.OFF);
			logger.warn("should not appear");
			logger.info("should not appear");
			logger.debug("should not appear");
		} finally {
			console.log = original;
		}
		assert.deepEqual(written, []);
	});

	it("emits a warning at the warning level", () => {
		const written: Array<string> = [];
		const original = console.log;
		console.log = (...args: Array<any>) => {
			written.push(args.join(" "));
		};
		try {
			Logger.setLogLevel(LogLevel.WARNING);
			logger.warn("visible warning");
			logger.debug("hidden debug");
		} finally {
			console.log = original;
		}
		assert.deepEqual(written, ["visible warning"]);
	});

	it("warns rather than throwing on an unknown level", () => {
		const written: Array<string> = [];
		const original = console.log;
		console.log = (...args: Array<any>) => {
			written.push(args.join(" "));
		};
		try {
			Logger.setLogLevel("NOPE" as any);
		} finally {
			console.log = original;
		}
		assert.equal(written.length, 1);
		assert.match(written[0], /invalid log level/);
	});
});

describe("defineProperties", () => {
	it("assigns the given values", () => {
		const target: any = {};
		defineProperties(target, { a: 1, b: "two" });
		assert.equal(target.a, 1);
		assert.equal(target.b, "two");
	});

	it("makes the properties read-only", () => {
		const target: any = {};
		defineProperties(target, { a: 1 });
		assert.throws(() => {
			target.a = 9;
		}, TypeError);
		assert.equal(target.a, 1);
	});

	it("makes the properties enumerable", () => {
		const target: any = {};
		defineProperties(target, { a: 1, b: 2 });
		assert.deepEqual(Object.keys(target), ["a", "b"]);
	});
});

describe("checkProperties", () => {
	it("accepts an object with only permitted keys", () => {
		checkProperties({ a: 1 }, { a: true });
		checkProperties({}, { a: true });
	});

	it("names the offending key", () => {
		assert.throws(
			() => checkProperties({ a: 1, z: 2 }, { a: true }),
			(err: any) => {
				assert.equal(err.code, "INVALID_ARGUMENT");
				assert.match(err.message, /invalid object key - z/);
				return true;
			},
		);
	});

	it("rejects a non-object", () => {
		for (const value of [null, undefined]) {
			assert.throws(
				() => checkProperties(value, { a: true }),
				hasCode("INVALID_ARGUMENT"),
				`accepted ${String(value)}`,
			);
		}
	});
});

describe("resolveProperties", () => {
	it("awaits every value", async () => {
		const resolved = await resolveProperties({
			a: Promise.resolve(1),
			b: 2,
			c: Promise.resolve("three"),
		});
		assert.deepEqual(resolved, { a: 1, b: 2, c: "three" });
	});

	it("resolves an empty object", async () => {
		assert.deepEqual(await resolveProperties({}), {});
	});

	it("propagates the first rejection", async () => {
		await assert.rejects(
			resolveProperties({ a: Promise.reject(new Error("nope")), b: 1 }),
			/nope/,
		);
	});
});

describe("EventPayload", () => {
	it("exposes the emitter and the filter", () => {
		const emitter: any = { name: "emitter" };
		const payload = new EventPayload(emitter, null, "myEvent");
		assert.equal(payload.emitter, emitter);
		assert.equal(payload.filter, "myEvent");
	});

	it("is read-only", () => {
		const payload = new EventPayload({} as any, null, "myEvent");
		assert.throws(() => {
			(payload as any).filter = "other";
		}, TypeError);
	});

	it("keeps the listener private", () => {
		const listener = () => {};
		const payload = new EventPayload({} as any, listener, "myEvent");
		assert.equal((payload as any).listener, undefined);
		assert.deepEqual(Object.keys(payload).sort(), ["emitter", "filter"]);
	});

	it("unregisters the listener through the emitter", async () => {
		const listener = () => {};
		const calls: Array<Array<any>> = [];
		const emitter: any = {
			async off(...args: Array<any>) {
				calls.push(args);
				return this;
			},
		};
		await new EventPayload(emitter, listener, "myEvent").removeListener();
		assert.deepEqual(calls, [["myEvent", listener]]);
	});

	it("does nothing when there is no listener", async () => {
		const emitter: any = {
			async off() {
				throw new Error("should not be called");
			},
		};
		await new EventPayload(emitter, null, "myEvent").removeListener();
	});
});
