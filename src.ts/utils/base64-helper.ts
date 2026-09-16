/**
 *  @_ignore
 */
import { assertArgument } from "./errors.js";

/**
 *  Throws unless %%value%% is a well-formed standard base-64 string.
 *
 *  Both base-64 implementations route through here so the node and browser
 *  builds accept exactly the same inputs. This is deliberately stricter than
 *  the platform primitives: ``Buffer.from`` drops unknown characters and
 *  aliases the URL-safe alphabet, while ``atob`` strips ASCII whitespace.
 *  Either way malformed input would decode to silently truncated data.
 */
export function assertBase64(value: string): void {
	assertArgument(
		typeof value === "string" && /^[A-Za-z0-9+/]*={0,2}$/.test(value),
		"invalid base64 value",
		"value",
		value,
	);

	// A single leftover character cannot encode a whole byte.
	assertArgument(
		value.replace(/=+$/, "").length % 4 !== 1,
		"invalid base64 value",
		"value",
		value,
	);
}
