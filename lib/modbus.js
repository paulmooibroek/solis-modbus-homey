'use strict';
const net = require('node:net');
function crc16(data) {
  let crc = 0xffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}
function settings(input) {
  const s = { host: String(input.host || '').trim(), port: input.port ?? 502,
    unit_id: input.unit_id ?? 1, protocol: input.protocol ?? 'tcp',
    poll_interval: input.poll_interval ?? 30, timeout: input.timeout ?? 5 };
  if (!s.host || /[\s/:]/.test(s.host)) throw new Error('Vul een geldig IPv4-adres of hostnaam in (zonder http://).');
  for (const [key, min, max] of [['port',1,65535],['unit_id',1,247],['poll_interval',5,3600],['timeout',1,30]]) {
    if (!Number.isInteger(s[key]) || s[key] < min || s[key] > max) throw new Error(`Ongeldige instelling: ${key} (${min}–${max}).`);
  }
  if (!['tcp','rtu'].includes(s.protocol)) throw new Error('Onbekend Modbus-protocol.');
  return s;
}
// One request per connection prevents late replies from contaminating a subsequent poll.
function exchange(input, fn, address, count, signal) {
  const s = settings(input);
  if (!Number.isInteger(address) || address < 0 || address > 65535 || !Number.isInteger(count) || (fn === 6 ? count < 0 || count > 65535 : count < 1 || count > 50 || address + count > 65536)) throw new Error('Ongeldig registerbereik.');
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Lezing geannuleerd.'));
    const pdu = Buffer.alloc(6);
    pdu[0] = s.unit_id; pdu[1] = fn; pdu.writeUInt16BE(address,2); pdu.writeUInt16BE(count,4);
    const transaction = Math.floor(Math.random() * 65536);
    let request;
    if (s.protocol === 'tcp') {
      const header = Buffer.alloc(6); header.writeUInt16BE(transaction); header.writeUInt16BE(pdu.length,4);
      request = Buffer.concat([header,pdu]);
    } else {
      const crc = Buffer.alloc(2); crc.writeUInt16LE(crc16(pdu)); request = Buffer.concat([pdu,crc]);
    }
    const socket = new net.Socket();
    let data = Buffer.alloc(0), done = false;
    const finish = (err, value) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); socket.destroy();
      if (err) reject(err); else resolve(value);
    };
    const abort = () => finish(new Error('Lezing geannuleerd.'));
    const timer = setTimeout(() => finish(new Error('Geen Modbus-antwoord binnen de timeout. Controleer gateway, protocol, RS485 en slave-ID.')), s.timeout * 1000);
    signal?.addEventListener('abort', abort, { once: true });
    socket.on('error', err => finish(err));
    socket.on('close', () => finish(new Error('Gateway verbrak de verbinding voordat het antwoord compleet was.')));
    socket.on('data', chunk => {
      try {
        data = Buffer.concat([data,chunk]);
        if (data.length > 512) throw new Error('Modbus-antwoord te groot.');
        let frame;
        if (s.protocol === 'tcp') {
          if (data.length < 6) return;
          if (data.readUInt16BE(0) !== transaction || data.readUInt16BE(2) !== 0) throw new Error('Ongeldige Modbus TCP-header.');
          const length = data.readUInt16BE(4);
          if (length < 3 || length > 103) throw new Error('Ongeldige Modbus TCP-lengte.');
          if (data.length < 6 + length) return;
          if (data.length !== 6 + length) throw new Error('Extra bytes in Modbus-antwoord.');
          frame = data.subarray(6);
        } else {
          if (data.length < 3) return;
          const length = data[1] & 0x80 ? 5 : fn === 6 ? 8 : 5 + data[2];
          if (data.length < length) return;
          if (data.length !== length || crc16(data.subarray(0,-2)) !== data.readUInt16LE(data.length-2)) throw new Error('Ongeldige Modbus RTU-lengte of CRC.');
          frame = data.subarray(0,-2);
        }
        if (frame[0] !== s.unit_id) throw new Error('Antwoord van een ander slave-ID.');
        if (frame[1] === (fn | 0x80)) throw new Error(`Modbus-exceptie ${frame[2]} (2 = ongeldig registeradres).`);
        if (fn === 6) {
          if (!frame.equals(pdu)) throw new Error('Schrijfbevestiging komt niet overeen met de opdracht.');
          finish(null);
        } else {
          if (frame[1] !== fn || frame[2] !== count * 2 || frame.length !== 3 + count * 2) throw new Error('Onverwacht Modbus-antwoord.');
          finish(null, frame.subarray(3));
        }
      } catch (err) { finish(err); }
    });
    socket.connect(s.port, s.host, () => socket.write(request));
  });
}
const readInput = (s, address, count, signal) => exchange(s, 4, address, count, signal);
const readHolding = (s, address, count, signal) => exchange(s, 3, address, count, signal);
const writeRegister = (s, address, value, signal) => exchange(s, 6, address, value, signal);
module.exports = { crc16, settings, readInput, readHolding, writeRegister };
