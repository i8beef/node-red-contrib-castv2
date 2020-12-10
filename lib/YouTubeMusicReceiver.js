"use strict";
const util = require('util');
const MediaReceiverBase = require('./MediaReceiverBase');

function YouTubeMusicReceiver(client, session) {
    MediaReceiverBase.apply(this, arguments);
}

YouTubeMusicReceiver.APP_ID = '2DB7CC49';

util.inherits(YouTubeMusicReceiver, MediaReceiverBase);

module.exports = YouTubeMusicReceiver;
