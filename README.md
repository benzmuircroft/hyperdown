# 🕳🥊 Hyperdown
A user event memory for server and clients. Online users will receive events and handle them normally. Offline users will have their events stored and replicated for later retrieval and handling. If the server goes down all the clients will still store and replicate the events.

## Status = Do Not Use
⚠️ Currently there is a problem with hyperdeebee and b4a that needs to be resolved
- todo: use new autobase
- todo: remove hyperdeebee and do the same thing simplified

## Installation
```
npm install "github:benzmuircroft/hyperdown"
```

## Options
```js
{
  uniqueKeyPair:          'must be unique to each peer (including the server peer) and be able to reproduce socket.remotePublicKey',
  folderName:             'is storage and the swarm topic',
  testFolder:             'If testing server and client(s) in a single script this will move the storage to an inner folder of folderName',
  isServer:               'is a bool',
  onClientConsumedEvents: 'required for server. is a function (see sever example)',
  eventHandler:           'required for clients. is a function (see client example)'
}
```

## Usage / test
```js
;(async function() {


  const Keychain = (await import('keypear')).default; // https://github.com/holepunchto/keypear


  // server

  const kp0 = new Keychain().get();

  const server = await require('hyperdown')({
    uniqueKeyPair: kp0,
    folderName: 'topic',
    testFolder: 'server', // only needed because we are testing in one script
    isServer: true,
    onClientConsumedEvents:
    function(remotePublicKey, eventsArray) {
      // do something ...
      console.log('server: client used the event', remotePublicKey, eventsArray);
    }
  });


  // an online user

  const kp1 = new Keychain().get();

  const onlineClient = await require('hyperdown')({
    uniqueKeyPair: kp1,
    folderName: 'topic',
    testFolder: 'onlineClient', // only needed because we are testing in one script
    eventHandler:
    function(id, data, cb) {
      // do something ...
      console.log('client: event from server', id, data, cb);
      cb(id, true);
    }
  });

  await server.addEvent(kp1.publicKey, JSON.stringify({ prize: 500, game: 'boxing' })); // give a online client an event


  // an offline user

  const kp2 = new Keychain().get();

  await server.addEvent(kp2.publicKey, JSON.stringify({ prize: -500, game: 'boxing' })); // give a offline client an event

  const offlineClient = await require('hyperdown')({ // they come back later ...
    uniqueKeyPair: kp2,
    folderName: 'topic',
    testFolder: 'offlineClient', // only needed because we are testing in one script
    eventHandler:
    function(id, data, cb) {
      // do something ...
      console.log('client: event from server', id, data, cb);
      cb(id, true);
    }
  });


})();
```

## SERVER API

```js
server.addEvent
server.updatePause
server.reFace
```
### SERVER CALLBACK (Optional)

```js
server.onClientConsumedEvents(remotePublicKey, eventsArray) {
  // do something ...
  console.log('server: client used the event', remotePublicKey, eventsArray);
});
```

## CLIENT API

```js
// none
```

### CLIENT CALLBACK (Mandatory)

```js
client.eventHandler(id, data, cb) {
  // do something ...
  cb(id, true);
});
```
