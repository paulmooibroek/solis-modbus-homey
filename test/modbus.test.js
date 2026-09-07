'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { once } = require('node:events');
const { crc16, settings, readInput } = require('../lib/modbus');
const { readSolis, decode } = require('../lib/solis');
function payload() { const b=Buffer.alloc(22); b.writeUInt32BE(3600,0); b.writeUInt32BE(4000,4); b.writeUInt32BE(123456,8); b.writeUInt16BE(127,20); return b; }
async function gateway(t, reply) {
  const sockets=new Set();
  const server=net.createServer(socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));let data=Buffer.alloc(0);socket.on('data',chunk=>{data=Buffer.concat([data,chunk]);if(data.length>=8)reply(socket,data);});});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>{for(const s of sockets)s.destroy();return new Promise(r=>server.close(r));});
  return {host:'127.0.0.1',port:server.address().port,unit_id:1,timeout:1};
}
function response(request,body=payload()) {
  const frame=Buffer.concat([request.subarray(0,6),Buffer.from([1,4,body.length]),body]);frame.writeUInt16BE(body.length+3,4);return frame;
}
test('Solis values use big endian U32 and 0.1 kWh day scaling',()=>{
  assert.deepEqual(decode(payload()),{measure_power:3600,meter_power:123456,'meter_power.today':12.7});
  const b=payload();b.writeUInt32BE(0xffffffff,8);assert.throws(()=>decode(b));assert.throws(()=>decode(Buffer.alloc(2)));
});
test('settings reject broadcast, invalid protocol and interval',()=>{
  for(const s of [{unit_id:0},{protocol:'udp'},{port:65536},{poll_interval:0},{host:'http://bad'}])assert.throws(()=>settings({host:'localhost',...s}));
});
test('CRC matches standard Modbus example',()=>assert.equal(crc16(Buffer.from('01030000000a','hex')),0xcdc5));
test('TCP read validates request address/function and reassembles fragments',async t=>{
  const s=await gateway(t,(socket,q)=>{assert.equal(q.length,12);assert.equal(q[7],4);assert.equal(q.readUInt16BE(8),3004);assert.equal(q.readUInt16BE(10),11);const r=response(q);socket.write(r.subarray(0,5));setTimeout(()=>socket.end(r.subarray(5)),10);});
  assert.deepEqual(await readSolis(s),decode(payload()));
});
test('RTU over TCP uses CRC and handles split frame',async t=>{
  const s=await gateway(t,(socket,q)=>{assert.equal(q.length,8);assert.equal(q[1],4);assert.equal(q.readUInt16BE(2),3004);assert.equal(q.readUInt16LE(6),crc16(q.subarray(0,6)));const r=Buffer.concat([Buffer.from([1,4,22]),payload(),Buffer.alloc(2)]);r.writeUInt16LE(crc16(r.subarray(0,-2)),r.length-2);socket.write(r.subarray(0,2));setTimeout(()=>socket.end(r.subarray(2)),10);});
  assert.deepEqual(await readSolis({...s,protocol:'rtu'}),decode(payload()));
});
for(const [name,modify] of [
  ['wrong transaction',r=>r.writeUInt16BE((r.readUInt16BE(0)+1)&65535,0)],
  ['wrong unit',r=>r[6]=2],['wrong function',r=>r[7]=3],['wrong byte count',r=>r[8]=20],['bad length',r=>r.writeUInt16BE(65535,4)]
])test(`rejects ${name}`,async t=>{const s=await gateway(t,(socket,q)=>{const r=response(q);modify(r);socket.end(r);});await assert.rejects(readSolis(s));});
test('Modbus exception is reported',async t=>{const s=await gateway(t,(socket,q)=>{const r=Buffer.concat([q.subarray(0,6),Buffer.from([1,0x84,2])]);r.writeUInt16BE(3,4);socket.end(r);});await assert.rejects(readSolis(s),/exceptie 2/);});
test('invalid RTU CRC is rejected',async t=>{const s=await gateway(t,socket=>socket.end(Buffer.concat([Buffer.from([1,4,22]),payload(),Buffer.from([0,0])])));await assert.rejects(readSolis({...s,protocol:'rtu'}),/CRC/);});
test('truncated response is rejected',async t=>{const s=await gateway(t,(socket,q)=>socket.end(response(q).subarray(0,10)));await assert.rejects(readSolis(s),/verbrak/);});
test('silent gateway times out',async t=>{const s=await gateway(t,()=>{});await assert.rejects(readSolis(s),/timeout/);});
test('aborting destroys pending connection',async t=>{const s=await gateway(t,()=>{});const c=new AbortController();const p=readSolis(s,c.signal);c.abort();await assert.rejects(p,/geannuleerd/);});
test('invalid read range rejected before networking',()=>assert.throws(()=>readInput({host:'localhost'},65535,2)));

const { readHolding, writeRegister } = require('../lib/modbus');
for (const protocol of ['tcp','rtu']) {
  test(`${protocol} FC06 validates write echo`,async t=>{
    const s=await gateway(t,(socket,q)=>socket.end(q));
    await writeRegister({...s,protocol},3080,396);
  });
  test(`${protocol} FC06 rejects wrong echoed value`,async t=>{
    const s=await gateway(t,(socket,q)=>{const r=Buffer.from(q);const off=protocol==='tcp'?6:0;r.writeUInt16BE(1,off+4);if(protocol==='rtu')r.writeUInt16LE(crc16(r.subarray(0,-2)),6);socket.end(r);});
    await assert.rejects(writeRegister({...s,protocol},3080,396),/Schrijfbevestiging/);
  });
  test(`${protocol} FC06 handles exception`,async t=>{
    const s=await gateway(t,(socket,q)=>{
      const p=Buffer.from([1,0x86,2]);
      if(protocol==='tcp'){const r=Buffer.concat([q.subarray(0,6),p]);r.writeUInt16BE(3,4);socket.end(r);}
      else{const crc=Buffer.alloc(2);crc.writeUInt16LE(crc16(p));socket.end(Buffer.concat([p,crc]));}
    });
    await assert.rejects(writeRegister({...s,protocol},3080,396),/exceptie 2/);
  });
}
test('FC03 reads holding registers',async t=>{
  const s=await gateway(t,(socket,q)=>{assert.equal(q[7],3);const r=response(q,Buffer.from([0,170]));r[7]=3;socket.end(r);});
  assert.equal((await readHolding(s,3069,1)).readUInt16BE(0),170);
});
test('invalid write values rejected before connecting',()=>{
  for(const v of [-1,65536,NaN,1.5])assert.throws(()=>writeRegister({host:'localhost'},3080,v));
});

const { readDiagnostics, decodeDiagnostics } = require('../lib/diagnostics');
test('diagnostic read uses single-phase voltage and documented register offsets',async t=>{
  const s=await gateway(t,(socket,q)=>{
    assert.equal(q[7],4);assert.equal(q.readUInt16BE(8),3035);assert.equal(q.readUInt16BE(10),9);
    const b=Buffer.alloc(18);b.writeUInt16BE(2315,0);b.writeUInt16BE(421,12);b.writeUInt16BE(3,16);
    socket.end(response(q,b));
  });
  assert.deepEqual(await readDiagnostics(s),{measure_voltage:231.5,measure_temperature:42.1,solis_status_code:3,solis_status:'Produceren (0x0003)'});
});
test('invalid diagnostics do not create graph spikes or false normal state',()=>{
  const b=Buffer.alloc(18,255);const d=decodeDiagnostics(b);
  assert.equal(d.measure_voltage,null);assert.equal(d.measure_temperature,null);assert.equal(d.solis_status_code,null);
  b.writeUInt16BE(0,0);b.writeUInt16BE(0,12);b.writeUInt16BE(0xabcd,16);
  assert.equal(decodeDiagnostics(b).measure_voltage,0);assert.match(decodeDiagnostics(b).solis_status,/Onbekende.*ABCD/);
  b.writeUInt16BE(0,16);assert.equal(decodeDiagnostics(b).solis_status,'Wachten (0x0000)');
  assert.throws(()=>decodeDiagnostics(Buffer.alloc(2)));
});
