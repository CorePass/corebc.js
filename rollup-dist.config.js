"use strict";

// This files has a lot of overlap with rollup-pre-alias.config.js
// - should we pull some of this functionality out?

import commonjs from '@rollup/plugin-commonjs';
import resolveNode from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";

import sourcemaps from 'rollup-plugin-sourcemaps';

function addBcryptoReplace(plugins) {
    plugins.push(replace({
        "require('./native/bn')": "/*RicMoo:ethers*/require('./js/bn')",
        include: "**/bcrypto/lib/bn.js",
        delimiters: [ '', '' ]
    }));

    return plugins;
}

function addUtilsReplace(plugins) {

    // Remove the buffer check from BN.js
    plugins.push(replace({
        "require('buffer')": "/*RicMoo:ethers:require(buffer)*/(null)",
        include: "**/lib/bn.js",
        delimiters: [ '', '' ]
    }));

    // Remove the util from inhjerits (forces browser inherits)
    plugins.push(replace({
        "require('util')": "/*RicMoo:ethers:require(util)*/(null)",
        include: "**/inherits/inherits.js",
        delimiters: [ '', '' ]
    }));

    return plugins;
}

function addLangReplace(plugins) {

    plugins.push(replace({
        'require("./wordlists")': 'require("./browser-wordlists")/*RicMoo:ethers:require(wordlists)*/',
        include: "**/wordlists/lib/index.js",
        delimiters: [ '', '' ]
    }));

    return plugins;
}

function getUmdConfig() {
    const plugins = [ ];

    plugins.push(sourcemaps());

    addUtilsReplace(plugins);
    addLangReplace(plugins);

    plugins.push(resolveNode({
        mainFields: [ "browser", "main" ]
    }));
    plugins.push(commonjs({ }));

    return {
        input: `packages/corebc/lib/index.js`,
        output: {
            file: `packages/corebc/dist/corebc.umd.js`,
            format: "umd",
            name: "corebc",
            sourcemap: true
        },
        context: "window",
        treeshake: false,
        plugins
    };
}

function getEsmConfig() {
    const plugins = [ ];

    plugins.push(sourcemaps());

    addBcryptoReplace(plugins);
    addUtilsReplace(plugins);

    plugins.push(resolveNode({ }));
    plugins.push(commonjs({ }));

    return {
        input: `packages/corebc/lib.esm/index.js`,
        output: {
            file: `packages/corebc/dist/corebc.esm.js`,
            format: "esm",
            sourcemap: true
        },
        context: "window",
        treeshake: false,
        plugins
    };
}

/*
function getConfig() {
    const plugins = [ ];

    // Remove the buffer check from BN.js
    plugins.push(replace({
        "require('buffer')": "/ * RicMoo:ethers * /(null)",
        include: "* * / lib/bn.js",
        delimiters: [ '', '' ]
    }));
    plugins.push(resolveNode({
        preferBuiltins: true
    }));
    plugins.push(commonjs({ }));

    return {
        input: `packages/ethers/lib.esm/index.js`,
        output: {
            file: `packages/ethers/dist/test-esm.js`,
            //preserveModules: true,
            format: "esm",
            //name: `ethers`,
            sourcemap: true,
            exports: "named"
        },
        context: "window",
        treeshake: false,
        //external,
        plugins
    };
}
*/
const configs = [
    getEsmConfig(),
    getUmdConfig()
];

export default configs;
