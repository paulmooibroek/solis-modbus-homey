'use strict';
const { run } = require('./bus');
const { getModel } = require('./models');
// Solis protocol §5.3: documented 3005–3015 => wire 3004–3014, FC04.
function decode(data, config = {}) {
  const model = getModel(config);
  if (!Buffer.isBuffer(data) || data.length !== 22) throw new Error('Verwacht 11 Solis-registers.');
  const power = data.readUInt32BE(0), total = data.readUInt32BE(8), today = data.readUInt16BE(20) / 10;
  if (power === 0xffffffff || total === 0xffffffff || data.readUInt16BE(20) === 0xffff) throw new Error('Solis retourneert ongeldige meetwaarden.');
  if (power > model.watts * 1.2 || today > model.watts / 1000 * 24 * 1.2) throw new Error('Meetwaarden passen niet bij het gekozen Solis-model. Controleer model en registerprotocol.');
  return { measure_power: power, meter_power: total, 'meter_power.today': today };
}
async function readSolis(settings, signal) { return run(settings, signal, async request => decode(await request('readInput', 3004, 11), settings)); }
async function verifyProfile(config, signal) {
  getModel(config);
  return run(config, signal, async request => {
    const outputType = (await request('readInput', 3002, 1)).readUInt16BE(0);
    if (outputType !== 0) throw new Error('Dit profiel vereist een eenfasige Solis met de 3000-registerkaart. Controleer het typeplaatje.');
  });
}
module.exports = { decode, readSolis, verifyProfile };
