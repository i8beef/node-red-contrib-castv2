"use strict";
const util = require('util');
const GenericMediaReceiver = require('./GenericMediaReceiver');

function GenericMediaReceiverAdapter() {}
GenericMediaReceiverAdapter.castV2App = GenericMediaReceiver;

/*
* Extends receiver for async usage
*/
GenericMediaReceiverAdapter.initReceiver = function(node, receiver) {
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
GenericMediaReceiverAdapter.sendAppCommandAsync = function(receiver, command) {
    throw new Error("Unknown command");
};

module.exports = GenericMediaReceiverAdapter;