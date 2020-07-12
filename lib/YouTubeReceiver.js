var util              = require('util');
var castv2Cli         = require('castv2-client');
var Application       = castv2Cli.Application;
var MediaController   = require('./MediaController');
var YouTubeController = require('./YouTubeController');

function YouTubeReceiver(client, session) {
  Application.apply(this, arguments);

  this.media = this.createController(MediaController);
  this.youtube = this.createController(YouTubeController);

  this.media.on('status', onstatus);

  var self = this;

  function onstatus(status) {
    self.emit('status', status);
  }
}

YouTubeReceiver.APP_ID = '233637DE';

util.inherits(YouTubeReceiver, Application);

YouTubeReceiver.prototype.close = function() {
  this.media.close();
  this.media = null;
  this.youtube.close();
  this.youtube = null;
  Application.prototype.close.call(this);
};

YouTubeReceiver.prototype.getStatus = function(callback) {
  this.media.getStatus.apply(this.media, arguments);
};

YouTubeReceiver.prototype.load = function(videoId, callback) {
  this.youtube.load.apply(this.youtube, arguments);
};

YouTubeReceiver.prototype.play = function(callback) {
  this.media.play.apply(this.media, arguments);
};

YouTubeReceiver.prototype.pause = function(callback) {
  this.media.pause.apply(this.media, arguments);
};

YouTubeReceiver.prototype.stop = function(callback) {
  this.media.stop.apply(this.media, arguments);
};

YouTubeReceiver.prototype.seek = function(currentTime, callback) {
  this.media.seek.apply(this.media, arguments);
};

module.exports = YouTubeReceiver;
