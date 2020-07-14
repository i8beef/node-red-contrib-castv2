"use strict";
const util = require('util');
const MediaReceiverBase = require('./MediaReceiverBase');

function DefaultMediaReceiver(client, session) {
    MediaReceiverBase.apply(this, arguments);
}

DefaultMediaReceiver.APP_ID = 'CC1AD845';

util.inherits(DefaultMediaReceiver, MediaReceiverBase);

DefaultMediaReceiver.prototype.load = function(media, options, callback) {
    this.media.load.apply(this.media, arguments);
};

DefaultMediaReceiver.prototype.queueLoad = function(items, options, callback) {
    this.media.queueLoad.apply(this.media, arguments);
};

DefaultMediaReceiver.prototype.queueInsert = function(items, options, callback) {
    this.media.queueInsert.apply(this.media, arguments);
};

DefaultMediaReceiver.prototype.queueRemove = function(itemIds, options, callback) {
    this.media.queueRemove.apply(this.media, arguments);
};

DefaultMediaReceiver.prototype.queueReorder = function(itemIds, options, callback) {
    this.media.queueReorder.apply(this.media, arguments);
};

DefaultMediaReceiver.prototype.queueUpdate = function(items, callback) {
    this.media.queueUpdate.apply(this.media, arguments);
};

module.exports = DefaultMediaReceiver;
