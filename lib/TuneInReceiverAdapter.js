"use strict";
const util = require('util');
const TuneInReceiver = require('./TuneInReceiver');

function TuneInReceiverAdapter() {}
TuneInReceiverAdapter.castV2App = TuneInReceiver;

/*
* Extends receiver for async usage
*/
TuneInReceiverAdapter.initReceiver = function(node, receiver) {
    receiver.getStatusAsync = util.promisify(receiver.getStatus);
    receiver.pauseAsync = util.promisify(receiver.pause);
    receiver.playAsync = util.promisify(receiver.play);
    receiver.seekAsync = util.promisify(receiver.seek);
    receiver.stopAsync = util.promisify(receiver.stop);

    return receiver;
};

/*
* App command handler
*/
TuneInReceiverAdapter.sendAppCommandAsync = function(receiver, command) {
    throw new Error("Unknown command");
};

module.exports = TuneInReceiverAdapter;