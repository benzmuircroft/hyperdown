;(async function() {


  const Keychain = (await import('keypear')).default; // https://github.com/holepunchto/keypear
  const b4a = require('b4a');


  // server

  const kp0 = new Keychain({
    scalar: b4a.from('808a6e175b246bc93d4adaada45d49c031296efb36da7fdf3c5128d3eb46fd5e', 'hex'),
    publicKey: b4a.from('9b0e5bf749a3fd55ca5d08b225962bae6c0c826d9822a79e36b1871b50da82fe', 'hex')
  }).get();



  const server = await require('hyperdown')({
    uniqueKeyPair: kp0,
    folderName: 'topic',
    testFolder: 'server', // only needed because we are testing in one script
    isServer: true,
    onClientConsumedEvents:
    function(remotePublicKey, event, cb) {
      // do something ...
      console.log(`server: client ${remotePublicKey} used the event`, event);
      cb(true);
    }
  });
  

  
  // an offline user

  const kp1 = new Keychain({
    scalar: b4a.from('684e14316d8f379829ee5d1b883dffd2cf123f2987b8658353ae740ed8758565', 'hex'),
    publicKey: b4a.from('09f9cb2e6097bab4936696c7fb2e80c52ecc7e7a0dfe67274d93198e785c1558', 'hex')
  }).get();

  const onlineClient = await require('hyperdown')({
    serverPublicKey: kp0.publicKey,
    uniqueKeyPair: kp1,
    folderName: 'topic',
    testFolder: 'onlineClient1', // only needed because we are testing in one script
    eventHandler:
    async function(id, data, cb) {
      // do something ...
      console.log('client1: event from server', id, data, cb);
      await cb(id, true);
    }
  });

  await server.addEvent(kp1.publicKey, { prize: 500, game: 'boxing', note: 'user1 is online' }); // give a online client an event


  // an offline user

  const kp2 = new Keychain({
    scalar: b4a.from('b0cf93c3f3589ea5e7a09b752e7b6492e6e331661da8fe88854d692aec59114f', 'hex'),
    publicKey: b4a.from('4cce6d17f4000b19b9f752fb7c185a56cff16d86f0cda8673e5ab6baed9e7171', 'hex')
  }).get();

  await server.addEvent(kp2.publicKey, { prize: -500, game: 'boxing', note: 'user2 is offline' }); // give a offline client an event

  const offlineClient = await require('hyperdown')({ // they come back later ...
    serverPublicKey: kp0.publicKey,
    uniqueKeyPair: kp2,
    folderName: 'topic',
    testFolder: 'offlineClient2', // only needed because we are testing in one script
    offline: true,
    eventHandler:
    async function(id, data, cb) {
      // do something ...
      console.log('client2: event from server', id, data, cb);
      await cb(id, true);
    }
  });


  await server.addEvent(kp1.publicKey, { prize: 4500, game: 'boxing2', note: 'user1 is still online' }); // give a online client an event

  // try server leave here, then comment it out again and re-run to see the server recover events that were previously consumed by the clients
  // server.leave();
  


})();
