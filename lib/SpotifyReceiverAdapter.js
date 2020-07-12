"use strict";
const util = require('util');
const SpotifyReceiver = require('./SpotifyReceiver');

function SpotifyReceiverAdapter() {}
SpotifyReceiverAdapter.castV2App = SpotifyReceiver;

/*
* Extends receiver for async usage
*/
SpotifyReceiverAdapter.initReceiver = function(node, receiver) {
    receiver.authenticateAsync = util.promisify(receiver.authenticate);
    receiver.getStatusAsync = util.promisify(receiver.getStatus);
    receiver.loadAsync = util.promisify(receiver.load);
    receiver.pauseAsync = util.promisify(receiver.pause);
    receiver.playAsync = util.promisify(receiver.play);
    receiver.seekAsync = util.promisify(receiver.seek);
    receiver.stopAsync = util.promisify(receiver.stop);
    receiver.queueNextAsync = util.promisify(receiver.queueNext);
    receiver.queuePrevAsync = util.promisify(receiver.queuePrev);

    if (node.settings &&
        node.settings.spotify &&
        node.settings.spotify.accessToken && node.settings.spotify.accessToken !== '' &&
        node.settings.spotify.accessTokenExpiration && node.settings.spotify.accessTokenExpiration !== '' &&
        node.settings.spotify.deviceName && node.settings.spotify.deviceName !== '') {
        // TODO: Determine the best way to handle the async hole here
        receiver.authenticateAsync(
            node.settings.spotify.accessToken,
            node.settings.spotify.accessTokenExpiration,
            node.settings.spotify.deviceName);
    }
    
    return receiver;
};

/*
* App command handler
*/
SpotifyReceiverAdapter.sendAppCommandAsync = function(receiver, command) {
    // Check for load commands
    if (command.type === "MEDIA") {
        // Load or queue media command
        if (command.media) {
            // Single media handling
            return receiver.loadAsync(command.media);
        }
    } else {
        throw new Error("Unknown command");
    }
};

module.exports = SpotifyReceiverAdapter;