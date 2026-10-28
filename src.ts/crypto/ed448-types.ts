import type { Buffer } from "buffer";
/** Buffer-based Ed448 operations used by Core signing, with bcrypto's interface. */
export interface Ed448Backend {
	privateKeyGenerate(): Buffer;
	publicKeyCreate(key: Buffer): Buffer;
	publicKeyFromScalar(scalar: Buffer): Buffer;
	publicKeyVerify(key: Buffer): boolean;
	publicKeyConvert(key: Buffer): Buffer;
	publicKeyCombine(keys: Buffer[]): Buffer;
	sign(message: Buffer, key: Buffer): Buffer;
	signWithScalar(message: Buffer, scalar: Buffer, prefix: Buffer): Buffer;
	verify(message: Buffer, signature: Buffer, publicKey: Buffer): boolean;
	derive(publicKey: Buffer, key: Buffer): Buffer;
	deriveWithScalar(publicKey: Buffer, scalar: Buffer): Buffer;
}
