const hyperdown = async (options) => { // self-invoking function
  return new Promise(async (resolve) => {
    const hd = {};
    const Corestore = require('corestore');
    const Autobase = require('autobase');
    const AutobaseManager = (await import('@lejeunerenard/autobase-manager')).AutobaseManager;
    const Hyperbee = require('hyperbee');
    const Hyperswarm = require('hyperswarm');
    const DHT = require('hyperdht');
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
    else if (!options.isServer && !options.serverPublicKey) {
      throw new Error('options.serverPublicKey should be a TypedArray');
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
    await store.ready();
    const input = store.get({ name: 'input', sparse: false });
    const output = store.get({ name: 'output', sparse: false });
    await input.ready();
    await output.ready();
    base = new Autobase({
      inputs: [input],
      localInput: input,
      localOutput: output
    });
    base.start({
      unwrap: true,
      apply: async function(bee, batch) {
        const b = bee.batch({ update: false });
        for (const node of batch) {
          const op = JSON.parse(node.value.toString());
          if (op.type === 'del') await b.del(op.key);
          else if (op.type === 'put') await b.put(op.key, op.value.toString());
        }
        await b.flush();
      },
      view: core => new Hyperbee(core.unwrap(), {
        extension: false
      })
    });
    await base.ready();
    const manager = new AutobaseManager(
      base,
      (key, coreType, channel) => true, // function to filter core keys
      store.get.bind(store), // get(key) function to get a hypercore given a key
      store.storage, // Storage for managing autobase keys
      { id: options.folderName } // Options
    );
    await manager.ready();

    hd.get = async function(key) {
      await base.latest(base.inputs);
      await base.view.update({ wait: true });
      key = await base.view.get(key);
      if (!key) return key;
      key.value = key.value.toString();
      if (['[', '{'].includes(key.value[0])) return JSON.parse(key.value);
      return key.value;
    };
    hd.put = async function(key, value) {
      const op = b4a.from(JSON.stringify({ type: 'put', key, value: JSON.stringify(value) }));
      await base.append(op);
      await base.view.update({ wait: true });
      await base.latest(base.inputs);
    };

    if (options.isServer) { // --------------------------------------- server
      hd.onClientConsumedEvents = options.onClientConsumedEvents;
      const id = {
        to:
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
        , set: function (t) { // randomly encrypt a timestamp
          let e = '';
          t = '' + t;
          for (const element of t) {
            e += this.to[Number(element)][Math.floor(Math.random() * this.to[Number(element)].length)]
          }
          return e;
        }
      };
      hd.addEvent = async function(userPublicKey, d) {
        await base.view.update({ wait: true });
        await base.latest(base.inputs);
        if (typeof d !== 'object') {
          throw new Error('data needs to be an object');
        }
        if (typeof userPublicKey.toString == 'function') {
          userPublicKey = userPublicKey.toString('hex');
        }
        const hyperdownId = id.set(+new Date());
        let ev = await hd.get(`${userPublicKey}-ev`) || {};
        d.hyperdownId = hyperdownId;
        ev[hyperdownId] = d;
        await hd.put(`${userPublicKey}-ev`, ev);
        const ox = await hd.get(`${userPublicKey}-ox`);
        if (ox && ox != 'x' && clients[userPublicKey]) {
          d.f = 'event';
          clients[userPublicKey].socket.write(JSON.stringify(d));
        }
        return hyperdownId;
      };
      swarm = new Hyperswarm();
      const clients = {};
      swarm.on('connection', function(socket) {
        const stream = store.replicate(socket);
        manager.attachStream(stream); // Attach manager
      });
      goodbye(() => swarm.destroy());
      await swarm.join(b4a.alloc(32).fill(options.folderName), { server: true, client: true });
      await swarm.flush();
      const node = new DHT();
      const server = node.createServer();
      server.on('connection', async function(socket) {
        socket.hexPublicKey = socket.remotePublicKey.toString('hex');
        clients[socket.hexPublicKey] = { socket, prevent: [] };
        await hd.put(`${socket.hexPublicKey}-ox`, 'o');
        socket.on('data', async function(d) {
          const same = d.toString();
          if (!clients[socket.hexPublicKey].prevent.includes(same)) {
            clients[socket.hexPublicKey].prevent.push(same);
            clients[socket.hexPublicKey].prevent.splice(100);
            d = JSON.parse(d);
            if (d.f == 'consumedEvents') {
              delete d.f;
              const $ev = base.view.createReadStream({ gte: `${socket.hexPublicKey}-ev`, lte: `${socket.hexPublicKey}-ev` });
              const $ex = base.view.createReadStream({ gte: `${socket.hexPublicKey}-ex`, lte: `${socket.hexPublicKey}-ex` });
              let ev = await hd.get(`${socket.hexPublicKey}-ev`);
              let ex = await hd.get(`${socket.hexPublicKey}-ex`) || d.ex; // should it be this way ?
              let consumedEvents = [];
              for (const hyperdownId in ev) {
                if (ex.includes(hyperdownId)) {
                  consumedEvents.push(JSON.parse(JSON.stringify(ev[hyperdownId])));
                  delete ev[hyperdownId];
                }
              }
              await hd.put(`${socket.hexPublicKey}-ev`, ev);
              await hd.put(`${socket.hexPublicKey}-ex`, []); // todo: make another callback so the server app says that they have delt with these
              hd.onClientConsumedEvents(socket.hexPublicKey, consumedEvents); // application can handle anything it needs to .... 
            }
          }
        });
        socket.on('close', async function() {
          delete clients[socket.hexPublicKey];
          if ((await hd.get(`${socket.hexPublicKey}-ox`)) == 'o') {
            await hd.put(`${socket.hexPublicKey}-ox`, 'x');
          }
        });
      });
      await server.listen(keyPair);
      resolve(hd);
    }
    else { // ---------------------------------------------------------------- client
      hd.eventHandler = options.eventHandler;
      swarm = new Hyperswarm();
      const publicKey = keyPair.publicKey.toString('hex');
      swarm.on('connection', async function(socket) {
        const stream = store.replicate(socket);
        manager.attachStream(stream); // Attach manager
      });
      goodbye(async function() {
        await hd.put(`${publicKey}-ox`, 'x');
        swarm.destroy();
      });
      await swarm.join(b4a.alloc(32).fill(options.folderName), { server: true, client: true });
      await swarm.flush();
      const node = new DHT();
      const client = node.connect(options.serverPublicKey,{ keyPair });
      client.on('open', async function() {
        client.prevent = [];
        client.on('data', async function(d) {
          const same = d.toString();
          if (!client.prevent.includes(same)) {
            client.prevent.push(same);
            client.prevent.splice(100);
            d = JSON.parse(d);
            if (d.f == 'event') {
              delete d.f;
              const hyperdownId = d.hyperdownId + '';
              delete d.hyperdownId;
              hd.eventHandler(hyperdownId, d, async function(id, bool) { // call back
                if (id !== hyperdownId) {
                  throw new Error(`Malformed hyperdownId for event. Got: '${id}', expected: '${hyperdownId}'`);
                }
                if (bool) { // true
                  let ex = await hd.get(`${publicKey}-ex`) || [];
                  ex.push(hyperdownId);
                  await hd.put(`${publicKey}-ex`, ex);
                  client.write(JSON.stringify({ f: 'consumedEvents', ex: (await hd.get(`${publicKey}-ex`)) }));
                }
              });
            }
          }
        });
        await base.view.update({ wait: true });
        await base.latest(base.inputs);
        const $ox = base.view.createReadStream({ gte: `${publicKey}-ox`, lte: `${publicKey}-ox` }); // user online is o or x (o = online)
        const $ev = base.view.createReadStream({ gte: `${publicKey}-ev`, lte: `${publicKey}-ev` }); // user events object {hyperdownId: event}
        const $ex = base.view.createReadStream({ gte: `${publicKey}-ex`, lte: `${publicKey}-ex` }); // user consumed events [hyperdownId,hyperdownId,...]
        await hd.put(`${publicKey}-ox`, 'o');
        if (options.offline) {
          console.log('im', publicKey);
          for await (const entry of base.view.createReadStream()) {
            console.log('b4', entry.key.toString(), entry.value.toString());
          }
        }
        //setTimeout(async function() { // not happy with this !!!
        const ev = await hd.get(`${publicKey}-ev`) || {};
        let hyperdownId = Object.keys(ev);
        if (hyperdownId.length) {
          ;(async function next(s) {
            if (ev[hyperdownId[s]]) {
              delete ev[hyperdownId[s]].hyperdownId;
              hd.eventHandler(hyperdownId[s], ev[hyperdownId[s]], async function(id, bool) { // callback result
                if (id !== hyperdownId[s]) {
                  throw new Error(`Malformed hyperdownId for event. Got: '${id}', expected: '${hyperdownId[s]}'`);
                }
                if (bool) { // true
                  let ex = await hd.get(`${publicKey}-ex`) || [];
                  ex.push(hyperdownId[s]);
                  await hd.put(`${publicKey}-ex`, ex);
                }
                await next(s + 1);
              });
            }
            else { // end
              next = null;
              client.write(JSON.stringify({ f: 'consumedEvents', ex: (await hd.get(`${publicKey}-ex`)) }));
            }
          })(0);
        }
        //}, 15000);
        resolve(hd);
      });
    }
  });
};

module.exports = hyperdown;

// todo: test in day time
// - add dht bootstraps
// - add truncating
