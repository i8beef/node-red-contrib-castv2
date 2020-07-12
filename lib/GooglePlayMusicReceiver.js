"use strict";
const util = require('util');
const MediaReceiverBase = require('./MediaReceiverBase');

function GooglePlayMusicReceiver(client, session) {
    MediaReceiverBase.apply(this, arguments);
}

GooglePlayMusicReceiver.APP_ID = '2872939A';

util.inherits(GooglePlayMusicReceiver, MediaReceiverBase);

module.exports = GooglePlayMusicReceiver;
