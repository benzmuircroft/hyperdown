# hyperdown
A user event memory for server and clients. Online users will receive events and handle them normally. Offline users will have there events stored and replicated for later retrieval and handling. If the server goes down all the clients will still store and replicate the events.

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

## Usage
```js
;(async function() {

  const Keychain = (await import('keypear')).default;

  const sk = new Keychain().get();

  const server = await require('hyperdown')({
    uniqueKeyPair: sk,
    folderName: 'topic',
    testFolder: 'server',
    isServer: true,
    onClientConsumedEvents:
    function(remotePublicKey, eventsArray) {
      // do something ...
      console.log('server: client used the event', remotePublicKey, eventsArray);
    }
  });

  const ck = new Keychain().get();

  const client = await require('hyperdown')({
    uniqueKeyPair: ck,
    folderName: 'topic',
    testFolder: 'client',
    eventHandler:
    function(id, data, cb) {
      // do something ...
      console.log('client: event from server', id, data, cb);
      cb(id, true);
    }
  });

  await server.addEvent(ck.publicKey, JSON.stringify({ prize: 500, game: 'robots' })); // give a client an event

})();
```
