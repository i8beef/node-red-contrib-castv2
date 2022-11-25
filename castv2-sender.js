module.exports = function(RED) {
    "use strict";
    const util = require('util');
    const net = require('net');
    const BonjourService = require('bonjour-service');

    const Client = require('castv2-client').Client;

    const MediaReceiverBase = require('./lib/MediaReceiverBase');
    const DefaultMediaReceiver = require('./lib/DefaultMediaReceiver');
    const DefaultMediaReceiverAdapter = require('./lib/DefaultMediaReceiverAdapter');
    const DashCastReceiver = require('./lib/DashCastReceiver');
    const DashCastReceiverAdapter = require('./lib/DashCastReceiverAdapter');
    const GenericMediaReceiver = require('./lib/GenericMediaReceiver');
    const GenericMediaReceiverAdapter = require('./lib/GenericMediaReceiverAdapter');
    const YouTubeReceiver = require('./lib/YouTubeReceiver');
    const YouTubeReceiverAdapter = require('./lib/YouTubeReceiverAdapter');

    function CastV2ConnectionNode(config) {
        RED.nodes.createNode(this, config);

        let node = this;

        // Settings
        this.name = config.name;
        this.target = config.target;
        this.host = config.host;
        this.port = config.port;

        // Connection state
        this.connected = false;
        this.connecting = false;
        this.connectedIp = null;
        this.closing = false;

        // Nodes subscribed to this connection
        this.registeredNodes = {};
        this.platformStatus = null;

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
         * Call send() on all registered nodes
         */
        this.sendToRegisteredNodes = function(msg) {
            RED.util.setMessageProperty(msg, "_castTarget", node.connectedIp);
            for (let id in node.registeredNodes) {
                if (node.registeredNodes.hasOwnProperty(id)) {
                    node.registeredNodes[id].send(msg);
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
                    let mediaSupportingApp = null;
                    let castV2App = null;
                    if (node.platformStatus.applications) {
                        activeSession = node.platformStatus.applications
                            .find(session => node.registeredNodes[id].supportedApplications.some(supportedApp => supportedApp.APP_ID === session.appId));
                        if (activeSession) {
                            castV2App = node.registeredNodes[id].supportedApplications.find(supportedApp => supportedApp.APP_ID === activeSession.appId);
                        } else {
                            mediaSupportingApp = node.platformStatus.applications
                                .find(session => session.namespaces != null && session.namespaces.some(namespace => namespace.name === 'urn:x-cast:com.google.cast.media'));
                        }
                    }

                    if (activeSession && castV2App) {
                        node.registeredNodes[id].join(activeSession, castV2App);
                    } else if (mediaSupportingApp) {
                        node.registeredNodes[id].join(mediaSupportingApp, GenericMediaReceiver);
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
                try { node.client.close(); } catch (exception) { }
            }

            // Set connection status
            node.connectedIp = null;
            node.connected = false;
            node.connecting = false;

            // Disconnect all active sessions
            for (let id in node.registeredNodes) {
                if (node.registeredNodes.hasOwnProperty(id)) {
                    node.registeredNodes[id].unjoin();
                }
            }

            // Reset client
            node.client = null;
            node.platformStatus = null;
            
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

                    // The underlying castv2 client emits for all channels of all clients
                    // This is typically 3 channels for the actual connection, and at least 2 per receiver
                    node.client.client.setMaxListeners(100);

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

                    // Register secondary error handler
                    node.client.on("error", function(error) {
                        console.log(error);
                    });

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

                        node.sendToRegisteredNodes({ platform: status });
                    });

                    // Alert connecting state
                    node.setStatusOfRegisteredNodes({ fill: "yellow", shape: "ring", text: "connecting" });

                    // Connect
                    discoverCastTargetsAsync()
                        .then(castTargets => {
                            if (node.target) {
                                // Use target if supplied
                                let discoveredTarget = castTargets.find(x => x.name === node.target);
                                return {
                                    host: discoveredTarget != null ? discoveredTarget.address : "0.0.0.0",
                                    port: discoveredTarget != null ? discoveredTarget.port : 8009
                                };
                            } else {
                                return {
                                    host: node.host,
                                    port: node.port || 8009
                                };
                            }
                        })
                        .then(connectOptions => {
                            node.connectedIp = connectOptions.host;
                            return node.client.connectAsync(connectOptions);
                        })
                        .then(() => {
                            node.connected = true;
                            node.connecting = false;

                            // Set registered node status
                            node.setStatusOfRegisteredNodes({ fill: "green", shape: "ring", text: "connected" });

                            return node.client.getStatusAsync();
                        })
                        .then(status => {
                            node.platformStatus = status;

                            // Send initial cast device platform status
                            node.sendToRegisteredNodes({ platform: status });

                            // Join all nodes
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
            try {
                node.closing = true;
                node.disconnect();
                done();
            } catch(error) {
                // Swallow any failures here
                done();
            }
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
                        return node.client.stopAsync(receiver)
                            .then(applications => {
                                return node.client.getStatusAsync();
                            });
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
        this.supportedApplications = [
            DefaultMediaReceiver,
            DashCastReceiver,
            YouTubeReceiver
        ];

        this.receiver = null;
        this.adapter = null;
        this.launching = false;

        // Media control commands handled by any active receiver
        this.mediaCommands = [
            "GET_STATUS",
            "PAUSE",
            "PLAY",
            "QUEUE_NEXT",
            "QUEUE_PREV",
            "SEEK",
            "STOP"
        ];

        let node = this;

        /*
         * Joins this node to the active receiver on the client connection
         */
        this.join = function(activeSession, castV2App) {
            // Ignore launches triggered by self launching in sendCommandAsync
            if (node.launching) return;

            // Only join if not already joined up
            if (node.receiver == null || !(node.receiver instanceof castV2App)) {
                node.clientNode.joinSessionAsync(activeSession, castV2App)
                    .then(receiver => node.initReceiver(receiver, castV2App));
            }
        };

        /*
         * Disconnects this node from the active receiver on the client connection
         */
        this.unjoin = function() {
            node.adapter = null;

            if (node.receiver != null) {
                try { node.receiver.close(); } catch (e) { }
                node.receiver = null;
            }

            node.status({ fill: "green", shape: "ring", text: "connected" });
        };

        /*
         * Initializes a receiver after launch or join
         */
        this.initReceiver = function(receiver, castV2App) {
            node.adapter = node.getAdapter(castV2App);
            node.receiver = node.adapter.initReceiver(node, receiver);

            node.receiver.on("status", function(status) {
                if (status) {
                    const msg = { _castTarget: node.clientNode.connectedIp, payload: status };
                    node.send(msg);
                }
            });

            node.receiver.once("close", function() {
                node.adapter = null;
                node.receiver = null;
                node.status({ fill: "green", shape: "ring", text: "connected" });
            });

            node.status({ fill: "green", shape: "dot", text: "joined" });

            // Send initial receiver state
            if (typeof node.receiver.getStatusAsync === "function") {
                node.receiver.getStatusAsync()
                .then(status => {
                    if (status) {
                        const msg = { _castTarget: node.clientNode.connectedIp, payload: status };
                        node.send(msg);
                    }
                });
            }
        };

        /*
         * Gets adapter for specified application
         */
        this.getAdapter = function(castV2App) {
            switch (castV2App.APP_ID) {
                case DefaultMediaReceiver.APP_ID:
                    return DefaultMediaReceiverAdapter;
                    break;
                case GenericMediaReceiver.APP_ID:
                    return GenericMediaReceiverAdapter;
                    break;
                case DashCastReceiver.APP_ID:
                    return DashCastReceiverAdapter;
                    break;
                case YouTubeReceiver.APP_ID:
                    return YouTubeReceiverAdapter;
                    break;
                default:
                    return null;
                    break;
            }
        }

        /*
         * Gets application for command
         */
        this.getCommandApp = function(command) {
            switch (command.app) {
                case "DefaultMediaReceiver":
                    return DefaultMediaReceiver;
                    break;
                case "DashCast":
                    return DashCastReceiver;
                    break;
                case "YouTube":
                    return YouTubeReceiver;
                    break;
                default:
                    return null;
                    break;
            }
        }

        /*
         * General command handler
         */
        this.sendCommandAsync = function(command) {
            let isPlatformCommand = node.clientNode.platformCommands.includes(command.type);
            let isMediaCommand = node.mediaCommands.includes(command.type);
            if (isPlatformCommand) {
                return node.clientNode.sendPlatformCommandAsync(command, node.receiver);
            } else if (isMediaCommand) {
                // If no active receiver, error
                if (!node.receiver || !node.adapter) {
                    // Calling GET_STATUS without a receiver should just return null
                    if (command.type === "GET_STATUS") {
                        return Promise.resolve(null);
                    }

                    throw new Error("No active receiver application");
                }

                // Ensure the receiver supports media commands
                if (!(node.receiver instanceof MediaReceiverBase)) {
                    throw new Error("Receiver does not support media commands");
                }

                return node.sendMediaCommandAsync(command);
            } else {
                // App specific command, determine app
                let castV2App = node.getCommandApp(command);

                // If no active receiver, launch and try again
                if (!node.receiver || !node.adapter || !(node.receiver instanceof castV2App)) {
                    node.launching = true;

                    return node.clientNode.launchAsync(castV2App)
                        .then(receiver => {
                            node.initReceiver(receiver, castV2App);
                            node.launching = false;

                            return node.adapter.sendAppCommandAsync(node.receiver, command);
                        })
                        .catch(error => {
                            // Ensure on failure we cleanup launching lock
                            node.launching = false;
                            throw error;
                        });
                }

                return node.adapter.sendAppCommandAsync(node.receiver, command);
            }
        };

        /*
         * Media command handler
         */
        this.sendMediaCommandAsync = function(command) {
            if (command.type === "GET_STATUS") {
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
                                if (status.supportedMediaCommands & 2 && command.time) {
                                    return node.receiver.seekAsync(command.time);
                                }
                                break;
                            case "STOP":
                                return node.receiver.stopAsync();
                                break;
                            case "QUEUE_NEXT":
                                // bypass check as workaround of a google issue that does not add
                                // the QUEUE_NEXT bit in supportedMediaCommands for DefaultMediaReceiver
                                // https://issuetracker.google.com/issues/139939455
                                let bypassCheckNext = 
                                    node.receiver.session.appId === DefaultMediaReceiver.APP_ID 
                                    && status.items.length > 1;
                                if (bypassCheckNext || status.supportedMediaCommands & 64) {
                                    return node.receiver.queueNextAsync();
                                }
                                break;
                            case "QUEUE_PREV":
                                // bypass check as workaround of a google issue that does not add
                                // the QUEUE_PREV bit in supportedMediaCommands for DefaultMediaReceiver
                                // https://issuetracker.google.com/issues/139939455
                                let bypassCheckPrev = 
                                    node.receiver.session.appId === DefaultMediaReceiver.APP_ID 
                                    && status.items.length > 1;
                                if (bypassCheckPrev || status.supportedMediaCommands & 128) {
                                    return node.receiver.queuePrevAsync();
                                }
                                break;
                            default:
                                throw new Error("Malformed media control command");
                                break;
                        }
                    });
            }
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

                // Reset the node status
                if (node.receiver != null && node.adapter != null) {
                    node.status({ fill: "green", shape: "dot", text: "joined" });
                } else if (node.clientNode.connected) {
                    node.status({ fill: "green", shape: "ring", text: "connected" });
                } else {
                    node.status({ fill: "red", shape: "ring", text: "disconnected" });
                }

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

                    if (msg.payload.app == null) {
                        msg.payload.app = "DefaultMediaReceiver";
                    }

                    node.sendCommandAsync(msg.payload)
                        .then(status => {
                            // Handle solicited messages
                            status = status || null;
                            if (msg.payload.type === "GET_CAST_STATUS" || msg.payload.type === "GET_VOLUME") {
                                RED.util.setMessageProperty(msg, "_castTarget", node.clientNode.connectedIp);
                                RED.util.setMessageProperty(msg, "platform", status);
                                send(msg);
                            } else if (msg.payload.type === "GET_STATUS") {
                                RED.util.setMessageProperty(msg, "_castTarget", node.clientNode.connectedIp);
                                RED.util.setMessageProperty(msg, "platform", status);
                                send(msg);
                            }

                            if (done) done();
                        })
                        .catch(error => errorHandler(error));
                } catch (exception) { errorHandler(exception); }
            });

            /*
            * Node-red close handler
            */
            this.on('close', function(done) {
                try {
                    if (node.clientNode) {
                        node.clientNode.deregister(node, function() {
                            node.adapter = null;

                            if (node.receiver != null) {
                                try { node.receiver.close(); } catch (e) { }
                                node.receiver = null;
                            }

                            node.launching = false;

                            done();
                        });
                    } else {
                        done();
                    }
                } catch(error) {
                    // swallow any errors here
                    done();
                }
            });
        } else {
            node.status({ fill: "red", shape: "ring", text: "unconfigured" });
        }
    }

    RED.nodes.registerType("castv2-sender", CastV2SenderNode);

    /*
     * Expose discover endpoint for connection targets
     */
    RED.httpAdmin.get('/googleCastDevices', (req, res) => {
        discoverCastTargetsAsync()
            .then(castTargets => {
                res.json(castTargets);
            })
            .catch(error => res.send(500));
    });

    /*
     * Discover cast targets
     */
    function discoverCastTargetsAsync() {
        return new Promise((resolve, reject) => {
            try {
                const bonjour = new BonjourService.Bonjour();
                const castTargets = [];
                const bonjourBrowser = bonjour.find(
                    { type: 'googlecast' },
                    service => {
                        castTargets.push({
                            name: service.txt.fn,
                            address: service.addresses.find(address => net.isIPv4(address)),
                            port: service.port
                        });
                    });

                // await responses
                setTimeout(() => {
                    try {
                        bonjourBrowser.stop();
                        bonjour.destroy();
                        resolve(castTargets);
                    } catch (error) {
                        reject(error);
                    }
                }, 3000);
            } catch (error) {
                reject(error);
            }
        });
    };
}