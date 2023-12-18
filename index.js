async function hyperdown(options) {

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

  let swarm, keyPair;

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
    apply: async function applyAutobeeBatch (bee, batch) {
      const b = bee.batch({ update: false });
      for (const node of batch) {
        const op = JSON.parse(node.value.toString());
        if (op.type === 'del') await b.del(op.key);
        else if (op.type === 'put') await b.put(op.key, op.value.toString());
        else { // batch
          for (el of op) {
            if (el.type === 'del') await b.del(el.key);
            else if (el.type === 'put') await b.put(el.key, el.value.toString());
          }
        }
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
    await base.view.update({ wait: true });
    key = await base.view.get(key);
    if (!key) return key;
    key.value = key.value.toString();
    if (['[', '{'].includes(key.value[0])) return JSON.parse(key.value);
    return key.value;
  };
  hd.put = async function(key, value) {
    const op = b4a.from(JSON.stringify({ type: 'put', key, value: JSON.stringify(value) }));
    return await base.append(op);
  };
  hd.batch = async function(array) {
    let op = [];
    for (let i = 0; i < array.length; i += 1) {
      op.push({ type: 'put', key: array[i][0], value: (typeof array[i][1] == 'string' ? array[i][1] : JSON.stringify(array[i][1])) });
    }
    op = b4a.from(JSON.stringify(op));
    return await base.append(op);
  };

  if (options.isServer) { // --------------------------------------- server
    hd.onClientConsumedEvents = options.onClientConsumedEvents;
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
      if (typeof data !== 'object') {
        throw new Error('data needs to be an object');
      }
      if (typeof userPublicKey.toString == 'function') {
        userPublicKey = userPublicKey.toString('hex');
      }
      const hyperdownId = id.of(+new Date());
      let ev = await hd.get(`${userPublicKey}-ev`) || {};
      data.hyperdownId = hyperdownId;
      ev[hyperdownId] = data;
      await hd.put(`${userPublicKey}-ev`, ev);
      console.log(1, userPublicKey, await hd.get(`${userPublicKey}-ev`));
      const ox = await hd.get(`${userPublicKey}-ox`);
      if (ox && ox != 'x' && clients[userPublicKey]) {
        clients[userPublicKey].event('event', b4a.from(JSON.stringify(data)));
      }
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
      clients[socket.hexPublicKey] = socket;
      socket.on('data', async function() { // always from consumedEvents
        let ev = await hd.get(`${socket.hexPublicKey}-ev`);
        let ex = await hd.get(`${socket.hexPublicKey}-ex`);
        let consumedEvents = [];
        for (const hyperdownId in ev) {
          if (ex.includes(hyperdownId)) {
            consumedEvents.push(JSON.parse(JSON.stringify(ev[hyperdownId])));
            delete ev[hyperdownId];
          }
        }
        hd.batch([
          [ `${socket.hexPublicKey}-ev`, ev ],
          [ `${socket.hexPublicKey}-ex`, ex ]
        ]);
        hd.onClientConsumedEvents(socket.hexPublicKey, consumedEvents); // application can handle anything it needs to ....
      });
      socket.on('close', async function() {
        delete clients[socket.hexPublicKey];
        if ((await hd.get(`${socket.hexPublicKey}-ox`)) == 'o') {
          await hd.put(`${socket.hexPublicKey}-ox`, 'x');
        }
      });
      const ev = await hd.get(`${socket.hexPublicKey}-ev`);
      if (ev) {
        socket.write(JSON.stringify({ f: 'welcome', ev: ev }));
      }
    });
    await server.listen(keyPair);
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
    client.on('open', function() {
      client.on('data', async function(d) {
        d = JSON.parse(d);
        if (d.f == 'welcome') {
          console.log('welcome', publicKey, d.ev);
          await hd.put(`${publicKey}-ox`, 'o');
          hd.events = JSON.parse(JSON.stringify(d.ev));
          if (hd.events.length) {
            let hyperdownId = Object.keys(d.ev);
            ;(async function next(s,) {
              if (d.ev[hyperdownId[s]]) {
                hd.eventHandler(hyperdownId[s], d.ev[hyperdownId[s]], async function(id, bool) { // callback result
                  if (id !== hyperdownId[s]) {
                    throw new Error(`Malformed hyperdownId for event. Got: '${id}', expected: '${hyperdownId[s]}'`);
                  }
                  if (bool) { // true
                    let ex = await hd.get(`${publicKey}-ex`);
                    console.log(typeof ex, ex, '??');
                    ex.push(hyperdownId[s]);
                    await hd.put(`${publicKey}-ex`, ex);
                  }
                  await next(s + 1);
                });
              }
              else { //end
                next = null;
                client.write('consumedEvents');
              }
            })(0);
          }
        }
        else if (d.f == 'event') {
          const hyperdownId = d.hyperdownId + '';
          delete d.hyperdownId;
          hd.eventHandler(hyperdownId, d, async function(id, bool) { // call back
            if (id !== hyperdownId) {
              throw new Error(`Malformed hyperdownId for event. Got: '${id}', expected: '${hyperdownId}'`);
            }
            if (bool) { // true
              let ex = await hd.get(`${publicKey}-ex`);
              ex.push(hyperdownId);
              await hd.put(`${publicKey}-ex`, ex);
              if (server) {
                client.write('consumedEvents');
              }
            }
          });
        }
      });
    });
  }
  return hd;
};
module.exports = hyperdown;
