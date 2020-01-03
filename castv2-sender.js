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

        let node = this;

        // Initialize status
        this.status({ fill: "green", shape: "dot", text: "idle" });

        /*
         * Global error handler
         */
        this.onError = function(error) {
            if (node.client) {
                try {
                    node.client.close();
                }
                catch (exception) {
                    // swallow failures to close
                }
            }

            node.status({ fill: "red", shape: "dot", text: "error" });
            node.error(error);
        };

        /*
         * Status handler
         */
        this.onStatus = function(error, status) {
            if (error) return node.onError(error);

            if (node.client) {
                try {
                    node.client.close();
                }
                catch (exception) {
                    // swallow failures to close
                }
            }

            node.status({ fill: "green", shape: "dot", text: "idle" });
            node.context().set("status", status);

            if (status) node.send({ payload: status });
        };

        /*
         * Volume handler
         */
        this.onVolume = function(error, volume) {
            if (error) return node.onError(error);

            node.context().set("volume", volume);

            // Update the node status
            node.client.getStatus(node.onStatus);
        };

        /*
         * Media command handler
         */
        this.sendMediaCommand = function(receiver, command) {
            // Check for load commands
            if (command.type === "MEDIA") {
                // Load or queue media command
                if (command.media) {
                    if (Array.isArray(command.media)) {
                        // Queue handling
                        let mediaOptions = command.mediaOptions || { startIndex: 0, repeatMode: "REPEAT_OFF" };
                        let queueItems = node.buildQueueItems(command.media);
                        return receiver.queueLoad(
                            queueItems,
                            mediaOptions,
                            node.onStatus);
                    } else {
                        // Single media handling
                        let mediaOptions = command.mediaOptions || { autoplay: true };
                        return receiver.load(
                            node.buildMediaObject(command.media),
                            mediaOptions,
                            node.onStatus);
                    }
                }
            } else if (command.type === "TTS") {
                // Text to speech
                if (command.text) {
                    let speed = command.speed || 1;
                    let language = command.language || "en";

                    // Get castable URL
                    return googletts(command.text, language, speed).then(url => {
                        let media = node.buildMediaObject({
                            url: url,
                            contentType: "audio/mp3",
                            title: command.title ? command.title : "tts"
                        });

                        receiver.load(
                            media,
                            { autoplay: true },
                            node.onStatus);
                    }, reason => {
                        node.onError(reason);
                    });
                }
            }

            // Initialize media controller by calling getStatus first
            return receiver.getStatus((statusError, status) => {
                if (statusError) return node.onError(statusError);

                // Theres not actually anything playing, exit gracefully
                if (!status) return node.onStatus(null, status);

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
                            return receiver.pause(node.onStatus);
                        }
                        break;
                    case "PLAY":
                        return receiver.play(node.onStatus);
                        break;
                    case "SEEK":
                        if (command.time && status.supportedMediaCommands & 2) {
                            return receiver.seek(command.time, node.onStatus);
                        }
                        break;
                    case "STOP":
                        return receiver.stop(node.onStatus);
                        break;
                }

                // Nothing executed, return the current status
                return node.onError("Malformed media control command");
            });
        };

        /*
         * Cast command handler
         */
        this.sendCastCommand = function(receiver, command) {
            node.status({ fill: "yellow", shape: "dot", text: "sending" });

            // Check for platform commands first
            switch (command.type) {
                case "CLOSE":
                    return node.client.stop(receiver, (err, applications) => node.onStatus(err, null));
                    break;
                case "GET_VOLUME":
                    return node.client.getVolume(node.onVolume);
                    break;
                case "GET_STATUS":
                    return node.client.getStatus(node.onStatus);
                case "MUTE":
                    return node.client.setVolume({ muted: true }, node.onVolume);
                    break;
                case "UNMUTE":
                    return node.client.setVolume({ muted: false }, node.onVolume);
                    break;
                case "VOLUME":
                    if (command.volume && command.volume >= 0 && command.volume <= 100) {
                        return node.client.setVolume({ level: command.volume / 100 }, node.onVolume);
                    }
                    break;
                default:
                    // If media receiver attempt to execute media commands
                    if (receiver instanceof DefaultMediaReceiver) {
                        return node.sendMediaCommand(receiver, command);
                    }
                    break;
            }

            // If it got this far just error
            return node.onError("Malformed command");
        };

        /*
         * Node-red input handler
         */
        this.on("input", function(msg) {
            // Validate incoming message
            if (msg.payload == null || typeof msg.payload !== "object") {
                msg.payload = { type: "GET_STATUS" };
            }

            try {
                // Setup client
                node.client = new Client();
                node.client.on("error", node.onError);

                // Execute command
                let connectOptions = { host: msg.host || node.host };

                node.client.connect(connectOptions, () => {
                    node.status({ fill: "green", shape: "dot", text: "connected" });

                    // Allow for override of app to start / command
                    let app = DefaultMediaReceiver;
                    if (msg.appId && msg.appId !== "") {
                        // Build a generic application to pass into castv2 that will only support launch and close
                        let GenericApplication = function(client, session) { Application.apply(this, arguments); };
                        util.inherits(GenericApplication, Application);
                        GenericApplication.APP_ID = msg.appId;

                        app = GenericApplication;
                    }
                    
                    node.client.getAppAvailability(app.APP_ID, (getAppAvailabilityError, availability) => {
                        if (getAppAvailabilityError) return node.onError(getAppAvailabilityError);

                        // Only attempt to use the app if its available
                        if (!availability || !(app.APP_ID in availability) || availability[app.APP_ID] === false) return node.onStatus(null, null);

                        // Get current sessions
                        node.client.getSessions((getSessionsError, sessions) => {
                            if (getSessionsError) return node.onError(getSessionsError);

                            let activeSession = sessions.find(session => session.appId === app.APP_ID);
                            if (activeSession) {
                                // Join active Application session
                                node.client.join(activeSession, app, (joinError, receiver) => {
                                    if (joinError) return node.onError(joinError);

                                    node.status({ fill: "green", shape: "dot", text: "joined" });
                                    node.sendCastCommand(receiver, msg.payload);
                                });
                            } else {
                                // Launch new Application session
                                node.client.launch(app, (launchError, receiver) => {
                                    if (launchError) return node.onError(launchError);

                                    node.status({ fill: "green", shape: "dot", text: "launched" });
                                    node.sendCastCommand(receiver, msg.payload);            
                                });
                            }
                        });
                    });
                });
            } catch (exception) {
                node.onError(exception.message);
            }
        });

        /*
         * Build a media object
         */
        this.buildMediaObject = function(media) {
            let urlParts = media.url.split("/");
            let fileName = urlParts.slice(-1)[0].split("?")[0];
            return {
                /* MediaInformation */
                contentId : media.url,
                contentType: media.contentType || node.getContentType(fileName),
                streamType: media.streamType || "BUFFERED",
                metadata: {
                    metadataType: media.metadataType || 0,
                    /* GenericMediaMetadata (metadataType: 0) */
                    title: media.title || fileName,
                    subtitle: media.subtitle || null,
                    images: [
                        { url: media.image || "https://nodered.org/node-red-icon.png" }
                    ],
                    releaseDate: media.releaseDate,
                    /* Additional MovieMediaMetadata (metadataType: 1) */
                    studio: media.studio,
                    /* Additional TvShowMediaMetadata (metadataType: 2) */
                    seriesTitle: media.seriesTitle,
                    season: media.season,
                    episode: media.episode,
                    originalAirDate: media.originalAirDate,
                    /* Additional MusicTrackMediaMetadata (metadataType: 3) */
                    albumName: media.albumName,
                    albumArtist: media.albumArtist,
                    artist: media.artist,
                    composer: media.composer,
                    trackNumber: media.trackNumber,
                    discNumber: media.discNumber,
                    /* Additional PhotoMediaMetadata (metadataType: 4) */
                    location: media.location,
                    latitude: media.latitude,
                    longitude: media.longitude,
                    width: media.width,
                    height: media.height,
                    creationDateTime: media.creationDateTime,
                },
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
