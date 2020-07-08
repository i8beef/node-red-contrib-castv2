module.exports = function(RED) {
    "use strict";
    const util = require('util');
    const Client = require("castv2-client").Client;
    const DefaultMediaReceiver = require("castv2-client").DefaultMediaReceiver;
    const googletts = require("google-tts-api");

    function CastV2ConnectionNode(config) {
        RED.nodes.createNode(this, config);

        let node = this;

        // Settings
        this.name = config.name;
        this.host = config.host;
        this.port = config.port;

        // Connection state
        this.connected = false;
        this.connecting = false;
        this.closing = false;

        // Nodes subscribed to this connection
        this.registeredNodes = {};
        this.platformStatus = null;

        // Build connection options
        this.connectOptions = {
            host: this.host,
            port: this.port || 8009
        };
        
        // Platform commands handled by client directly
        this.platformCommands = [
            "CLOSE",
            "GET_VOLUME",
            "GET_CAST_STATUS",
            "MUTE",
            "UNMUTE",
            "VOLUME"
        ];

        /*
         * Launches session
         */
        this.launchAsync = function(castV2App) {
            if (!node.connected) {
                throw new Error("Not connected");
            }

            return node.client.launchAsync(castV2App);
        };

        /*
         * Join session
         */
        this.joinSessionAsync = function(activeSession, castv2App) {
            if (!node.connected) {
                throw new Error("Not connected");
            }

            return node.client.joinAsync(activeSession, castv2App)
        };

        /*
         * Registers a node
         */
        this.register = function(castV2Node) {
            node.registeredNodes[castV2Node.id] = castV2Node;
            if (Object.keys(node.registeredNodes).length === 1) {
                node.connect();
            }
        };

        /*
         * Deregisters a node
         */
        this.deregister = function(castV2Node, done) {
            delete node.registeredNodes[castV2Node.id];
            if (node.closing) {
                return done();
            }

            if (Object.keys(node.registeredNodes).length === 0) {
                if (node.connected || node.connecting) {
                    node.disconnect();
                }
            }

            done();
        };

        /*
         * Call status() on all registered nodes
         */
        this.setStatusOfRegisteredNodes = function(status) {
            for (let id in node.registeredNodes) {
                if (node.registeredNodes.hasOwnProperty(id)) {
                    node.registeredNodes[id].status(status);
                }
            }
        }

        /*
         * Joins all nodes matching current sessions
         */
        this.joinNodes = function() {
            if (!node.connected || !node.platformStatus) {
                throw new Error("Not connected");
            }

            // Update all registered nodes
            for (let id in node.registeredNodes) {
                if (node.registeredNodes.hasOwnProperty(id)) {
                    let activeSession = null;
                    if (node.platformStatus.applications) {
                        activeSession = node.platformStatus.applications.find(session => session.appId === node.registeredNodes[id].castV2App.APP_ID);
                    }

                    if (activeSession) {
                        node.registeredNodes[id].join(activeSession);
                    } else {
                        node.registeredNodes[id].unjoin();
                    }
                }
            }
        };

        /*
         * Disconnect handler
         */
        this.disconnect = function() {
            if (node.connected || node.connecting) {
                try {
                    node.client.close();
                } catch (exception) {
                    // Swallow close exceptions
                }
            }
            
            // Reset client
            node.client = null;
            node.platformStatus = null;
            node.connected = false;
            node.connecting = false;

            // Disconnect all active sessions
            for (let id in node.registeredNodes) {
                if (node.registeredNodes.hasOwnProperty(id)) {
                    node.registeredNodes[id].unjoin();
                }
            }

            node.setStatusOfRegisteredNodes({ fill: "red", shape: "ring", text: "disconnected" });
        };

        /*
         * Reconnect handler
         */
        this.reconnect = function() {
            node.connected = false;
            node.connecting = false;

            if (!node.closing && Object.keys(node.registeredNodes).length > 0) {
                clearTimeout(node.reconnectTimeOut);
                node.reconnectTimeOut = setTimeout(() => { node.connect(); }, 3000);    
            }
        };

        /*
         * Connect handler
         */
        this.connect = function() {
            if (!node.connected && !node.connecting) {
                node.reconnectTimeOut = null;
                node.connecting = true;

                try {
                    node.client = new Client();

                    // Setup promisified methods
                    node.client.connectAsync = connectOptions => new Promise(resolve => node.client.connect(connectOptions, resolve));
                    node.client.getAppAvailabilityAsync = util.promisify(node.client.getAppAvailability);
                    node.client.getSessionsAsync = util.promisify(node.client.getSessions);
                    node.client.joinAsync = util.promisify(node.client.join);
                    node.client.launchAsync = util.promisify(node.client.launch);
                    node.client.getStatusAsync = util.promisify(node.client.getStatus);
                    node.client.getVolumeAsync = util.promisify(node.client.getVolume);
                    node.client.setVolumeAsync = util.promisify(node.client.setVolume);
                    node.client.stopAsync = util.promisify(node.client.stop);

                    // Register error handler
                    node.client.once("error", function(error) {
                        node.disconnect();
                        node.reconnect();
                    });
                    
                    // Register disconnect handlers
                    node.client.client.once("close", function() {
                        node.disconnect();
                        node.reconnect();
                    });

                    // Register platform status handler
                    node.client.on("status", function(status) {
                        node.platformStatus = status;
                        node.joinNodes();
                    });
                    
                    // Alert connecting state
                    node.setStatusOfRegisteredNodes({ fill: "yellow", shape: "ring", text: "connecting" });

                    // Connect
                    node.client.connectAsync(node.connectOptions)
                        .then(() => {
                            node.connected = true;
                            node.connecting = false;

                            // Set registered node status
                            node.setStatusOfRegisteredNodes({ fill: "green", shape: "ring", text: "connected" });

                            return node.client.getStatusAsync();
                        })
                        .then(status => {
                            node.platformStatus = status;
                            node.joinNodes();
                        })
                        .catch(error => {
                            console.log(error);
                            node.disconnect();
                            node.reconnect();
                         });
                } catch (exception) { console.log(exception); }
            }
        };

        /*
         * Close handler
         */
        this.on('close', function(done) {
            node.closing = true;

            node.disconnect();

            done();
        });
        
        /*
         * Cast command handler
         */
        this.sendPlatformCommandAsync = function(command, receiver) {
            if (!node.connected) {
                throw new Error("Not connected");
            }

            // Check for platform commands first
            switch (command.type) {
                case "CLOSE":
                    if (receiver) {
                        return node.client.stopAsync(receiver);
                    } else {
                        return node.client.getStatusAsync();
                    }
                    break;
                case "GET_VOLUME":
                    return node.client.getVolumeAsync()
                        .then(volume => node.client.getStatusAsync());
                    break;
                case "GET_CAST_STATUS":
                    return node.client.getStatusAsync();
                    break;
                case "MUTE":
                    return node.client.setVolumeAsync({ muted: true })
                        .then(volume => node.client.getStatusAsync());
                    break;
                case "UNMUTE":
                    return node.client.setVolumeAsync({ muted: false })
                        .then(volume => node.client.getStatusAsync());
                    break;
                case "VOLUME":
                    if (command.volume && command.volume >= 0 && command.volume <= 100) {
                        return node.client.setVolumeAsync({ level: command.volume / 100 })
                            .then(volume => node.client.getStatusAsync());
                    } else {
                        throw new Error("Malformed command");
                    }
                    break;
                default:
                    // If it got this far just error
                    throw new Error("Malformed command");
                    break;
            }
        };
    }

    RED.nodes.registerType("castv2-connection", CastV2ConnectionNode);

    function CastV2SenderNode(config) {
        RED.nodes.createNode(this, config);

        // Settings
        this.name = config.name;
        this.connection = config.connection;
        this.clientNode = RED.nodes.getNode(this.connection);

        // Internal state
        this.castV2App = DefaultMediaReceiver;
        this.receiver = null;

        let node = this;

        /*
         * Joins this node to the active receiver on the client connection
         */
        this.join = function(activeSession) {
            node.clientNode.joinSessionAsync(activeSession, node.castV2App)
                .then(receiver => node.initReceiver(receiver));
        };

        /*
         * Disconnects this node from the active receiver on the client connection
         */
        this.unjoin = function() {
            node.receiver = null
            node.status({ fill: "green", shape: "ring", text: "connected" });
        };

        /*
         * Initializes a receiver after launch or join
         */
        this.initReceiver = function(receiver) {
            node.receiver = receiver;
            node.receiver.getStatusAsync = util.promisify(node.receiver.getStatus);
            node.receiver.loadAsync = util.promisify(node.receiver.load);
            node.receiver.queueLoadAsync = util.promisify(node.receiver.queueLoad);
            node.receiver.pauseAsync = util.promisify(node.receiver.pause);
            node.receiver.playAsync = util.promisify(node.receiver.play);
            node.receiver.seekAsync = util.promisify(node.receiver.seek);
            node.receiver.stopAsync = util.promisify(node.receiver.stop);

            node.receiver.on("status", function(status) {
                node.send({ payload: status });
            });

            node.receiver.on("close", function() {
                node.receiver = null;
                node.status({ fill: "green", shape: "ring", text: "connected" });
            });

            node.status({ fill: "green", shape: "dot", text: "joined" });
        };

        /*
         * General command handler
         */
        this.sendCommandAsync = function(command) {
            let isPlatformCommand = node.clientNode.platformCommands.includes(command.type);
            if (isPlatformCommand) {
                return node.clientNode.sendPlatformCommandAsync(command, node.receiver);
            } else {
                return node.sendMediaCommandAsync(command);
            }
        };

        /*
         * Media command handler
         */
        this.sendMediaCommandAsync = function(command) {
            // If not active, launch and try again
            if (!node.receiver) {
                return node.clientNode.launchAsync(node.castV2App)
                    .then(receiver => {
                        node.initReceiver(receiver);
                        return node.sendMediaCommandAsync(command);
                    });
            }

            // Check for load commands
            if (command.type === "MEDIA") {
                // Load or queue media command
                if (command.media) {
                    if (Array.isArray(command.media)) {
                        // Queue handling
                        let mediaOptions = command.mediaOptions || { startIndex: 0, repeatMode: "REPEAT_OFF" };
                        let queueItems = node.buildQueueItems(command.media);
                        return node.receiver.queueLoadAsync(queueItems, mediaOptions);
                    } else {
                        // Single media handling
                        let mediaOptions = command.mediaOptions || { autoplay: true };
                        return node.receiver.loadAsync(node.buildMediaObject(command.media), mediaOptions);
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
                        .then(media => node.receiver.loadAsync(media, { autoplay: true }));
                }
            } else if (command.type === "GET_STATUS") {
                return node.receiver.getStatusAsync();
            } else {
                // Initialize media controller by calling getStatus first
                return node.receiver.getStatusAsync()
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
                                    return node.receiver.pauseAsync();
                                }
                                break;
                            case "PLAY":
                                return node.receiver.playAsync();
                                break;
                            case "SEEK":
                                if (command.time && status.supportedMediaCommands & 2) {
                                    return node.receiver.seekAsync(command.time);
                                }
                                break;
                            case "STOP":
                                return node.receiver.stopAsync();
                                break;
                            default:
                                throw new Error("Malformed media control command");
                                break;
                        }
                    });
            }
        };

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

        if (node.clientNode) {
            node.status({ fill: "red", shape: "ring", text: "disconnected" });
            node.clientNode.register(node);

            if (node.clientNode.connected) {
                node.status({ fill: "green", shape: "ring", text: "connected" });
            }

            /*
            * Node-red input handler
            */
            this.on("input", function(msg, send, done) {
                // For maximum backwards compatibility, check that send exists.
                // If this node is installed in Node-RED 0.x, it will need to
                // fallback to using `node.send`
                send = send || function() { node.send.apply(node, arguments); };

                const errorHandler = function(error) {
                    node.status({ fill: "red", shape: "ring", text: "error" });
    
                    if (done) { 
                        done(error);
                    } else {
                        node.error(error, error.message);
                    }
                };

                try {
                    // Validate incoming message
                    if (msg.payload == null || typeof msg.payload !== "object") {
                        msg.payload = { type: "GET_CAST_STATUS" };
                    }

                    node.sendCommandAsync(msg.payload)
                        .then(status => { 
                            if (done) done();
                        })
                        .catch(error => errorHandler(error));
                } catch (exception) { errorHandler(exception); }
            });

            /*
            * Node-red close handler
            */
            node.on('close', function(done) {
                if (node.clientNode) {
                    node.clientNode.deregister(node, function() {
                        node.receiver = null;
                        done();
                    });
                } else {
                    done();
                }
            });
        } else {
            node.status({ fill: "red", shape: "ring", text: "unconfigured" });
        }
    }

    RED.nodes.registerType("castv2-sender", CastV2SenderNode);
}