"use strict";
const util = require('util');
const DefaultMediaReceiver = require('./DefaultMediaReceiver');

function DefaultMediaReceiverAdapter() {}
DefaultMediaReceiverAdapter.castV2App = DefaultMediaReceiver;

/*
* Extends receiver for async usage
*/
DefaultMediaReceiverAdapter.initReceiver = function(node, receiver) {
    receiver.getStatusAsync = util.promisify(receiver.getStatus);
    receiver.loadAsync = util.promisify(receiver.load);
    receiver.queueLoadAsync = util.promisify(receiver.queueLoad);
    receiver.pauseAsync = util.promisify(receiver.pause);
    receiver.playAsync = util.promisify(receiver.play);
    receiver.seekAsync = util.promisify(receiver.seek);
    receiver.stopAsync = util.promisify(receiver.stop);
    receiver.queueNextAsync = util.promisify(receiver.queueNext);
    receiver.queuePrevAsync = util.promisify(receiver.queuePrev);

    return receiver;
};

/*
* App command handler
*/
DefaultMediaReceiverAdapter.sendAppCommandAsync = function(receiver, command) {
    // Check for load commands
    if (command.type === "MEDIA" && command.media) {
        if (Array.isArray(command.media)) {
            // Queue handling
            let mediaOptions = command.mediaOptions || { startIndex: 0, repeatMode: "REPEAT_OFF" };
            let queueItems = DefaultMediaReceiverAdapter.buildQueueItems(command.media);
            return receiver.queueLoadAsync(queueItems, mediaOptions);
        } else {
            // Single media handling
            let mediaOptions = command.mediaOptions || { autoplay: true };
            return receiver.loadAsync(DefaultMediaReceiverAdapter.buildMediaObject(command.media), mediaOptions);
        }
    } else if (command.type === "TTS" && command.text) {
        if (command.text.length > 200) {
            throw new Error("text length should be less than 200 characters");
        }

        let speed = command.speed || 1;
        let language = command.language || "en";

        // Get castable URL
        let metadata = command.metadata || {};
        metadata.title = metadata.title || "tts";

        let url = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=" + language + "&ttsspeed=" + speed + "&q=" + encodeURIComponent(command.text);
        let media = DefaultMediaReceiverAdapter.buildMediaObject({ url: url, contentType: "audio/mp3", metadata: metadata });

        return receiver.loadAsync(media, { autoplay: true });
    } else {
        throw new Error("Unknown command");
    }
};

/*
* Build a media object
*/
DefaultMediaReceiverAdapter.buildMediaObject = function(media) {
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
        contentType: media.contentType || DefaultMediaReceiverAdapter.getContentType(fileName),
        streamType: media.streamType || "BUFFERED",
        metadata: metadata,
        textTrackStyle: media.textTrackStyle,
        tracks: media.tracks
    };
};

/*
* Builds a queue item list from passed media arguments
*/
DefaultMediaReceiverAdapter.buildQueueItems = function(media) {
    return media.map((item, index) => {
        return {
            autoplay: true,
            preloadTime: 5,
            orderId: index,
            activeTrackIds: [],
            media: DefaultMediaReceiverAdapter.buildMediaObject(item)
        };
    })
};

/*
* Get content type for a URL
*/
DefaultMediaReceiverAdapter.getContentType = function(fileName) {
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
        mp4: "video/mp4",
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

module.exports = DefaultMediaReceiverAdapter;
