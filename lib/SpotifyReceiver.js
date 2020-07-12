"use strict";
const util = require('util');
const MediaReceiverBase = require('./MediaReceiverBase');
const SpotifyController = require('./SpotifyController');

function SpotifyReceiver(client, session) {
  MediaReceiverBase.apply(this, arguments);

  var self = this;

  this.spotify = this.createController(SpotifyController);
  this.spotify.on('status', onstatus);

  function onstatus(status) {
    self.emit('status', status);
  }
}

SpotifyReceiver.APP_ID = 'CC32E753';

util.inherits(SpotifyReceiver, MediaReceiverBase);

SpotifyReceiver.prototype.close = function() {
  this.spotify.close();
  this.spotify = null;
  MediaReceiverBase.prototype.close.call(this);
};

SpotifyReceiver.prototype.authenticate = function(accessToken, accessTokenExpiration, deviceName, callback) {
  this.spotify.authenticate.apply(this.Spotify, arguments);
};

SpotifyReceiver.prototype.load = function(opt, callback) {
  this.spotify.load.apply(this.Spotify, arguments);
};

module.exports = SpotifyReceiver;
