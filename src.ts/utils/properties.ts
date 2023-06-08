import { Logger } from "../logger/logger.js";

/**
 *  Property helper functions.
 *
 *  @_subsection api/utils:Properties  [about-properties]
 */
const logger=new Logger('utils/properties/0.0.1')

function checkType(value: any, type: string, name: string): void {
    const types = type.split("|").map(t => t.trim());
    for (let i = 0; i < types.length; i++) {
        switch (type) {
            case "any":
                return;
            case "bigint":
            case "boolean":
            case "number":
            case "string":
                if (typeof(value) === type) { return; }
        }
    }

    const error: any = new Error(`invalid value for type ${ type }`);
    error.code = "INVALID_ARGUMENT";
    error.argument = `value.${ name }`;
    error.value = value;

    throw error;
}

/**
 *  Resolves to a new object that is a copy of %%value%%, but with all
 *  values resolved.
 */
export async function resolveProperties<T>(value: { [ P in keyof T ]: T[P] | Promise<T[P]>}): Promise<T> {
    const keys = Object.keys(value);
    const results = await Promise.all(keys.map((k) => Promise.resolve(value[<keyof T>k])));
    return results.reduce((accum: any, v, index) => {
        accum[keys[index]] = v;
        return accum;
    }, <{ [ P in keyof T]: T[P] }>{ });
}

/**
 *  Assigns the %%values%% to %%target%% as read-only values.
 *
 *  It %%types%% is specified, the values are checked.
 */
export function defineProperties<T>(
 target: T,
 values: { [ K in keyof T ]?: T[K] },
 types?: { [ K in keyof T ]?: string }): void {

    for (let key in values) {
        let value = values[key];

        const type = (types ? types[key]: null);
        if (type) { checkType(value, type, key); }

        Object.defineProperty(target, key, { enumerable: true, value, writable: false });
    }
}

export function checkProperties(object: any, properties: { [ name: string ]: boolean }): void {
    if (!object || typeof(object) !== "object") {
        logger.throwArgumentError("invalid object", "object", object);
    }

    Object.keys(object).forEach((key) => {
        if (!properties[key]) {
            logger.throwArgumentError("invalid object key - " + key, "transaction:" + key, object);
        }
    });
}