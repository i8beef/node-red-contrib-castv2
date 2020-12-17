"use strict";
const util = require('util');
const MediaReceiverBase = require('./MediaReceiverBase');

function NetflixReceiver(client, session) {
    MediaReceiverBase.apply(this, arguments);
}

NetflixReceiver.APP_ID = 'CA5E8412';

util.inherits(NetflixReceiver, MediaReceiverBase);

module.exports = NetflixReceiver;
