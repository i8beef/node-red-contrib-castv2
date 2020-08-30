"use strict";
const util = require('util');
const MediaReceiverBase = require('./MediaReceiverBase');
const YouTubeController = require('./YouTubeController');

function YouTubeReceiver(client, session) {
    MediaReceiverBase.apply(this, arguments);

    var self = this;

    this.youtube = this.createController(YouTubeController);
    this.youtube.on('status', onstatus);

    function onstatus(status) {
        self.emit('status', status);
    }
}

YouTubeReceiver.APP_ID = '233637DE';

util.inherits(YouTubeReceiver, MediaReceiverBase);

YouTubeReceiver.prototype.close = function() {
    this.youtube.close();
    this.youtube = null;
    MediaReceiverBase.prototype.close.call(this);
};

YouTubeReceiver.prototype.load = function(videoId, callback) {
    this.youtube.load.apply(this.youtube, arguments);
};

module.exports = YouTubeReceiver;
