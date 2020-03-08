module.exports = function(RED) {
    "use strict";
    const util = require('util');
    const Client = require("castv2-client").Client;
    const DefaultMediaReceiver = require("castv2-client").DefaultMediaReceiver;
    const Application = require('castv2-client').Application;
    const googletts = require("google-tts-api");

    function CastV2SenderNode(config) {
        RED.nodes.createNode(this, config);

        // Settings
        this.name = config.name;
        this.host = config.host;
        this.port = config.port;

        let node = this;

        // Initialize status
        this.status({ fill: "green", shape: "dot", text: "idle" });

        /*
         * Volume handler
         */
        this.onVolumeAsync = function(volume) {
            node.context().set("volume", volume);

            // Update the node status
            node.client.getStatusAsync = util.promisify(node.client.getStatus);
            return node.client.getStatusAsync();
        };

        /*
         * Media command handler
         */
        this.sendMediaCommandAsync = function(receiver, command) {
            receiver.getStatusAsync = util.promisify(receiver.getStatus);
            receiver.loadAsync = util.promisify(receiver.load);
            receiver.queueLoadAsync = util.promisify(receiver.queueLoad);
            receiver.pauseAsync = util.promisify(receiver.pause);
            receiver.playAsync = util.promisify(receiver.play);
            receiver.seekAsync = util.promisify(receiver.seek);
            receiver.stopAsync = util.promisify(receiver.stop);

            // Check for load commands
            if (command.type === "MEDIA") {
                // Load or queue media command
                if (command.media) {
                    if (Array.isArray(command.media)) {
                        // Queue handling
                        let mediaOptions = command.mediaOptions || { startIndex: 0, repeatMode: "REPEAT_OFF" };
                        let queueItems = node.buildQueueItems(command.media);
                        return receiver.queueLoadAsync(queueItems, mediaOptions);
                    } else {
                        // Single media handling
                        let mediaOptions = command.mediaOptions || { autoplay: true };
                        return receiver.loadAsync(node.buildMediaObject(command.media), mediaOptions);
                    }
                }
            } else if (command.type === "TTS") {
                // Text to speech
                if (command.text) {
                    let speed = command.speed || 1;
                    let language = command.language || "en";

                    // Get castable URL
                    return googletts(command.text, language, speed)
                        .then(url => node.buildMediaObject({ url: url, contentType: "audio/mp3", title: command.metadata && command.metadata.title ? command.metadata.title : "tts" }))
                        .then(media => receiver.loadAsync(media, { autoplay: true }));
                }
            } else if (command.type === "GET_APP_STATUS") {
                return receiver.getStatusAsync();
            } else {
                // Initialize media controller by calling getStatus first
                return receiver.getStatusAsync()
                    .then(status => {
                        // Theres not actually anything playing, exit gracefully
                        if (!status) throw new Error("not playing");

                        /*
                         * Execute media control command
                         * status.supportedMediaCommands bitmask
                         * 1     Pause
                         * 2     Seek
                         * 4     Stream volume
                         * 8     Stream mute
                         * 16    Skip forward
                         * 32    Skip backward
                         * 64    Queue Next
                         * 128   Queue Prev
                         * 256   Queue Shuffle
                         * 1024  Queue Repeat All
                         * 2048  Queue Repeat One
                         * 3072  Queue Repeat
                         */
                        switch (command.type) {
                            case "PAUSE":
                                if (status.supportedMediaCommands & 1) {
                                    return receiver.pauseAsync();
                                }
                                break;
                            case "PLAY":
                                return receiver.playAsync();
                                break;
                            case "SEEK":
                                if (command.time && status.supportedMediaCommands & 2) {
                                    return receiver.seekAsync(command.time);
                                }
                                break;
                            case "STOP":
                                return receiver.stopAsync();
                                break;
                            default:
                                throw new Error("Malformed media control command");
                                break;
                        }
                    });
            }
        };

        /*
         * Cast command handler
         */
        this.sendCastCommandAsync = function(receiver, command) {
            node.client.getStatusAsync = util.promisify(node.client.getStatus);
            node.client.getVolumeAsync = util.promisify(node.client.getVolume);
            node.client.setVolumeAsync = util.promisify(node.client.setVolume);
            node.client.stopAsync = util.promisify(node.client.stop);

            node.status({ fill: "yellow", shape: "dot", text: "sending" });

            // Check for platform commands first
            switch (command.type) {
                case "CLOSE":
                    return node.client.stopAsync(receiver);
                    break;
                case "GET_VOLUME":
                    return node.client.getVolumeAsync(receiver)
                        .then(volume => node.onVolumeAsync(volume));
                    break;
                case "GET_STATUS":
                    return node.client.getStatusAsync();
                    break;
                case "MUTE":
                    return node.client.setVolumeAsync({ muted: true })
                        .then(volume => node.onVolumeAsync(volume));
                    break;
                case "UNMUTE":
                    return node.client.setVolumeAsync({ muted: false })
                        .then(volume => node.onVolumeAsync(volume));
                    break;
                case "VOLUME":
                    if (command.volume && command.volume >= 0 && command.volume <= 100) {
                        return node.client.setVolumeAsync({ level: command.volume / 100 })
                            .then(volume => node.onVolumeAsync(volume));
                    } else {
                        throw new Error("Malformed command");
                    }
                    break;
                default:
                    // If media receiver attempt to execute media commands
                    if (receiver instanceof DefaultMediaReceiver) {
                        return node.sendMediaCommandAsync(receiver, command);
                    } else {
                        // If it got this far just error
                        throw new Error("Malformed command");
                    }
                    break;
            }
        };

        /*
         * Cleanup open connections
         */
        this.cleanup = function() {
            if (node.client) {
                try {
                    node.client.close();
                } catch (exception) { 
                    // Swallow close exceptions
                }
            }
        };

        /*
         * Node-red input handler
         */
        this.on("input", function(msg, send, done) {
            // For maximum backwards compatibility, check that send exists.
            // If this node is installed in Node-RED 0.x, it will need to
            // fallback to using `node.send`
            send = send || function() { node.send.apply(node, arguments); };

            const errorHandler = function(error) {
                node.status({ fill: "red", shape: "dot", text: "error" });
                node.cleanup();

                if (done) { 
                    done(error);
                } else {
                    node.error(error, error.message);
                }
            };

            try {
                // Validate incoming message
                if (msg.payload == null || typeof msg.payload !== "object") {
                    msg.payload = { type: "GET_STATUS" };
                }

                // Setup client
                node.client = new Client();
                node.client.on("error", errorHandler);
                node.client.connectAsync = connectOptions => new Promise(resolve => node.client.connect(connectOptions, resolve));
                node.client.getAppAvailabilityAsync = util.promisify(node.client.getAppAvailability);
                node.client.getSessionsAsync = util.promisify(node.client.getSessions);
                node.client.joinAsync = util.promisify(node.client.join);
                node.client.launchAsync = util.promisify(node.client.launch);

                let app = DefaultMediaReceiver;
                const connectOptions = {
                    host: msg.host || node.host,
                    port: msg.port || node.port
                };
                node.client.connectAsync(connectOptions)
                    .then(() => {
                        node.status({ fill: "green", shape: "dot", text: "connected" });

                        // Allow for override of app to start / command
                        if (msg.appId && msg.appId !== "") {
                            // Build a generic application to pass into castv2 that will only support launch and close
                            let GenericApplication = function(client, session) { Application.apply(this, arguments); };
                            util.inherits(GenericApplication, Application);
                            GenericApplication.APP_ID = msg.appId;
    
                            app = GenericApplication;
                        }

                        return node.client.getAppAvailabilityAsync(app.APP_ID);
                    })
                    .then(availability => {
                        // Only attempt to use the app if its available
                        if (!availability || !(app.APP_ID in availability) || availability[app.APP_ID] === false) {
                            throw new Error("unavailable");
                        }

                        return node.client.getSessionsAsync();
                    })
                    .then(sessions => {
                        // Join or launch new session
                        let activeSession = sessions.find(session => session.appId === app.APP_ID);
                        if (activeSession) {
                            return node.client.joinAsync(activeSession, app);
                        } else {
                            return node.client.launchAsync(app);
                        }
                    })
                    .then(receiver => {
                        node.status({ fill: "green", shape: "dot", text: "joined" });
                        return node.sendCastCommandAsync(receiver, msg.payload);    
                    })
                    .then(status => {
                        node.status({ fill: "green", shape: "dot", text: "idle" });
                        node.cleanup();
            
                        if (status) send({ payload: status });
                        if (done) done();
                    })
                    .catch(error => errorHandler(error));
            } catch (exception) { errorHandler(exception); }
        });

        /*
         * Node-red close handler
         */
        this.on('close', function() {
            node.cleanup();
        });

        /*
         * Build a media object
         */
        this.buildMediaObject = function(media) {
            let urlParts = media.url.split("/");
            let fileName = urlParts.slice(-1)[0].split("?")[0];
            let defaultMetadata = {
                metadataType: 0,
                title: fileName,
                subtitle: null,
                images: [
                    { url: "https://nodered.org/node-red-icon.png" }
                ]
            };
            let metadata = Object.assign({}, defaultMetadata, media.metadata);

            return {
                contentId : media.url,
                contentType: media.contentType || node.getContentType(fileName),
                streamType: media.streamType || "BUFFERED",
                metadata: metadata,
                textTrackStyle: media.textTrackStyle,
                tracks: media.tracks
            };
        };

        /*
         * Builds a queue item list from passed media arguments
         */
        this.buildQueueItems = function(media) {
            return media.map((item, index) => {
                return {
                    autoplay: true,
                    preloadTime: 5,
                    orderId: index,
                    activeTrackIds: [],
                    media: node.buildMediaObject(item)
                };
            })
        };

        /*
         * Get content type for a URL
         */
        this.getContentType = function(fileName) {
            const contentTypeMap = {
                "3gp": "video/3gpp",
                aac: "video/mp4",
                aif: "audio/x-aiff",
                aiff: "audio/x-aiff",
                aifc: "audio/x-aiff",
                avi: "video/x-msvideo",
                au: "audio/basic",
                bmp: "image/bmp",
                flv: "video/x-flv",
                gif: "image/gif",
                ico: "image/x-icon",
                jpe: "image/jpeg",
                jpeg: "image/jpeg",
                jpg: "image/jpeg",
                m3u: "audio/x-mpegurl",
                m3u8: "application/x-mpegURL",
                m4a: "audio/mp4",
                mid: "audio/mid",
                midi: "audio/mid",
                mov: "video/quicktime",
                movie: "video/x-sgi-movie",
                mpa: "audio/mpeg",
                mp2: "audio/x-mpeg",
                mp3: "audio/mp3",
                mp4: "audio/mp4",
                mjpg: "video/x-motion-jpeg",
                mjpeg: "video/x-motion-jpeg",
                mpe: "video/mpeg",
                mpeg: "video/mpeg",
                mpg: "video/mpeg",
                ogg: "audio/ogg",
                ogv: "audio/ogg",
                png: "image/png",
                qt: "video/quicktime",
                ra: "audio/vnd.rn-realaudio",
                ram: "audio/x-pn-realaudio",
                rmi: "audio/mid",
                rpm: "audio/x-pn-realaudio-plugin",
                snd: "audio/basic",
                stream: "audio/x-qt-stream",
                svg: "image/svg",
                tif: "image/tiff",
                tiff: "image/tiff",
                vp8: "video/webm",
                wav: "audio/vnd.wav",
                webm: "video/webm",
                webp: "image/webp",
                wmv: "video/x-ms-wmv"
            };

            let ext = fileName.split(".").slice(-1)[0];
            let contentType = contentTypeMap[ext.toLowerCase()];

            return contentType || "audio/basic";
        };
    }

    RED.nodes.registerType("castv2-sender", CastV2SenderNode);
}