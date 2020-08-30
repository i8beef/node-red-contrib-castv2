"use strict";
const util = require('util');
const castv2Cli = require('castv2-client');
const Application = castv2Cli.Application;
const MediaController = require('./MediaController');

function MediaReceiverBase(client, session) {
    Application.apply(this, arguments);

    var self = this;

    this.media = this.createController(MediaController);
    this.media.on('status', onstatus);

    function onstatus(status) {
        self.emit('status', status);
    }
}

util.inherits(MediaReceiverBase, Application);

MediaReceiverBase.prototype.close = function() {
    this.media.close();
    this.media = null;
    Application.prototype.close.call(this);
};

MediaReceiverBase.prototype.getStatus = function(callback) {
    this.media.getStatus.apply(this.media, arguments);
};

MediaReceiverBase.prototype.play = function(callback) {
    this.media.play.apply(this.media, arguments);
};

MediaReceiverBase.prototype.pause = function(callback) {
    this.media.pause.apply(this.media, arguments);
};

MediaReceiverBase.prototype.stop = function(callback) {
    this.media.stop.apply(this.media, arguments);
};

MediaReceiverBase.prototype.seek = function(currentTime, callback) {
    this.media.seek.apply(this.media, arguments);
};

MediaReceiverBase.prototype.queueNext = function(callback) {
    this.media.queueNext.apply(this.media, arguments);
};

MediaReceiverBase.prototype.queuePrev = function(callback) {
    this.media.queuePrev.apply(this.media, arguments);
};

module.exports = MediaReceiverBase;