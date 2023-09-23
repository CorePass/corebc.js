/**
 *  Some data helpers.
 *
 *
 *  @_subsection api/utils:Data Helpers  [about-data]
 */
import { Logger } from "../logger/logger.js";
import { assert, assertArgument } from "./errors.js";
const logger = new Logger("utils/data/0.0.1");
/**
 *  A [[HexString]] whose length is even, which ensures it is a valid
 *  representation of binary data.
 */
export type DataHexString = string;

/**
 *  A string which is prefixed with ``0x`` and followed by any number
 *  of case-agnostic hexadecimal characters.
 *
 *  It must match the regular expression ``/0x[0-9A-Fa-f]*\/``.
 */
export type HexString = string;

/**
 *  An object that can be used to represent binary data.
 */
export type Bytes = ArrayLike<number>;

export type BytesLike = Bytes | string;

export type DataOptions = {
  allowMissingPrefix?: boolean;
  hexPad?: "left" | "right" | null;
};
export interface Hexable {
  toHexString(): string;
}

function isHexable(value: any): value is Hexable {
  return !!value.toHexString;
}
function isInteger(value: number) {
  return typeof value === "number" && value == value && value % 1 === 0;
}

export function isBytes(value: any): value is Bytes {
  if (value == null) {
    return false;
  }

  if (value.constructor === Uint8Array) {
    return true;
  }
  if (typeof value === "string") {
    return false;
  }
  if (!isInteger(value.length) || value.length < 0) {
    return false;
  }

  for (let i = 0; i < value.length; i++) {
    const v = value[i];
    if (!isInteger(v) || v < 0 || v >= 256) {
      return false;
    }
  }
  return true;
}

function _getBytes(
  value: BytesLike,
  name?: string,
  copy?: boolean,
): Uint8Array {
  if (value instanceof Uint8Array) {
    if (copy) {
      return new Uint8Array(value);
    }
    return value;
  }

  if (typeof value === "string" && value.match(/^0x([0-9a-f][0-9a-f])*$/i)) {
    const result = new Uint8Array((value.length - 2) / 2);
    let offset = 2;
    for (let i = 0; i < result.length; i++) {
      result[i] = parseInt(value.substring(offset, offset + 2), 16);
      offset += 2;
    }
    return result;
  }

  assertArgument(false, "invalid BytesLike value", name || "value", value);
}

/**
 *  Get a typed Uint8Array for %%value%%. If already a Uint8Array
 *  the original %%value%% is returned; if a copy is required use
 *  [[getBytesCopy]].
 *
 *  @see: getBytesCopy
 */
export function getBytes(value: BytesLike, name?: string): Uint8Array {
  return _getBytes(value, name, false);
}

/**
 *  Get a typed Uint8Array for %%value%%, creating a copy if necessary
 *  to prevent any modifications of the returned value from being
 *  reflected elsewhere.
 *
 *  @see: getBytes
 */
export function getBytesCopy(value: BytesLike, name?: string): Uint8Array {
  return _getBytes(value, name, true);
}

/**
 *  Returns true if %%value%% is a valid [[HexString]].
 *
 *  If %%length%% is ``true`` or a //number//, it also checks that
 *  %%value%% is a valid [[DataHexString]] of %%length%% (if a //number//)
 *  bytes of data (e.g. ``0x1234`` is 2 bytes).
 */
export function isHexString(
  value: any,
  length?: number | boolean,
): value is `0x${string}` {
  if (typeof value !== "string" || !value.match(/^0x[0-9A-Fa-f]*$/)) {
    return false;
  }

  if (typeof length === "number" && value.length !== 2 + 2 * length) {
    return false;
  }
  if (length === true && value.length % 2 !== 0) {
    return false;
  }

  return true;
}

/**
 *  Returns true if %%value%% is a valid representation of arbitrary
 *  data (i.e. a valid [[DataHexString]] or a Uint8Array).
 */
export function isBytesLike(value: any): value is BytesLike {
  return isHexString(value, true) || value instanceof Uint8Array;
}

const HexCharacters: string = "0123456789abcdef";

/**
 *  Returns a [[DataHexString]] representation of %%data%%.
 */
export function hexlify(
  value: BytesLike | Hexable | number | bigint,
  options?: DataOptions,
): string {
  if (!options) {
    options = {};
  }
  if (typeof value === "string") {
    if (value.includes(",") && value.startsWith("0x")) {
      const v = value
        .replace("0x", "")
        .split(",")
        .map((item) => Number(item));
      // @ts-ignore
      value = new Uint8Array(v);
    }
  }
  if (typeof value === "number") {
    logger.checkSafeUint53(value, "invalid hexlify value");

    let hex = "";
    while (value) {
      hex = HexCharacters[value & 0xf] + hex;
      value = Math.floor(value / 16);
    }

    if (hex.length) {
      if (hex.length % 2) {
        hex = "0" + hex;
      }
      return "0x" + hex;
    }

    return "0x00";
  }

  if (typeof value === "bigint") {
    value = value.toString(16);
    if (value.length % 2) {
      return "0x0" + value;
    }
    return "0x" + value;
  }

  if (
    options.allowMissingPrefix &&
    typeof value === "string" &&
    value.substring(0, 2) !== "0x"
  ) {
    value = "0x" + value;
  }

  if (isHexable(value)) {
    return value.toHexString();
  }

  if (isHexString(value)) {
    if ((<string>value).length % 2) {
      if (options.hexPad === "left") {
        value = "0x0" + (<string>value).substring(2);
      } else if (options.hexPad === "right") {
        value += "0";
      } else {
        logger.throwArgumentError("hex data is odd-length", "value", value);
      }
    }
    return (<string>value).toLowerCase();
  }

  if (isBytes(value)) {
    let result = "0x";
    for (let i = 0; i < value.length; i++) {
      let v = value[i];
      result += HexCharacters[(v & 0xf0) >> 4] + HexCharacters[v & 0x0f];
    }
    return result;
  }

  return logger.throwArgumentError("invalid hexlify value", "value", value);
}

/**
 *  Returns a [[DataHexString]] by concatenating all values
 *  within %%data%%.
 */
export function concat(items: ReadonlyArray<BytesLike>): string {
  return "0x" + items.map((d) => hexlify(d).substring(2)).join("");
}

export function hexDataSlice(
  data: BytesLike,
  offset: number,
  endOffset?: number,
): string {
  if (typeof data !== "string") {
    data = hexlify(data);
  } else if (!isHexString(data) || data.length % 2) {
    logger.throwArgumentError("invalid hexData", "value", data);
  }

  offset = 2 + 2 * offset;

  if (endOffset != null) {
    return "0x" + data.substring(offset, 2 + 2 * endOffset);
  }

  return "0x" + data.substring(offset);
}

export function hexDataLength(data: BytesLike) {
  if (typeof data !== "string") {
    data = hexlify(data);
  } else if (!isHexString(data) || data.length % 2) {
    return null;
  }

  return (data.length - 2) / 2;
}

/**
 *  Returns the length of %%data%%, in bytes.
 */
export function dataLength(data: BytesLike): number {
  if (isHexString(data, true)) {
    return (data.length - 2) / 2;
  }
  return getBytes(data).length;
}

/**
 *  Returns a [[DataHexString]] by slicing %%data%% from the %%start%%
 *  offset to the %%end%% offset.
 *
 *  By default %%start%% is 0 and %%end%% is the length of %%data%%.
 */
export function dataSlice(
  data: BytesLike,
  start?: number,
  end?: number,
): string {
  const bytes = getBytes(data);
  if (end != null && end > bytes.length) {
    assert(false, "cannot slice beyond data bounds", "BUFFER_OVERRUN", {
      buffer: bytes,
      length: bytes.length,
      offset: end,
    });
  }
  return hexlify(
    bytes.slice(start == null ? 0 : start, end == null ? bytes.length : end),
  );
}

/**
 *  Return the [[DataHexString]] result by stripping all **leading**
 ** zero bytes from %%data%%.
 */
export function stripZerosLeft(data: BytesLike): string {
  let bytes = hexlify(data).substring(2);
  while (bytes.startsWith("00")) {
    bytes = bytes.substring(2);
  }
  return "0x" + bytes;
}

function zeroPad(data: BytesLike, length: number, left: boolean): string {
  const bytes = getBytes(data);
  assert(
    length >= bytes.length,
    "padding exceeds data length",
    "BUFFER_OVERRUN",
    {
      buffer: new Uint8Array(bytes),
      length: length,
      offset: length + 1,
    },
  );

  const result = new Uint8Array(length);
  result.fill(0);
  if (left) {
    result.set(bytes, length - bytes.length);
  } else {
    result.set(bytes, 0);
  }

  return hexlify(result);
}

/**
 *  Return the [[DataHexString]] of %%data%% padded on the **left**
 *  to %%length%% bytes.
 *
 *  If %%data%% already exceeds %%length%%, a [[BufferOverrunError]] is
 *  thrown.
 *
 *  This pads data the same as **values** are in Solidity
 *  (e.g. ``uint128``).
 */
export function zeroPadValue(data: BytesLike, length: number): string {
  return zeroPad(data, length, true);
}

/**
 *  Return the [[DataHexString]] of %%data%% padded on the **right**
 *  to %%length%% bytes.
 *
 *  If %%data%% already exceeds %%length%%, a [[BufferOverrunError]] is
 *  thrown.
 *
 *  This pads data the same as **bytes** are in Solidity
 *  (e.g. ``bytes16``).
 */
export function zeroPadBytes(data: BytesLike, length: number): string {
  return zeroPad(data, length, false);
}

export function stripZeros(value: BytesLike): Uint8Array {
  let result: Uint8Array = arrayify(value);

  if (result.length === 0) {
    return result;
  }

  // Find the first non-zero entry
  let start = 0;
  while (start < result.length && result[start] === 0) {
    start++;
  }

  // If we started with zeros, strip them
  if (start) {
    result = result.slice(start);
  }

  return result;
}

export function arrayify(
  value: BytesLike | Hexable | number,
  options?: DataOptions,
): Uint8Array {
  if (!options) {
    options = {};
  }

  if (typeof value === "number") {
    logger.checkSafeUint53(value, "invalid arrayify value");
    const result: any = [];
    while (value) {
      // @ts-ignore
      result.unshift(value & 0xff);
      value = parseInt(String(value / 256));
    }
    if (result.length === 0) {
      result.push(0);
    }

    return addSlice(new Uint8Array(result));
  }
  if (
    options.allowMissingPrefix &&
    typeof value === "string" &&
    value.substring(0, 2) !== "0x"
  ) {
    value = "0x" + value;
  }
  if (isHexable(value)) {
    value = value.toHexString();
  }
  if (isHexString(value)) {
    let hex = (<string>value).substring(2);
    if (hex.length % 2) {
      if (options.hexPad === "left") {
        hex = "0x0" + hex.substring(2);
      } else if (options.hexPad === "right") {
        hex += "0";
      } else {
        logger.throwArgumentError("hex data is odd-length", "value", value);
      }
    }

    const result = [];
    for (let i = 0; i < hex.length; i += 2) {
      // @ts-ignore
      result.push(parseInt(hex.substring(i, i + 2), 16));
    }

    return addSlice(new Uint8Array(result));
  }

  if (isBytes(value)) {
    return addSlice(new Uint8Array(value));
  }

  return logger.throwArgumentError("invalid arrayify value", "value", value);
}
function addSlice(array: Uint8Array): Uint8Array {
  // @ts-ignore
  if (array.slice) {
    return array;
  }

  array.slice = function () {
    const args: any = Array.prototype.slice.call(arguments);
    return addSlice(new Uint8Array(Array.prototype.slice.apply(array, args)));
  };

  return array;
}

export function hexConcat(items: ReadonlyArray<BytesLike>): string {
  let result = "0x";
  items.forEach((item) => {
    result += hexlify(item).substring(2);
  });
  return result;
}
