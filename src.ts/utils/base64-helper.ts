/**
 *  @_ignore
 */

/**
 *  Normalizes %%value%% to the standard base-64 alphabet.
 *
 *  Both base-64 implementations route through here so the node and browser
 *  builds accept the same inputs. ``Buffer.from`` is lenient: it strips
 *  characters outside the alphabet and treats the URL-safe ``"-"`` and
 *  ``"_"`` as aliases of ``"+"`` and ``"/"``. ``atob`` only strips ASCII
 *  whitespace and rejects the rest, so the browser build needs the input
 *  cleaned up first to match.
 */
export function normalizeBase64(value: string): string {
	if (typeof value !== "string") {
		return value;
	}

	const standard = value.replace(/-/g, "+").replace(/_/g, "/");
	const cleaned = standard.replace(/[^A-Za-z0-9+/=]/g, "");

	// atob also rejects a length that leaves a single dangling character,
	// which encodes no whole byte; Buffer ignores it. Drop it for parity.
	const body = cleaned.replace(/=+$/, "");
	if (body.length % 4 === 1) {
		return body.substring(0, body.length - 1);
	}

	return body;
}
