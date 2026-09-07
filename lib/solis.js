'use strict';
const { run } = require('./bus');
// Solis protocol §5.3: documented 3005–3015 => wire 3004–3014, FC04.
function decode(data) {
  if (!Buffer.isBuffer(data) || data.length !== 22) throw new Error('Verwacht 11 Solis-registers.');
  const power = data.readUInt32BE(0), total = data.readUInt32BE(8), today = data.readUInt16BE(20) / 10;
  if (power === 0xffffffff || total === 0xffffffff || data.readUInt16BE(20) === 0xffff) throw new Error('Solis retourneert ongeldige meetwaarden.');
  if (power > 10000 || today > 100) throw new Error('Meetwaarden passen niet bij een Solis Mini 3600. Controleer model en registerprotocol.');
  return { measure_power: power, meter_power: total, 'meter_power.today': today };
}
async function readSolis(settings, signal) { return run(settings, signal, async request => decode(await request('readInput', 3004, 11))); }
module.exports = { decode, readSolis };
