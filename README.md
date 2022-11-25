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

This package provides a single node, `castv2-sender`, which will be under the "castv2" group in the pallete. The node requires a configured connection, and allows for setting additional settings like authentication for supported cast applications. The node will output the current google cast device platform state or cast application state on published state changes.

At a minimum, a msg.payload *must* be defined, and *must* conform to the format below. Be careful when sending results of other nodes in that it doesn't conflict in some way or unexpected results may occur. General msg format expected on input is as follows:

```js
{
  payload: {
    app: "DefaultMediaReceiver", // optional, allows for controlling other supported apps
    type: "TYPE",
    ...
  }
}
```

### mDNS Discovery

Connection nodes can be set up to use either a static IP / port (default 8009), or mDNS discovery be advertised device name. The node-red instance must be running on the same subnet as the target cast device to use the mDNS discovery mechanism. If specified, the mDNS target will take precedence over any specified IP / port settings.

mDNS usage enabled the ability to maintain a stable connection to Cast Groups.

To use mDNS in Docker containers, the node-red instance must either be started with `--net=host`, or the multicast packets must be reflected into the Docker network by an image that has access to both networks. The below command will start an image that can do this without exposing the node-red instance to the host network, though any suitable reflector should do.

```
docker run --restart=always --name mdns-bridge -dit --net=host wquist/mdns-bridge:latest <HOSTINTERFACE>
```

If you are using ARM/V6-architecture you could use the following Docker image:
```
docker run --restart=always --name mdns-bridge -dit --net=host monstrenyatko/mdns-repeater:latest --env MDNS_REPEATER_INTERFACES="eth0 docker0"
```
if eth0 is you're hostinterface and docker0 is you're dockerinterface.


## Command Types

There are three "types" of commands supported by this node: Platform, Media, and App specific.

<ul>
  <li>Platform - Commands for the cast device itself, such as launching/closing apps, volume control, etc.</li>
  <li>Media - Generic media commands like PLAY, PAUSE, etc.</li>
  <li>App specific - Cast app specific commands, requiring specific implementation within this node to support.</li>
</ul>

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
  payload: {
    type: "MUTE"
  }
}
```

#### VOLUME Example

```js
{
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
| QUEUE_NEXT      | Play next media item                                             |
| QUEUE_PREV      | Play previous media item                                         |

#### STOP Example

```js
{
  payload: {
    type: "STOP"
  }
}
```

#### SEEK Example

```js
{
  port: 8009,
  payload: {
    type: "SEEK",
    time: 100 // Time to seek to in seconds
  }
}
```

### Supported Applications

This node supports a few applications for app specific commands. The `DefaultMediaReceiver` is the generic media playing app available on all cast devices, to be used when loading audio, video, etc., to play directly. Other supported applications allow for partial control of app specific commands for that application running on the cast device.

<ul>
  <li>DefaultMediaReceiver</li>
  <li>DashCast</li>
  <li>YouTube</li>
</ul>

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

### DashCast Command Example

These are the commands exposed by CashCast receiver. The "app" is required on these commands.


| Command         | Example                                                          |
|-----------------|------------------------------------------------------------------|
| LOAD            | Load a single url                                                |

#### LOAD Example

Loads a URL on the cast target.

```js
{
  payload: {
    app: "DashCast",
    type: "LOAD",
    url: "http://www.google.com",
    force: true, // optional, forces allow touch input mode
    reload: 0 // optional, auto reload mode
  }
}
```

### YouTube Command Example

These are the commands exposed by YouTube receiver. The "app" is required on these commands.


| Command         | Example                                                          |
|-----------------|------------------------------------------------------------------|
| MEDIA           | Load a single media file                                         |

#### MEDIA Example

Loads media for YouTube.

```js
{
  payload: {
    app: "YouTube",
    type: "MEDIA",
    videoId: "VideoIdFromYouTube"
  }
}
```
