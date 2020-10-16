"use strict";
const util = require('util');
const YouTubeReceiver = require('./YouTubeReceiver');

function YouTubeReceiverAdapter() {}
YouTubeReceiverAdapter.castV2App = YouTubeReceiver;

/*
* Extends receiver for async usage
*/
YouTubeReceiverAdapter.initReceiver = function(node, receiver) {
    receiver.getStatusAsync = util.promisify(receiver.getStatus);
    receiver.loadAsync = util.promisify(receiver.load);
    receiver.pauseAsync = util.promisify(receiver.pause);
    receiver.playAsync = util.promisify(receiver.play);
    receiver.seekAsync = util.promisify(receiver.seek);
    receiver.stopAsync = util.promisify(receiver.stop);
    receiver.queueNextAsync = util.promisify(receiver.queueNext);
    receiver.queuePrevAsync = util.promisify(receiver.queuePrev);

    return receiver;
};

/*
* App command handler
*/
YouTubeReceiverAdapter.sendAppCommandAsync = function(receiver, command) {
    // Check for load commands
    if (command.type === "MEDIA" && command.videoId) {
        return receiver.loadAsync(command.videoId);
    } else {
        throw new Error("Unknown command");
    }
};

module.exports = YouTubeReceiverAdapter;