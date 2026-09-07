'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');
const { once }=require('node:events');
const { setPower, readControl, percentToWatts }=require('../lib/control');
const { readSolis }=require('../lib/solis');
async function inverter(t,{rejectRegister=false,ignoreWrite=false,enabled=0x55,raw=10000,dropWrite=false}={}) {
  const registers=new Map([[3069,enabled],[3051,raw]]), writes=[], events=[];
  const sockets=new Set();
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));let buf=Buffer.alloc(0);
    socket.on('data',chunk=>{
      buf=Buffer.concat([buf,chunk]);if(buf.length<12)return;
      const q=buf,fn=q[7],address=q.readUInt16BE(8),value=q.readUInt16BE(10);events.push({fn,address,time:Date.now()});
      let pdu;
      if(rejectRegister && address===3051)pdu=Buffer.from([1,fn|0x80,2]);
      else if(fn===6){writes.push([address,value]);if(!ignoreWrite)registers.set(address,value);if(dropWrite&&address===3051){socket.destroy();return;}pdu=q.subarray(6);}
      else if(fn===4)pdu=Buffer.concat([Buffer.from([1,4,22]),Buffer.alloc(22)]);
      else {assert.equal(fn,3);assert.ok(registers.has(address));pdu=Buffer.alloc(5);pdu[0]=1;pdu[1]=3;pdu[2]=2;pdu.writeUInt16BE(registers.get(address),3);}
      const r=Buffer.concat([q.subarray(0,6),pdu]);r.writeUInt16BE(pdu.length,4);socket.end(r);
    });
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{for(const s of sockets)s.destroy();return new Promise(r=>server.close(r));});
  return {config:{host:'127.0.0.1',port:server.address().port},registers,writes,events};
}
test('0–100% maps to nominal watts',()=>{
  for(const [p,w] of [[0,0],[1,36],[50,1800],[100,3600]])assert.equal(percentToWatts(p),w);
  for(const p of [-1,101,110,NaN,Infinity,'50'])assert.throws(()=>percentToWatts(p));
});
for(const percent of [0,1,50,100])test(`apply and verify ${percent}%`,async t=>{
  const x=await inverter(t);const watts=percentToWatts(percent);
  assert.deepEqual(await setPower(x.config,watts),{enabled:true,watts});
  assert.deepEqual(x.writes,[[3069,0xaa],[3051,percent*100]]);
  // No writes to flash-save or maximum-power override registers.
  assert.ok(x.events.slice(1).every((e,i)=>e.time-x.events[i].time>=340));
});
test('firmware lacking percentage register fails before any write',async t=>{
  const x=await inverter(t,{rejectRegister:true});await assert.rejects(setPower(x.config,1800),/exceptie 2/);assert.deepEqual(x.writes,[]);
});
test('ignored command fails verification',async t=>{
  const x=await inverter(t,{ignoreWrite:true,enabled:0xaa});await assert.rejects(setPower(x.config,1800),/niet overgenomen/);
});
test('lost acknowledgement is not retried or rolled back',async t=>{
  const x=await inverter(t,{dropWrite:true,enabled:0xaa});await assert.rejects(setPower(x.config,0),/instelling kan gewijzigd/);assert.deepEqual(x.writes,[[3051,0]]);
});
test('readback does not invent a percentage when regulation is disabled',async t=>{
  const x=await inverter(t);assert.deepEqual(await readControl(x.config),{enabled:false,watts:3600});assert.deepEqual(x.writes,[]);
});
test('polling cannot interleave with write and verification sequence',async t=>{
  const x=await inverter(t);await Promise.all([setPower(x.config,1800),readSolis(x.config)]);assert.equal(x.events.at(-1).fn,4);
});

test('observed Mini 4G startup mode 0 and existing 110% are migrated by explicit command',async t=>{
 const x=await inverter(t,{enabled:0,raw:11000});
 assert.deepEqual(await readControl(x.config),{enabled:false,watts:null});
 assert.deepEqual(await setPower(x.config,3600),{enabled:true,watts:3600});
 assert.deepEqual(x.writes,[[3069,0xaa],[3051,10000]]);
});
test('reject values above 100% before writes',async t=>{
 const x=await inverter(t);assert.throws(()=>setPower(x.config,3960),/3600/);assert.deepEqual(x.writes,[]);
});
