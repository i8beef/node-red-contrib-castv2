"use strict";
const util = require('util');
const castv2Cli = require('castv2-client');
const RequestResponseController = castv2Cli.RequestResponseController;

function DashCastController(client, sourceId, destinationId) {
    RequestResponseController.call(this, client, sourceId, destinationId, 'urn:x-cast:es.offd.dashcast');

    this.on('message', onmessage);
    this.once('close', onclose);

    var self = this;

    function onmessage(data, broadcast) {
        if (broadcast) {
            if (!data) return;

            self.emit('status', data);
        }
    }

    function onclose() {
        self.removeListener('message', onmessage);
    }
}

util.inherits(DashCastController, RequestResponseController);

DashCastController.prototype.load = function (url, options, callback) {
    if (typeof options === 'function' || typeof options === 'undefined') {
        callback = options;
        options = {};
    }

    var data = { url: url };

    data.force = (typeof options.force !== 'undefined')
        ? options.force
        : false;

    data.reload = (typeof options.reload !== 'undefined')
        ? options.reload
        : 0;

    this.request(data, function(err, response) {
        if (err) return callback(err);
        callback(null, response);
    });
};

module.exports = DashCastController;
