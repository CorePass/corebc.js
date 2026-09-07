'use strict';

var data = require('./data.js');

// utils/base64-browser
function decodeBase64(textData) {
    textData = atob(textData);
    const data$1 = new Uint8Array(textData.length);
    for (let i = 0; i < textData.length; i++) {
        data$1[i] = textData.charCodeAt(i);
    }
    return data.getBytes(data$1);
}
function encodeBase64(_data) {
    const data$1 = data.getBytes(_data);
    let textData = "";
    for (let i = 0; i < data$1.length; i++) {
        textData += String.fromCharCode(data$1[i]);
    }
    return btoa(textData);
}

exports.decodeBase64 = decodeBase64;
exports.encodeBase64 = encodeBase64;
//# sourceMappingURL=base64-browser.js.map
