"use strict";
const util = require('util');
const castv2Cli = require('castv2-client');
const Application = castv2Cli.Application;
const DashCastController = require('./DashCastController');

function DashCastReceiver(client, session) {
    Application.apply(this, arguments);

    this.dashcast = this.createController(DashCastController);
    this.dashcast.on('status', onstatus);

    function onstatus(status) {
        self.emit('status', status);
    }
}

DashCastReceiver.APP_ID = '5C3F0A3C';

util.inherits(DashCastReceiver, Application);

DashCastReceiver.prototype.close = function() {
    this.dashcast.close();
    this.dashcast = null;
    Application.prototype.close.call(this);
};

DashCastReceiver.prototype.load = function(url, options, callback) {
    this.dashcast.load.apply(this.dashcast, arguments);
};

module.exports = DashCastReceiver;
