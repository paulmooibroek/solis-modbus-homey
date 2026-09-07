'use strict';
const { run } = require('./bus');
const RATED_POWER = 3600;
const MAX_POWER = 3600;
// Solis §5.6: holding 3052 (wire 3051): 10000 = 100%.
// Holding 3070 (wire 3069): 0xAA enables percentage limiting.
function percentToWatts(percent) {
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Kies een vermogenslimiet van 0 tot 100%.');
  return Math.floor(percent * 100 + 1e-8) / 100 * 36;
}
function validateWatts(watts) {
  if (typeof watts !== 'number' || !Number.isFinite(watts) || watts < 0 || watts > MAX_POWER) throw new Error('Kies een vermogenslimiet van 0 tot 3600 W.');
  return Math.floor(watts / 36 * 100 + 1e-8) / 100 * 36;
}
async function state(request) {
  const enabled = (await request('readHolding', 3069, 1)).readUInt16BE(0);
  if (![0, 0xaa, 0x55].includes(enabled)) throw new Error(`Onbekende Solis-regelmodus: 0x${enabled.toString(16)} (register 3070).`);
  const raw = (await request('readHolding', 3051, 1)).readUInt16BE(0);
  const watts = raw / 100 * 36;
  if (raw > 11000) throw new Error('Solis retourneert een ongeldige procentlimiet (register 3052).');
  return { enabled: enabled === 0xaa, watts: enabled === 0xaa ? watts : enabled === 0x55 ? 3600 : null };
}
function readControl(config, signal) { return run(config, signal, state); }
function setPower(config, input, signal) {
  const watts = validateWatts(input);
  return run(config, signal, async request => {
    // Preflight reads fail before writes on firmware without these registers.
    const previous = await state(request);
    try {
      if (!previous.enabled) await request('writeRegister', 3069, 0xaa);
      await request('writeRegister', 3051, Math.round(watts / 36 * 100));
      const actual = await state(request);
      if (!actual.enabled || Math.abs(actual.watts - watts) > 0.001) throw new Error('Omvormer heeft de gevraagde limiet niet overgenomen.');
      return actual;
    } catch (err) {
      // An acknowledgement may be lost after a successful write. No blind retry
      // or rollback: either could unexpectedly increase production.
      throw new Error(`Vermogensregeling niet bevestigd; instelling kan gewijzigd zijn. ${err.message}`);
    }
  });
}
module.exports = { RATED_POWER, MAX_POWER, percentToWatts, validateWatts, readControl, setPower };
