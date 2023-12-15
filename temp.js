;(async function() {



  const Keychain = (await import('keypear')).default;

  const sk = new Keychain().get();



  const server = await require('./index.js')({
    uniqueKeyPair:          sk,
    folderName:             'topic',
    testFolder:             'server',
    isServer:               true,
    onClientConsumedEvents:
    function(remotePublicKey, eventsArray) {
      // do something ...
      console.log('server: client used the event', remotePublicKey, eventsArray);
    }
  });



  const ck = new Keychain().get();


  const client = await require('./index.js')({
    uniqueKeyPair:          ck,
    folderName:             'topic',
    testFolder:             'client',
    eventHandler:
    function(id, data, cb) {
      // do something ...
      console.log('client: event from server', id, data, cb);
      cb(id, true);
    }
  });


  //await server.addEvent(ck.publicKey, JSON.stringify({ prize: 500, game: 'robots' })); // give a client an event


  await server.put({ server: 1 });
  await client.put({ client: 2, other: 3 });

  await server.view();
  await client.view();


})();
