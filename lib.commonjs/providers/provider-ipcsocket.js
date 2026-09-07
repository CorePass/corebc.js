'use strict';

var net = require('net');
var providerSocket = require('./provider-socket.js');

/// <reference types="node" preserve="true" />
// @TODO: Is this sufficient? Is this robust? Will newlines occur between
// all payloads and only between payloads?
function splitBuffer(data) {
    const messages = [];
    let lastStart = 0;
    while (true) {
        const nl = data.indexOf(10, lastStart);
        if (nl === -1) {
            break;
        }
        messages.push(data.subarray(lastStart, nl).toString().trim());
        lastStart = nl + 1;
    }
    return { messages, remaining: data.subarray(lastStart) };
}
class IpcSocketProvider extends providerSocket.SocketProvider {
    #socket;
    get socket() {
        return this.#socket;
    }
    constructor(path, network) {
        super(network);
        this.#socket = net.connect(path);
        this.socket.on("ready", async () => {
            try {
                await this._start();
            }
            catch (error) {
                console.log("failed to start IpcSocketProvider", error);
                // @TODO: Now what? Restart?
            }
        });
        let response = Buffer.alloc(0);
        this.socket.on("data", (data) => {
            response = Buffer.concat([
                response,
                typeof data === "string" ? Buffer.from(data) : data,
            ]);
            const { messages, remaining } = splitBuffer(response);
            messages.forEach((message) => {
                this._processMessage(message);
            });
            response = remaining;
        });
        this.socket.on("end", () => {
            this.emit("close");
            this.socket.destroy();
            this.socket.end();
        });
    }
    destroy() {
        this.socket.destroy();
        this.socket.end();
        super.destroy();
    }
    async _write(message) {
        this.socket.write(message);
    }
}

exports.IpcSocketProvider = IpcSocketProvider;
//# sourceMappingURL=provider-ipcsocket.js.map
