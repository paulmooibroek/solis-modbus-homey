'use strict';
const { run } = require('./bus');
// Single-phase Solis: document 3036 = AC voltage; 3042 = temperature;
// 3044 = status. FC04 wire addresses are document addresses minus one.
const labels = {
  0x0000: 'Wachten', 0x0001: 'Opstarten', 0x0002: 'Geleidelijk opstarten',
  0x0003: 'Produceren', 0x1010: 'Netspanning te hoog', 0x1011: 'Netspanning te laag',
  0x1012: 'Netfrequentie te hoog', 0x1013: 'Netfrequentie te laag',
  0x1015: 'Geen elektriciteitsnet', 0x1018: 'Netstroom te hoog',
  0x1020: 'DC-spanning te hoog', 0x1032: 'Temperatuurbeveiliging',
  0xf010: 'Waarschuwing: spanningspiek', 0xf011: 'Waarschuwing: ventilator',
};
function decodeDiagnostics(data) {
  if (!Buffer.isBuffer(data) || data.length !== 18) throw new Error('Verwacht 9 diagnose-registers.');
  const voltage = data.readUInt16BE(0), temperature = data.readUInt16BE(12), status = data.readUInt16BE(16);
  const hex = status.toString(16).toUpperCase().padStart(4, '0');
  // Preserve valid sibling values if a register is unsupported or implausible.
  return {
    measure_voltage: voltage <= 4000 ? voltage / 10 : null,
    measure_temperature: temperature <= 1500 ? temperature / 10 : null,
    solis_status_code: status === 0xffff ? null : status,
    solis_status: status === 0xffff ? 'Status niet beschikbaar' : `${labels[status] || 'Onbekende status'} (0x${hex})`,
  };
}
function readDiagnostics(settings, signal) {
  return run(settings, signal, async request => decodeDiagnostics(await request('readInput', 3035, 9)));
}
module.exports = { decodeDiagnostics, readDiagnostics };
