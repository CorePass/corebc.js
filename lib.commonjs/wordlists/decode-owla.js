'use strict';

require('../utils/base58.js');
require('../logger/logger.js');
var errors = require('../utils/errors.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
var bitReader = require('./bit-reader.js');
var decodeOwl = require('./decode-owl.js');

/**
 *  @_ignore
 */
function decodeOwlA(data, accents) {
    let words = decodeOwl.decodeOwl(data).join(",");
    // Inject the accents
    accents.split(/,/g).forEach((accent) => {
        const match = accent.match(/^([a-z]*)([0-9]+)([0-9])(.*)$/);
        errors.assertArgument(match !== null, "internal error parsing accents", "accents", accents);
        let posOffset = 0;
        const positions = bitReader.decodeBits(parseInt(match[3]), match[4]);
        const charCode = parseInt(match[2]);
        const regex = new RegExp(`([${match[1]}])`, "g");
        words = words.replace(regex, (all, letter) => {
            const rem = --positions[posOffset];
            if (rem === 0) {
                letter = String.fromCharCode(letter.charCodeAt(0), charCode);
                posOffset++;
            }
            return letter;
        });
    });
    return words.split(",");
}

exports.decodeOwlA = decodeOwlA;
//# sourceMappingURL=decode-owla.js.map
