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

    const db = {
      get: async function(key) {
        await base.latest(base.inputs);
        await base.view.update({ wait: true });
        key = await base.view.get(key);
        if (!key) return key;
        key.value = key.value.toString();
        if (['[', '{'].includes(key.value[0])) return JSON.parse(key.value);
        return key.value;
      },
      put: async function(key, value) {
        const op = b4a.from(JSON.stringify({ type: 'put', key, value: JSON.stringify(value) }));
        await base.append(op);
        await base.view.update({ wait: true });
        await base.latest(base.inputs);
      }
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
      hd.updatePause = function (pause) {
        const hyperdownId = id.set(+new Date());
        for (const userPublicKey in clients) {
          clients[userPublicKey].socket.write(JSON.stringify({ f: 'updatePause', hyperdownId, pause }));
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
        let ev = await db.get(`${userPublicKey}-ev`) || {};
        d.hyperdownId = hyperdownId;
        ev[hyperdownId] = d;
        await db.put(`${userPublicKey}-ev`, ev);
        if (clients[userPublicKey]) {
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
              let ev = await db.get(`${socket.hexPublicKey}-ev`);
              let ex = await db.get(`${socket.hexPublicKey}-ex`) || {};
              let ok = {};
              for (const hyperdownId in d.ex) {
                if (!ex[hyperdownId]) {
                  console.log('ex added', hyperdownId); // todo: remove
                  ex[hyperdownId] = d.ex[hyperdownId];
                }
                else {
                  ok[hyperdownId] = ex[hyperdownId];
                }
              }
              let consumedEvents = [];
              for (const hyperdownId in ev) {
                if (ex[hyperdownId]) {
                  consumedEvents.push(JSON.parse(JSON.stringify(ev[hyperdownId])));
                  delete ev[hyperdownId];
                }
              }
              await db.put(`${socket.hexPublicKey}-ev`, ev);
              await db.put(`${socket.hexPublicKey}-ex`, ok);
              hd.onClientConsumedEvents(socket.hexPublicKey, consumedEvents); // application can handle anything it needs to .... 
            }
          }
        });
        socket.on('close', async function() {
          delete clients[socket.hexPublicKey];
        });
      });
      await server.listen(keyPair);
      resolve(hd);
    }
    else { // ---------------------------------------------------------------- client
      let once = true;
      hd.eventHandler = options.eventHandler;
      swarm = new Hyperswarm();
      const publicKey = keyPair.publicKey.toString('hex');
      swarm.on('connection', async function(socket) {
        const stream = store.replicate(socket);
        manager.attachStream(stream); // Attach manager
      });
      goodbye(async function() {
        swarm.destroy();
      });
      await swarm.join(b4a.alloc(32).fill(options.folderName), { server: true, client: true });
      await swarm.flush();
      const node = new DHT();
      let client;
      let payload = {};
      const pauseMin = 20000;
      let pause = pauseMin;
      let trigger;
      function connect() {
        client = node.connect(options.serverPublicKey,{ keyPair });
        client.on('error', async function() {
          if (error.code === 'PEER_NOT_FOUND') {
            once = true;
          }
          console.log('reconnecting ...');
          connect();
        });
        client.on('close', async function() {
          console.log('reconnecting ...');
          connect();
        });
        client.on('open', async function() {
          client.prevent = [];
          client.on('data', async function(d) {
            // todo: this happens again if reconnected (it should but it has no session memory core date:expire seen:true)
            //
            // todo: add a lock/unlock event ?
            // - always client proccess multiple never singular
            // - client detect server suddenly offline/online
            // - impliment queues so that I can machine gun pelt it !!!!!!!!!!!!!!!
            //
            const same = d.toString();
            if (!client.prevent.includes(same)) {
              client.prevent.push(same);
              client.prevent.splice(100);
              d = JSON.parse(d);
              if (d.f == 'updatePause') {
                pause = d.pause;
              }
              else if (d.f == 'event') {
                delete d.f;
                payload[d.hyperdownId] = d;
                console.log('payload', payload);
                clearTimeout(trigger);
                trigger = await setTimeout(async function() {
                  if (pause != pauseMin) {
                    pause = pauseMin; // reset after high yeild rapid fire
                  }
                  const bundle = JSON.parse(JSON.stringify(payload));
                  payload = {};
                  await processEvents(payload);
                }, pause);
              }
            }
          });
          if (once) {
            once = false;
            setTimeout(resolve, 0, hd);
            processEvents();
          }
        });
      };
      async function processEvents(many = {}) {
        let ev, ex;
        if (!many.length) {
          await base.view.update({ wait: true });
          await base.latest(base.inputs);
          base.view.createReadStream({ gte: `${publicKey}-ev`, lte: `${publicKey}-ev` }); // user events object {hyperdownId: event}
          ev = await db.get(`${publicKey}-ev`) || {};
        }
        else {
          ev = many;
        }
        base.view.createReadStream({ gte: `${publicKey}-ex`, lte: `${publicKey}-ex` }); // user consumed events {hyperdownId: event}
        ex = await db.get(`${publicKey}-ex`) || {};
        for (const hyperdownId in ex) {
          delete ev[hyperdownId]; // remove events we have seen
        }
        let hyperdownId = Object.keys(ev);
        if (hyperdownId.length) {
          ;(async function next(s) {
            if (ev[hyperdownId[s]]) {
              delete ev[hyperdownId[s]].hyperdownId;
              await hd.eventHandler(hyperdownId[s], ev[hyperdownId[s]], async function(id, bool) { // callback result
                if (id !== hyperdownId[s]) {
                  throw new Error(`Malformed hyperdownId for event. Got: '${id}', expected: '${hyperdownId[s]}'`);
                }
                if (bool) { // true
                  let ex = await db.get(`${publicKey}-ex`) || {};
                  ex[hyperdownId[s]] = ev[hyperdownId[s]];
                  await db.put(`${publicKey}-ex`, ex);
                }
                await next(s + 1);
              });
            }
            else { // end
              next = null;
              client.write(JSON.stringify({ f: 'consumedEvents', ex: (await db.get(`${publicKey}-ex`)) }));
            }
          })(0);
        }
      } // processEvent
      connect();
    }
  });
};

module.exports = hyperdown;
