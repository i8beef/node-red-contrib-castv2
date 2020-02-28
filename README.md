# node-red-contrib-castv2

A Node-Red node that provides basic Google Cast functionality based on the node-castv2-client package.

## Getting Started

Install directly from your NodeRED's Setting Pallete

or

This assumes you have [node-red](http://nodered.org/) already installed and working, if you need to install node-red see [here](http://nodered.org/docs/getting-started/installation)

```shell
$ cd ~/.node-red
$ npm install node-red-contrib-castv2
```
## Usage

This package provides a single node, `castv2-sender`, which will be under the "functions" group in the pallete. The node exposes a single configuration setting, the IP address / host name of the target cast device, but this can be left empty and you can supply `msg.host` and optionally `msg.port` on the incoming message as well if that's easier. The node will always output the current google cast device state after every command.

A `msg.appId` can also be specified if you'd like to launch or control an app other than the default media casting application, for instance to launch a custom cast receiver, etc. This is experimental.

At a minimum, a msg.payload *must* be defined, and *must* conform to the format below. Be careful when sending results of other nodes in that it doesn't conflict in some way or unexpected results may occur. General msg format expected on input is as follows:

```js
{
  host: "1.1.1.1", // optional if specified on the node itself
  port: 8009, // optional, defaults to 8009
  appId: "", // optional, allows launching and controlling apps other than DefaultMediaReceiver
  payload: {
    type: "TYPE",
    ...
  }
}
```

The following commands are supported as `msg.payload.type`. Note `msg.payload` can be left `null` and on trigger the node will just output the current device status. Unless otherwise stated in the examples below, nothing else is necessary on the `msg.payload` except `msg.payload.type`.

| Command    | Example                                                          |
|------------|------------------------------------------------------------------|
| CLOSE      | Closes the current running application / cast session            |
| GET_STATUS | Gets status from current running application (not device)        |
| GET_VOLUME | Triggers a query to get current volume information (not used)    |
| MEDIA      | Load a single media file or queue multiple to play               |
| MUTE       | Mute cast device                                                 |
| PAUSE      | Pause current media                                              |
| PLAY       | Play current media                                               |
| SEEK       | Seek to time in current media                                    |
| STOP       | Stop playing current media without exiting application           |
| TTS        | Create a text-to-speech MP3 and cast to device                   |
| VOLUME     | Set volume of cast device                                        |
| UNMUTE     | Unmute cast device                                               |

#### MEDIA Example

```js
{
  host: "1.1.1.1",
  payload: {
    type: "MEDIA",
    media: {
      url: "http://test.com/media.mp3",
      contentType: "audio/mp3", // optional if type can be infered from url file type
      streamType: "BUFFERED", // optional unless you want to send LIVE instead
      metadata: { ... } // optional for extending default metadata such as title, images, etc.
    }
  }
}
```

Alternatively, you can send an array for `msg.payload.media` with a collection of objects of the same format to trigger loading a media queue to the cast device instead.

```js
{
  host: "1.1.1.1",
  port: 8009,
  payload: {
    type: "MEDIA",
    media: [
      { url: "http://test.com/media.mp3", ... },
      { url: "http://test.com/someOtherMedia.mp3", ... },
      ...
    ]
  }
}
```

The metadata object is optional, and is a straight pass through of Google's [metadata object structure](https://developers.google.com/cast/docs/reference/messages). Common overridable properties are `metadata.title`, `metadata.subtitle`, `metadata.images[]`. etc. See Google's documentation for other options. By default, the `metadata.metadataType` is `0`, meaning `GenericMediaMetadata`, but a different value can be passed in to allow support of extended metadata properties if needed.

#### TTS Example

```js
{
  host: "1.1.1.1",
  port: 8009,
  payload: {
    type: "TTS",
    text: "Something to say",
    speed: 1, // optional to adjust TTS speed, defaults to 1
    language: "en", // optional to set TTS language, default to en
    metadata: { // optional unless desired, follows normal metadata rules noted above
      title: "Media title" 
    }
  }
}
```

#### VOLUME Example

```js
{
  host: "1.1.1.1",
  port: 8009,
  payload: {
    type: "VOLUME",
    volume: 100 // 0 to 100
  }
}
```

#### SEEK Example

```js
{
  host: "1.1.1.1",
  port: 8009,
  payload: {
    type: "SEEK",
    time: 100 // Time to seek to in seconds
  }
}
```
