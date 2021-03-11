"use strict";
const util = require('util');
const DashCastReceiver = require('./DashCastReceiver');

function DashCastReceiverAdapter() {}
DashCastReceiverAdapter.castV2App = DashCastReceiver;

/*
* Extends receiver for async usage
*/
DashCastReceiverAdapter.initReceiver = function(node, receiver) {
    receiver.loadAsync = util.promisify(receiver.load);

    return receiver;
};

/*
* App command handler
*/
DashCastReceiverAdapter.sendAppCommandAsync = function(receiver, command) {
    // Check for load commands
    if (command.type === "LOAD" && command.url) {
        let options = {};
        options.force = (typeof command.force !== 'undefined')
            ? command.force
            : false;

        options.reload = (typeof command.reload !== 'undefined')
            ? command.reload
            : 0;

        return receiver.loadAsync(command.url, options);
    } else {
        throw new Error("Unknown command");
    }
};

module.exports = DashCastReceiverAdapter;
