'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('pairing stores selected model, uses model name and checks profile before telemetry',async()=>{
 const calls=[];const context={module:{exports:{}},require(name){
  if(name==='homey')return {Driver:class {getDevices(){return [];}}};
  if(name.endsWith('/modbus'))return require('../lib/modbus');
  if(name.endsWith('/models'))return require('../lib/models');
  if(name.endsWith('/solis'))return {verifyProfile:async c=>calls.push(c.model),readSolis:async()=>{assert.equal(calls.length,1);return {measure_power:3000,meter_power:100,'meter_power.today':1};}};
  throw new Error(name);
 }};
 vm.runInNewContext(fs.readFileSync(require.resolve('../drivers/solis-mini/driver.js'),'utf8'),context);
 const driver=new context.module.exports();const handlers={};await driver.onPair({setHandler:(n,f)=>handlers[n]=f});
 assert.equal((await handlers.models()).length,14);
 const d=await handlers.connect({host:'localhost',model:'1p-6000-4g'});
 assert.equal(d.settings.model,'1p-6000-4g');assert.equal(d.name,'Solis-1P6K-4G');
 await assert.rejects(handlers.connect({host:'localhost',model:'S6-hybrid'}),/Onbekend/);
});
