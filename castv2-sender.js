module.exports = function(RED) {
    "use strict";
    const Client = require("castv2-client").Client;
    const DefaultMediaReceiver = require("castv2-client").DefaultMediaReceiver;
    const googletts = require('google-tts-api');

    function CastV2SenderNode(config) {
        RED.nodes.createNode(this, config);

        // Settings
        this.name = config.name;
        this.host = config.host;

        let node = this;

        // Initialize status
        this.status({
            fill: "green",
            shape: "dot",
            text: "idle"
        });

        /*
         * Global error handler
         */
        this.onError = function(error) {
            node.client.close();

            node.status({
                fill: "red",
                shape: "dot",
                text: "error"
            });

            node.error(error);
        };

        /*
         * Status handler
         */
        this.onStatus = function(error, status) {
            if (error) return node.onError(error);
            node.context().set("status", status)
        };

        /*
         * Volume handler
         */
        this.onVolume = function(error, volume) {
            if (error) return node.onError(error);
            node.context().set("volume", volume)
        };

        /*
         * Case command handler
         */
        this.sendCastCommand = function(receiver, command) {
            // Initialize status and volume
            receiver.getStatus(node.onStatus);
            node.client.getVolume(node.onVolume);

            node.status({
                fill: "yellow",
                shape: "dot",
                text: "sending"
            });

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
                    if (command.currentTime) {
                        receiver.seek(command.currentTime, node.onStatus);
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
                                command.media,
                                { startIndex: 1, repeatMode: "REPEAT_OFF" },
                                node.onStatus);
                        } else {
                            // Single media handling
                            receiver.load(
                                command.media,
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
                            let media = {
                                contentId: url,
                                contentType: "audio/mp3",
                                imageUrl: "https://nodered.org/node-red-icon.png",
                                contentTitle: command.contentTitle ? command.contentTitle : "tts"
                            };

                            receiver.load(
                                media,
                                { autoplay: true },
                                node.onStatus);
                        });
                    }
                    break;
            }

            // Get current status update
            receiver.getStatus(node.onStatus);
        };

        /*
         * Node-red input handler
         */
        this.on("input", function(msg) {
            // Validate incoming message
            if (msg.payload == null || typeof msg.payload !== "object") {
                msg.payload = { type: "GET_STATUS" };
            }

            // Setup client
            node.client = new Client();
            node.client.on("error", node.onError);
            node.client.on("status", node.onStatus);

            // Execute command
            let connectOptions = { host: msg.host || node.host };
            node.client.connect(connectOptions, () => {
                node.status({
                    fill: "yellow",
                    shape: "dot",
                    text: "connected"
                });

                // Get current status
                node.client.getSessions((getSessionsError, sessions) => {
                    if (getSessionsError) return node.onError(getSessionsError);

                    let activeSession = sessions.find(session => session.appId === DefaultMediaReceiver.APP_ID);
                    if (activeSession) {
                        // Join active DefaultMediaReceiver session
                        node.client.join(activeSession, DefaultMediaReceiver, (joinError, receiver) => {
                            if (joinError) return node.onError(joinError);

                            node.sendCastCommand(receiver, msg.payload);
                        });
                    } else {
                        // Launch new DefaultMediaReceiver session
                        node.client.launch(DefaultMediaReceiver, (launchError, receiver) => {
                            if (launchError) return node.onError(launchError);

                            node.sendCastCommand(receiver, msg.payload);            
                        });
                    }
                });

                node.client.close();
            });

            node.status({
                fill: "green",
                shape: "dot",
                text: "idle"
            });

            let status = node.context().get("status");
            node.send({ payload: status });
        });
    }

    RED.nodes.registerType("castv2-sender", CastV2SenderNode);
}