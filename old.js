async function hyperdown(options) {

  const hd = {};
  const Corestore = require('corestore');
  const Autobase = require('autobase');
  const AutobaseManager = (await import('@lejeunerenard/autobase-manager')).AutobaseManager;
  const Autodeebee = require('autodbee/autodeebee');
  const { DB } = require('autodbee');
  const Hyperswarm = require('hyperswarm');
  const ProtomuxRPC = require('protomux-rpc');
  const Keychain = (await import('keypear')).default;
  const b4a = require('b4a');
  const goodbye = (await import('graceful-goodbye')).default;

  let base, swarm, keyPair;

  if (!options) {
    throw new Error('options object is missing');
  }
  else if (!options.uniqueKeyPair) {
    throw new Error('options.uniqueKeyPair should be a KeyChain or keyPair. see: https://github.com/holepunchto/keypear');
  }
  else if (!options.folderName || typeof options.folderName !== 'string') {
    throw new Error('options.folderName should be a string');
  }
  else if (options.testFolder && typeof options.testFolder !== 'string') {
    throw new Error('options.testFolder should be a string');
  }
  else if (options.isServer && (!options.onClientConsumedEvents || typeof options.onClientConsumedEvents !== 'function' || options.eventHandler)) {
    throw new Error('options.onClientConsumedEvents should be a function if you intend this to be a server');
  }
  else if (!options.isServer && (!options.eventHandler || typeof options.eventHandler !== 'function' || options.onClientConsumedEvents)) {
    throw new Error('options.eventHandler should be a function if you intend this to be a client');
  }

  if (!options.uniqueKeyPair.publicKey) {
    if (typeof options.uniqueKeyPair.get == 'function') {
      keyPair = options.uniqueKeyPair.get();
    }
    else {
      throw new Error('options.uniqueKeyPair should be a KeyChain or keyPair. see: https://github.com/holepunchto/keypear');
    }
  }
  else {
    keyPair = new Keychain(options.uniqueKeyPair);
    keyPair = keyPair.get();
  }

  let folder = `./${options.folderName}`;
  if (options.testFolder) {
    folder += `/${options.testFolder}`;
  }



  


  
  const store = new Corestore(folder);
  const input = store.get({ name: 'input', sparse: false, valueEncoding: 'json' });
  const output = store.get({ name: 'output', sparse: false, valueEncoding: 'json' });
  await input.ready();
  await output.ready();

  if (options.isServer) { // --------------------------------------- server
    hd.onClientConsumedEvents = options.onClientConsumedEvents;
    base = new Autobase({
      inputs: [input],
      localInput: input,
      localOutput: output
    });
    const manager = new AutobaseManager(
      base,
      (key, coreType, channel) => true, // function to filter core keys
      store.get.bind(store), // get(key) function to get a hypercore given a key
      store.storage, // Storage for managing autobase keys
      { id: options.folderName } // Options
    );
    await manager.ready();
    const autobee = new Autodeebee(eventsbase);
    hd.db = new DB(autobee);
    const id = {
      cy:
        [
          ['a', 'c', '1', 'l', 'D', 'M', 'X'],  // 0
          ['d', 'f', '3', 'C', 'L', 'N'],       // 1
          ['g', 'h', 'i', '7', 'V', 'H'],       // 2
          ['j', 't', 'b', 'z', 'R', 'O'],       // 3
          ['m', 'n', 'o', 'E', 'I', 'P'],       // 4
          ['p', 'q', 'r', '4', 'G', 'K'],       // 5
          ['s', 'u', 'k', '9', 'F', 'Z', 'J'],  // 6
          ['v', 'w', 'x', '6', 'T', 'W'],       // 7
          ['y', '2', '8', 'B', 'Y', 'Q'],       // 8
          ['0', '5', 'e', 'A', 'U', 'S']        // 9
        ]
      , of: function (t) { // randomly encrypt a timestamp
        let e = '';
        t = '' + t;
        for (const element of t) {
          e += this.cy[Number(element)][Math.floor(Math.random() * this.cy[Number(element)].length)]
        }
        return e;
      }
    };
    hd.addEvent = async function(userPublicKey, data) {
      const hyperdownId = id.of(+new Date());
      const user = await hd.db.collection('events').findOne(userPublicKey);
      let events = user.events;
      data.hyperdownId = hyperdownId;
      events[hyperdownId] = data;
      await hd.db.collection('events').update({ _id: userPublicKey }, { events: events }, { multi: false, upsert: true });
      if (!user.offline && clients[userPublicKey]) {
        clients[userPublicKey].event('event', b4a.from(JSON.stringify(data)));
      }
    };
    swarm = new Hyperswarm({
      keyPair: keyPair
    });
    const clients = {};
    swarm.on('connection', function(socket) {
      const stream = store.replicate(socket);
      manager.attachStream(stream); // Attach manager
      const rpc = new ProtomuxRPC(socket);
      rpc.remotePublicKey = socket.remotePublicKey;
      clients[rpc.remotePublicKey] = rpc;
      rpc.event('isServer'); // tell the client you are the server ...
      rpc.respond('consumedEvents', async function(data) {
        let user = await hd.db.collection('events').findOne(rpc.remotePublicKey);
        let consumedEvents = [];
        for (const hyperdownId in user.events) {
          if (user.consumed.includes(hyperdownId)) {
            consumedEvents.push(JSON.stringify(JSON.parse(user.events[hyperdownId])));
            delete user.events[hyperdownId];
          }
        }
        await hd.db.collection('events').update({ _id: rpc.remotePublicKey }, { events: user.events, consumed: [] }, { multi: false });
        hd.onClientConsumedEvents(rpc.remotePublicKey, consumedEvents); // application can handle anything it needs to ....
      });
      rpc.on('close', async function() {
        delete clients[rpc.remotePublicKey];
        if (!(await hd.db.collection('events').findOne(rpc.remotePublicKey)).offline) {
          await hd.db.collection('events').update({ _id: rpc.remotePublicKey }, { offline: true }, { multi: false });
        }
      });
    });
    goodbye(() => swarm.destroy());
    await swarm.join(b4a.alloc(32).fill(options.folderName), { server: true, client: true });
    await swarm.flush();
  }
  else { // ---------------------------------------------------------------- client
    hd.eventHandler = options.eventHandler;
    base = new Autobase({
      inputs: [input],
      localInput: input,
      localOutput: output
    });
    const manager = new AutobaseManager(
      base,
      (key, coreType, channel) => true, // function to filter core keys
      store.get.bind(store), // get(key) function to get a hypercore given a key
      store.storage, // Storage for managing autobase keys
      { id: options.folderName } // Options
    );
    await manager.ready();
    const autobee = new Autodeebee(eventsbase);
    hd.db = new DB(autobee);
    let server;
    swarm = new Hyperswarm({
      keyPair: keyPair
    });
    swarm.on('connection', async function(socket) {
      const stream = store.replicate(socket);
      manager.attachStream(stream); // Attach manager
      const rpc = new ProtomuxRPC(socket);
      rpc.remotePublicKey = socket.remotePublicKey;
      rpc.respond('isServer', function() {
        hasServer(rpc); // server is ready to talk !
      });
      rpc.respond('event', async function(data) {
        let e;
        try {
          data = JSON.parse(data);
        }
        catch (err) {
          e = err;
        }
        if (!e) {
          const hyperdownId = data.hyperdownId + ''; // clone
          delete data.hyperdownId;
          hd.eventHandler(hyperdownId, data, async function(id, bool) { // call back
            if (id !== hyperdownId) {
              throw new Error(`Malformed hyperdownId for event. Got: '${id}', expected: '${hyperdownId}'`);
            }
            if (bool) { // true
              await hd.db.collection('events').update({ _id: keyPair.publicKey }, { $push: { consumed: hyperdownId } }, { multi: false, upsert: true });
              if (server) {
                server.event('consumedEvents');
              }
            }
          });
        }
      });
    });
    goodbye(async function() {
      await hd.db.collection('events').update({ _id: keyPair.publicKey }, { offline: true }, { multi: false });
      swarm.destroy();
    });
    await swarm.join(b4a.alloc(32).fill(options.folderName), { server: true, client: true });
    await swarm.flush();
    // when the server is ready to talk ...
    async function hasServer(rpc) {
      server = rpc;
      rpc.on('close', function() {
        server = undefined;
      });
      if (!await hd.db.collection('events').findOne(keyPair.publicKey)) {
        await hd.db.collection('events').insert({ _id: keyPair.publicKey, offline: false, events: {} });
      }
      else {
        await hd.db.collection('events').update({ _id: keyPair.publicKey }, { offline: false }, { multi: false });
      }
      // look up our events and consume them ...
      let found = (await hd.db.collection('events').findOne({ _id: keyPair.publicKey })).events;
      hd.events = JSON.stringify(JSON.parse(found));
      if (hd.events.length) {
        let hyperdownId = Object.keys(found);
        ;(async function next(s, that) {
          if (found[hyperdownId[s]]) {
            that.eventHandler(hyperdownId[s], found[hyperdownId[s]], async function(id, bool) { // callback result
              if (id !== hyperdownId[s]) {
                throw new Error(`Malformed hyperdownId for event. Got: '${id}', expected: '${hyperdownId[s]}'`);
              }
              if (bool) { // true
                await hd.db.collection('events').update({ _id: keyPair.publicKey }, { $push: { consumed: hyperdownId[s] } }, { multi: false, upsert: true });
              }
              await next(s + 1, that);
            });
          }
          else { //end
            next = null;
            if (server) {
              server.event('consumedEvents');
            }
          }
        })(0, this);
      }
    }
  }
  return hd;
};
module.exports = hyperdown;
