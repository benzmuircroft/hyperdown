const hyperdown = async (options) => { // self-invoking function
  return new Promise(async (resolve) => {
    
    const Corestore = require('corestore');
    const Hyperbee = require('hyperbee');
    const Hyperswarm = require('hyperswarm');
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


    const hd = await require('tinybee')({
      folderNameOrCorestore: folder,
      keyPair
    });
  

    
    if (options.isServer) { // --------------------------------------- server
      hd.onClientConsumedEvents = options.onClientConsumedEvents;
      const id = {
        to: [
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
        , get: function (c) { // not used
          let d = '';
          c = '' + c;
          for (const element of c) {
            for (let x = 0; x < this.to.length; x += 1) {
              if (this.to[x].indexOf(element) > -1) { d += x; break; }
            }
          }
          return Number(d);
        }
      };
      hd.updatePause = function (pause) {
        const hyperdownId = id.set(+new Date());
        for (const userPublicKey in clients) {
          clients[userPublicKey].socket.write(JSON.stringify({ f: 'updatePause', hyperdownId, pause }));
        }
      };
      hd.addEvent = async function(userPublicKey, d) {
        if (typeof d !== 'object') {
          throw new Error('data needs to be an object');
        }
        if (typeof userPublicKey.toString == 'function') {
          userPublicKey = userPublicKey.toString('hex');
        }
        const hyperdownId = id.set(+new Date());
        d.hyperdownId = hyperdownId;
        await hd.put(hyperdownId, d, userPublicKey); // sub put event
        if (clients[userPublicKey]) {
          d.f = 'event';
          clients[userPublicKey].socket.write(JSON.stringify(d));
        }
        return hyperdownId;
      };
      swarm = new Hyperswarm({ keyPair });
      const clients = {};
      swarm.on('connection', async function(socket) {
        // todo accept an index so we can know the rpk is the wallet address
        socket.hexPublicKey = socket.remotePublicKey.toString('hex');
        clients[socket.hexPublicKey] = {
          socket,
          prevent: [],
          caughtUp: false
        };
        clients[socket.hexPublicKey].socket.on('data', async function (d) {
          const same = d.toString();
          if (!clients[socket.hexPublicKey].prevent.includes(same)) {
            clients[socket.hexPublicKey].prevent.push(same);
            clients[socket.hexPublicKey].prevent.splice(100);
            d = JSON.parse(d);
            if (d.f == 'consumedEvents') { // a bulk of events
              delete d.f;
              let evs = await hd.get(null, socket.hexPublicKey); // sub get all
              let hyperdownId = Object.keys(d.exs);
              if (!clients[socket.hexPublicKey].caughtUp) {
                clients[socket.hexPublicKey].caughtUp = true;
                const prevEvs = Object.fromEntries(Object.entries(evs).filter(([key]) => !hyperdownId.includes(key)));
                clients[socket.hexPublicKey].socket.write(JSON.stringify({ f: 'event', evs: prevEvs }));
              }
              let consumedEvents = [];
              ;(async function next(s) {
                if (hyperdownId[s]) {
                  if (evs[hyperdownId[s]]) { // we still have to deal with this ...
                    hd.onClientConsumedEvents(socket.hexPublicKey, d.exs[hyperdownId[s]], async function(success) { // application can handle anything it needs to ....
                      if (success) {
                        consumedEvents.push(hyperdownId[s]);
                        hd.del(hyperdownId[s], socket.hexPublicKey); // sub del key
                      }
                      next(s + 1);
                    });
                  }
                  else {
                    consumedEvents.push(hyperdownId[s]);
                    next(s + 1);
                  }
                }
                else { // end
                  if (clients[socket.hexPublicKey]) {
                    clients[socket.hexPublicKey].socket.write(JSON.stringify({ f: 'done', exs: consumedEvents }));
                  }
                }
              })(0);
            }
          }
        });
        socket.on('error', function (err) {});
        socket.on('close', function () {
          delete clients[socket.hexPublicKey];
        });
      });
      goodbye(() => swarm.destroy());
      await swarm.join(b4a.alloc(32).fill(options.folderName), { server: true, client: true });
      await swarm.flush();
      hd.leave = function() {
        console.log('server offline');
        swarm.destroy();
      };
      resolve([hd, clients]);
    }
    else { // ---------------------------------------------------------------- client
      hd.eventHandler = options.eventHandler;
      let once = true;
      let client = {
        prevent: [],
        caughtUp: false
      };
      let payload = {};
      const pauseMin = 20000;
      let pause = pauseMin;
      let trigger;
      async function processEvents(ev = {}) {
        let ex = await hd.get(); // user consumed events [ { hyperdownId: event },... ]
        for (const hyperdownId in ex) {
          delete ev[hyperdownId]; // remove events we have seen
        }
        let hyperdownId = Object.keys(ev);
        let consumedEvents = {};
        if (hyperdownId.length) {
          ;(async function next(s) {
            if (ev[hyperdownId[s]]) {
              delete ev[hyperdownId[s]].hyperdownId;
              await hd.eventHandler(hyperdownId[s], ev[hyperdownId[s]], async function(id, bool) { // callback result
                if (id !== hyperdownId[s]) {
                  throw new Error(`Malformed hyperdownId for event. Got: '${id}', expected: '${hyperdownId[s]}'`);
                }
                if (bool) { // true
                  await hd.put(hyperdownId[s], ev[hyperdownId[s]]);
                  consumedEvents[hyperdownId[s]] = ev[hyperdownId[s]];
                }
                await next(s + 1);
              });
            }
            else { // end
              next = null;
              if (client.socket) {
                if (!client.caughtUp) {
                  client.caughtUp = true;
                  consumedEvents = await hd.get();
                }
                client.socket.write(JSON.stringify({ f: 'consumedEvents', exs: consumedEvents }));
              }
            }
          })(0);
        }
      } // processEvent
      // hd.call = function(d, cb) {
      //   if (client.socket) {
      //     // problem the call will go down vvv there
      //   }
      //   else return cb('could not connect')
      // }; // call
      swarm = new Hyperswarm({ keyPair });
      const publicKey = keyPair.publicKey.toString('hex');
      swarm.on('connection', async function(socket) {
        if (options.serverPublicKey.toString('hex') == socket.remotePublicKey.toString('hex')) {
          client.socket = socket;
          socket.on('data', async function(d) {
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
                if (d.evs) {
                  payload = { ...payload, ...d.evs };
                }
                else {
                  payload[d.hyperdownId] = d; // queue
                }
                clearTimeout(trigger);
                trigger = await setTimeout(async function() {
                  if (pause != pauseMin) {
                    pause = pauseMin; // reset after high yeild rapid fire
                  }
                  const bundle = JSON.parse(JSON.stringify(payload));
                  payload = {};
                  await processEvents(bundle);
                }, pause);
              }
              else if (d.f == 'done') { // server said you no longer need these ex events
                for (const hyperdownId of d.exs) {
                  hd.del(hyperdownId);
                }
              }
            }
          });
          const ex = await hd.get();
          if (ex) {
            client.socket.write(JSON.stringify({ f: 'consumedEvents', exs: (await hd.get()) })); // first contact
          }
          if (once) {
            once = false;
            resolve(hd);
          }
        }
        socket.on('error', function (err) {});
        socket.on('close', function () {
          if (options.serverPublicKey.toString('hex') == socket.remotePublicKey.toString('hex')) {
            client.socket = null;
          }
        })
      });
      goodbye(() => swarm.destroy());
      await swarm.join(b4a.alloc(32).fill(options.folderName), { server: true, client: true });
      await swarm.flush();
    }
  });
};

module.exports = hyperdown;
