"use strict";
const util = require('util');
const castv2Cli = require('castv2-client');
const RequestResponseController = castv2Cli.RequestResponseController;
const httpClient = require('request');

const YOUTUBE_BASE_URL = 'https://www.youtube.com/';
const LOUNGE_TOKEN_URL = YOUTUBE_BASE_URL + "api/lounge/pairing/get_lounge_token_batch";
const BIND_URL = YOUTUBE_BASE_URL + "api/lounge/bc/bind";

const sIdRegex = /"c","(.*?)","/g;
const playListIdRegex = /listId":"(.*?)"/g;
const gSessionIdRegex = /"S","(.*?)"]/g;

function YouTubeController(client, sourceId, destinationId) {
    RequestResponseController.call(this, client, sourceId, destinationId, 'urn:x-cast:com.google.youtube.mdx');

    this.currentSession = null;

    this.on('message', onmessage);
    this.once('close', onclose);

    var self = this;

    function onmessage(data, broadcast) {
        if (data.type === 'MEDIA_STATUS' && broadcast) {
          var status = data.status[0];
          // Sometimes an empty status array can come through; if so don't emit it
          if (!status) return;
          self.currentSession = status;
          self.emit('status', status);
        }
    }

    function onclose() {
        self.removeListener('message', onmessage);
    }
}

util.inherits(YouTubeController, RequestResponseController);

YouTubeController.prototype.load = function (videoId, callback) {
    var screenId, loungeToken;
    var sId, gSessionId, playlistId;

    // 1. Fetch screen ID
    this.controlRequest({ type: 'getMdxSessionStatus' }, function(err, response) {
        if (err) return callback(err);

        if (!response.data || !response.data.screenId) {
            return callback(new Error('Failed to fetch screenID'));
        } else {
            screenId = response.data.screenId;
        }

        // 2. Fetch lounge token
        var loungeTokenRequest = {
            'url': LOUNGE_TOKEN_URL,
            'headers': { "Origin": YOUTUBE_BASE_URL },
            'form': { 'screen_ids': screenId }
        };

        httpClient.post(loungeTokenRequest, function(loungeTokenErr, loungeTokenResponse, loungeTokenBody) {
            if (loungeTokenErr) return callback(loungeTokenErr);
            if (loungeTokenResponse.statusCode !== 200) return callback(new Error('Lounge token request failed'));

            var loungeTokenBodyParsed = JSON.parse(loungeTokenBody);
            loungeToken = loungeTokenBodyParsed.screens[0].loungeToken;

            // 3. Initialize queue
            var queueRequest = {
                'url': BIND_URL,
                'form': {
                    'count': 0
                },
                'qs': {
                    'device': 'REMOTE_CONTROL',
                    'id': '12345678-9ABC-4DEF-0123-0123456789AB',
                    'name': 'Desktop&app=youtube-desktop',
                    'mdx-version': 3,
                    'loungeIdToken': loungeToken,
                    'VER': 8,
                    'v': 2,
                    't': 1,
                    'ui': 1,
                    'RID': 75956,
                    'CVER': 1,
                    'method': 'setPlaylist',
                    'params': '%7B%22videoId%22%3A%22' + videoId + '%22%2C%22currentTime%22%3A5%2C%22currentIndex%22%3A0%7D',
                    'TYPE': ''
                }
            };

            httpClient.post(queueRequest, function(queueErr, queueResponse, queueBody) {
                if (queueErr) return callback(queueErr);
                if (queueResponse.statusCode !== 200) return callback(new Error('Queue request failed'));

                callback(null);
            });
        });
    });
};

YouTubeController.prototype.controlRequest = function (data, callback) {
    var self = this;

    function onmessage(response) {
        self.removeListener('message', onmessage);

        if (response.type === 'INVALID_REQUEST') {
            return callback(new Error('Invalid request: ' + response.reason));
        }

        callback(null, response);
    }

    this.on('message', onmessage);
    this.send(data);
};

module.exports = YouTubeController;
