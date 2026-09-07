export const defaultIpfsGatewayTemplate = "https://ipf.sk/{cid}";
export interface IpfsGatewayOptions {
	template?: string;
	maxResponseBytes?: number;
	timeoutMs?: number;
	fetch?: typeof globalThis.fetch;
}
/** Configurable IPFS resolution and bounded JSON loading. */
export class IpfsGateway {
	readonly template: string;
	readonly maxResponseBytes: number;
	readonly timeoutMs: number;
	readonly #fetch: typeof globalThis.fetch;
	constructor(options: IpfsGatewayOptions = {}) {
		this.template = options.template ?? defaultIpfsGatewayTemplate;
		this.maxResponseBytes = options.maxResponseBytes ?? 1024 * 1024;
		this.timeoutMs = options.timeoutMs ?? 30_000;
		this.#fetch = options.fetch ?? globalThis.fetch;
		const templateUrl = new URL(this.template.replace("{cid}", "cid"));
		if (
			!/^https?:$/.test(templateUrl.protocol) ||
			this.template.split("{cid}").length !== 2
		)
			throw new TypeError(
				"gateway template must be HTTP(S) and contain one {cid}",
			);
		for (const value of [this.maxResponseBytes, this.timeoutMs])
			if (!Number.isSafeInteger(value) || value <= 0)
				throw new TypeError("gateway limits must be positive safe integers");
	}
	resolve(reference: string): URL {
		const value = reference.trim();
		if (/^https?:\/\//i.test(value)) return new URL(value);
		const path = value.replace(/^ipfs:\/\//, "").replace(/^\/?ipfs\//, "");
		if (
			!/^[A-Za-z0-9]+(?:\/[^?#]*)?$/.test(path) ||
			path.split("/").some((part) => part === "." || part === "..")
		)
			throw new TypeError("invalid IPFS reference");
		return new URL(
			this.template.replace(
				"{cid}",
				path.split("/").map(encodeURIComponent).join("/"),
			),
		);
	}
	async readJson(reference: string): Promise<unknown> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
		try {
			const response = await this.#fetch(this.resolve(reference), {
				headers: { accept: "application/json" },
				signal: controller.signal,
			});
			if (!response.ok) {
				await response.body?.cancel();
				throw new Error(`IPFS gateway returned HTTP ${response.status}`);
			}
			if (!response.body)
				throw new Error("IPFS gateway returned an empty body");
			reader = response.body.getReader();
			const chunks: Uint8Array[] = [];
			let length = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				length += value.length;
				if (length > this.maxResponseBytes)
					throw new Error(
						`IPFS response exceeds ${this.maxResponseBytes} bytes`,
					);
				chunks.push(value);
			}
			const bytes = new Uint8Array(length);
			let offset = 0;
			for (const chunk of chunks) {
				bytes.set(chunk, offset);
				offset += chunk.length;
			}
			return JSON.parse(
				new TextDecoder("utf-8", { fatal: true }).decode(bytes),
			);
		} finally {
			clearTimeout(timer);
			await reader?.cancel().catch(() => {});
			reader?.releaseLock();
		}
	}
}
