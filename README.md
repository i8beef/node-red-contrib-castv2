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

At a minimum, a msg.payload *must* be defined, and *must* conform to the format below. Be careful when sending results of other nodes in that it doesn't conflict in some way or unexpected results may occur. General msg format expected on input is as follows:

```js
{
  host: "1.1.1.1", // optional if specified on the node itself
  port: 8009, // optional, defaults to 8009
  payload: {
    app: "DefaultMediaReceiver", // optional, allows for controlling other supported apps
    type: "TYPE",
    ...
  }
}
```

### Platform Command Example

Platform commands refer to the global commands that the cast target supports regardless of what app is running. Typicall that is these:

| Command         | Example                                                          |
|-----------------|------------------------------------------------------------------|
| CLOSE           | Closes the current running application / cast session            |
| GET_CAST_STATUS | Gets status from cast device                                     |
| GET_VOLUME      | Triggers a query to get current volume information (not used)    |
| MUTE            | Mute cast device                                                 |
| VOLUME          | Set volume of cast device                                        |
| UNMUTE          | Unmute cast device                                               |

#### MUTE Example

```js
{
  host: "1.1.1.1",
  payload: {
    type: "MUTE"
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

### Media Command Example

Media commands are listed below. These tend to be global to most media apps. For any app supported by this module, these should be supported. You
do not need to include an app with these as the node will attempt to join any active sessions for supported apps automatically.


| Command         | Example                                                          |
|-----------------|------------------------------------------------------------------|
| PAUSE           | Pause current media                                              |
| PLAY            | Play current media                                               |
| SEEK            | Seek to time in current media                                    |
| STOP            | Stop playing current media without exiting application           |

#### STOP Example

```js
{
  host: "1.1.1.1",
  payload: {
    type: "STOP"
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

### DefaultMediaReceiver Command Example

These are the commands exposed by the DefaultMediaReceiver for playing generic media URLs. Because the "app" defaults to this, app CAN be omitted 
from the command. It is provided below for completeness.


| Command         | Example                                                          |
|-----------------|------------------------------------------------------------------|
| MEDIA           | Load a single media file or queue multiple to play               |
| TTS             | Create a text-to-speech MP3 and cast to device                   |

#### MEDIA Example

Loads media for DefaultMediaReceiver.

```js
{
  host: "1.1.1.1",
  payload: {
    app: "DefaultMediaReceiver",
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
    app: "DefaultMediaReceiver",
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
    app: "DefaultMediaReceiver",
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