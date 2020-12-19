"use strict";
const util = require('util');
const MediaReceiverBase = require('./MediaReceiverBase');

function GenericMediaReceiver(client, session) {
    MediaReceiverBase.apply(this, arguments);
}

GenericMediaReceiver.APP_ID = null;

util.inherits(GenericMediaReceiver, MediaReceiverBase);

module.exports = GenericMediaReceiver;
