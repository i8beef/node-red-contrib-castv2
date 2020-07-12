"use strict";
const util = require('util');
const GooglePlayMoviesReceiver = require('./GooglePlayMoviesReceiver');

function GooglePlayMoviesReceiverAdapter() {}
GooglePlayMoviesReceiverAdapter.castV2App = GooglePlayMoviesReceiver;

/*
* Extends receiver for async usage
*/
GooglePlayMoviesReceiverAdapter.initReceiver = function(node, receiver) {
    receiver.getStatusAsync = util.promisify(receiver.getStatus);
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
GooglePlayMoviesReceiverAdapter.sendAppCommandAsync = function(receiver, command) {
    throw new Error("Unknown command");
};

module.exports = GooglePlayMoviesReceiverAdapter;