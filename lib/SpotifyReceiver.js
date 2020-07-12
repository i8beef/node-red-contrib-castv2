var util              = require('util');
var castv2Cli         = require('castv2-client');
var Application       = castv2Cli.Application;
var MediaController   = require('./MediaController');
var SpotifyController = require('./SpotifyController');

function SpotifyReceiver(client, session) {
  Application.apply(this, arguments);

  this.media = this.createController(MediaController);
  this.spotify = this.createController(SpotifyController);

  this.media.on('status', onstatus);

  var self = this;

  function onstatus(status) {
    self.emit('status', status);
  }
}

SpotifyReceiver.APP_ID = 'CC32E753';

util.inherits(SpotifyReceiver, Application);

SpotifyReceiver.prototype.close = function() {
  this.media.close();
  this.media = null;
  this.spotify.close();
  this.spotify = null;
  Application.prototype.close.call(this);
};

SpotifyReceiver.prototype.authenticate = function(accessToken, accessTokenExpiration, deviceName, callback) {
  this.spotify.authenticate.apply(this.Spotify, arguments);
};

SpotifyReceiver.prototype.getStatus = function(callback) {
  this.media.getStatus.apply(this.media, arguments);
};

SpotifyReceiver.prototype.load = function(opt, callback) {
  this.spotify.load.apply(this.Spotify, arguments);
};

SpotifyReceiver.prototype.play = function(callback) {
  this.media.play.apply(this.media, arguments);
};

SpotifyReceiver.prototype.pause = function(callback) {
  this.media.pause.apply(this.media, arguments);
};

SpotifyReceiver.prototype.stop = function(callback) {
  this.media.stop.apply(this.media, arguments);
};

SpotifyReceiver.prototype.seek = function(currentTime, callback) {
  this.media.seek.apply(this.media, arguments);
};

SpotifyReceiver.prototype.queueNext = function(callback) {
  this.media.queueNext.apply(this.media, arguments);
};

SpotifyReceiver.prototype.queuePrev = function(callback) {
  this.media.queuePrev.apply(this.media, arguments);
};

module.exports = SpotifyReceiver;
