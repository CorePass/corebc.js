'use strict';

var properties = require('./properties.js');

/**
 *  Explain events...
 *
 *  @_section api/utils/events:Events  [about-events]
 */
/**
 *  When an [[EventEmitterable]] triggers a [[Listener]], the
 *  callback always ahas one additional argument passed, which is
 *  an **EventPayload**.
 */
class EventPayload {
    /**
     *  The event filter.
     */
    filter;
    /**
     *  The **EventEmitterable**.
     */
    emitter;
    #listener;
    /**
     *  Create a new **EventPayload** for %%emitter%% with
     *  the %%listener%% and for %%filter%%.
     */
    constructor(emitter, listener, filter) {
        this.#listener = listener;
        properties.defineProperties(this, { emitter, filter });
    }
    /**
     *  Unregister the triggered listener for future events.
     */
    async removeListener() {
        if (this.#listener == null) {
            return;
        }
        await this.emitter.off(this.filter, this.#listener);
    }
}

exports.EventPayload = EventPayload;
//# sourceMappingURL=events.js.map
