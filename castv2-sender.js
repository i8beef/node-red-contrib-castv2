module.exports = function(RED) {
    "use strict";
    const Client = require("castv2-client").Client;
    const DefaultMediaReceiver = require("castv2-client").DefaultMediaReceiver;
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
            node.client.close();
            node.status({ fill: "red", shape: "dot", text: "error" });
            node.error(error);
        };

        /*
         * Status handler
         */
        this.onStatus = function(error, status) {
            if (error) return node.onError(error);

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
         * Case command handler
         */
        this.sendCastCommand = function(receiver, command) {
            node.status({ fill: "yellow", shape: "dot", text: "sending" });

            switch (command.type) {
                case "GET_VOLUME":
                    node.client.getVolume(node.onVolume);
                    break;
                case "MUTE":
                    node.client.setVolume({ muted: true }, node.onVolume);
                    break;
                case "PAUSE":
                    receiver.pause(node.onStatus);
                    break;
                case "PLAY":
                    receiver.play(node.onStatus);
                    break;
                case "SEEK":
                    if (command.time) {
                        receiver.seek(command.time, node.onStatus);
                    }
                    break;
                case "STOP":
                    receiver.stop(node.onStatus);
                    break;
                case "VOLUME":
                    if (command.volume && command.volume >= 0 && command.volume <= 100) {
                        node.client.setVolume({ level: command.volume / 100 }, node.onVolume);
                    }
                    break;
                case "UNMUTE":
                    node.client.setVolume({ muted: false }, node.onVolume);
                    break;
                case "MEDIA":
                    if (command.media) {
                        if (Array.isArray(command.media)) {
                            // Queue handling
                            receiver.queueLoad(
                                command.media.map(node.buildMediaObject),
                                { startIndex: 1, repeatMode: "REPEAT_OFF" },
                                node.onStatus);
                        } else {
                            // Single media handling
                            receiver.load(
                                node.buildMediaObject(command.media),
                                { autoplay: true },
                                node.onStatus);
                        }
                    }
                    break;
                case "TTS":
                    if (command.text) {
                        let speed = command.speed || 1;
                        let language = command.language || "en";

                        // Get castable URL
                        googletts(command.text, language, speed).then(url => {
                            let media = node.buildMediaObject({
                                url: url,
                                contentType: "audio/mp3",
                                title: command.title ? command.title : "tts"
                            });

                            receiver.load(
                                media,
                                { autoplay: true },
                                node.onStatus);
                        });
                    }
                    break;
                default:
                    // Note there seems to be a bug with receiver.getStatus not working
                    node.client.getStatus(node.onStatus);
                    break;
            }
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
                //node.client.on("status", status => node.onStatus(null, status));

                // Execute command
                let connectOptions = { host: msg.host || node.host };
                node.client.connect(connectOptions, () => {
                    node.status({ fill: "green", shape: "dot", text: "connected" });

                    // Get current status
                    node.client.getSessions((getSessionsError, sessions) => {
                        if (getSessionsError) return node.onError(getSessionsError);

                        let activeSession = sessions.find(session => session.appId === DefaultMediaReceiver.APP_ID);
                        if (activeSession) {
                            // Join active DefaultMediaReceiver session
                            node.client.join(activeSession, DefaultMediaReceiver, (joinError, receiver) => {
                                if (joinError) return node.onError(joinError);

                                if (!receiver.media.currentSession) {
                                    // Trick to deal with joined session instantiation issue
                                    receiver.getStatus((statusError, status) => { node.sendCastCommand(receiver, msg.payload); });
                                } else {
                                    node.sendCastCommand(receiver, msg.payload);
                                }
                            });
                        } else {
                            // Launch new DefaultMediaReceiver session
                            node.client.launch(DefaultMediaReceiver, (launchError, receiver) => {
                                if (launchError) return node.onError(launchError);

                                node.sendCastCommand(receiver, msg.payload);            
                            });
                        }
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
            let fileName = media.contentId.split("/")[-1].split("?"[0]);
            return {
                contentId : media.url,
                contentType: media.contentType || node.getContentType(fileName),
                streamType: media.streamType || "BUFFERED",
                metadata: {
                    metadataType: 0,
                    title: media.title || fileName,
                    subtitle: null,
                    images: [
                        { url: media.image || "https://nodered.org/node-red-icon.png" }
                    ]
                }
            };
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

            let ext = fileName.split(".")[-1];
            contentType = contentTypeMap[ext.toLowerCase()];

            return contentType || "audio/basic";
        };
    }

    RED.nodes.registerType("castv2-sender", CastV2SenderNode);
}