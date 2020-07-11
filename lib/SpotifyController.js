const util = require('util');
const castv2Cli = require('castv2-client');
const RequestResponseController = castv2Cli.RequestResponseController;

function SpotifyController(client, sourceId, destinationId) {
    RequestResponseController.call(this, client, sourceId, destinationId, 'urn:x-cast:com.spotify.chromecast.secure.v1');

    this.deviceName = null;
    this.accessToken = null;
    this.accessTokenExpiration = null;

    this.on('message', onmessage);
    this.once('close', onclose);

    var self = this;

    function onmessage(data, broadcast) {
        if(data.type === 'MEDIA_STATUS' && broadcast) {
          var status = data.status[0];
          // Sometimes an empty status array can come through; if so don't emit it
          if (!status) return;
          self.currentSession = status;
          self.emit('status', status);
        }
    }

    function onclose() {
        self.removeListener('message', onmessage);
        self.stop();
    }
}

util.inherits(SpotifyController, RequestResponseController);

// TODO: Probably change this to handle the full credentials flow
SpotifyController.prototype.authenticate = function (accessToken, accessTokenExpiration, deviceName, callback) {
    this.deviceName = deviceName;
    this.accessToken = accessToken;
    this.accessTokenExpiration = accessTokenExpiration;

    this.api = new SpotifyWebApi({
        accessToken: this.accessToken
    });

    // Send setCredentials request using web AT
    this.send({
        type: 'setCredentials',
        credentials: this.accessToken,
        expiresIn: this.accessTokenExpiration
    });

    var self = this;
    function onSetCredentialsResponse(response) {
        if (message.type === 'setCredentialsResponse') {
            self.removeListener('message', onSetCredentialsResponse);

            if (response.type === 'setCredentialsError') {
                return callback(new Error('Invalid request: ' + response.reason));
            }

            // TODO: For future implementation
            // const devices = (await self.api.getMyDevices()).body.devices;
            // const device = devices.find(e => e.name === self.device_name);
            // if (device == null) {
            //     return callback(new Error('Unable to find device'));
            // }

            // self.device = device;

            callback(null, response);
        }
    }

    this.on('message', onSetCredentialsResponse);
};

SpotifyController.prototype.load = function (opt) {
    // TODO: For future implementation
	// opt.deviceId = this.device.id;
	// return this.api.play(opt);
};

module.exports = SpotifyController;
