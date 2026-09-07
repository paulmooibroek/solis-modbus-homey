'use strict';
const { setTimeout: delay } = require('node:timers/promises');
const modbus = require('./modbus');
// Serialize whole operations across devices on the same gateway, not only frames.
const buses = new Map();
function run(input, signal, operation) {
  const config = modbus.settings(input);
  const key = `${config.host.toLowerCase()}:${config.port}`;
  if (!buses.has(key)) buses.set(key, { tail: Promise.resolve(), last: 0 });
  const bus = buses.get(key);
  const request = async (method, address, value) => {
    if (signal?.aborted) throw new Error('Lezing geannuleerd.');
    const wait = 350 - (Date.now() - bus.last);
    if (wait > 0) await delay(wait, undefined, { signal });
    try { return await modbus[method](config, address, value, signal); }
    finally { bus.last = Date.now(); }
  };
  const job = bus.tail.then(async () => {
    if (signal?.aborted) throw new Error('Lezing geannuleerd.');
    return operation(request);
  });
  bus.tail = job.catch(() => {});
  return job;
}
module.exports = { run };
