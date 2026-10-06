'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function device({failure=false,diagnosticFailure=false,model,profileFailure=false}={}) {
  let writes=0;
  class Base {
    constructor(){this.caps=new Map();this.listeners={};this.homey={setTimeout:()=>1,clearTimeout:()=>{}};}
    getSettings(){return {host:'localhost',model};} hasCapability(c){return this.caps.has(c);}
    getCapabilityOptions(c){return this.options?.[c] || {};} async setCapabilityOptions(c,o){this.options ??= {};this.options[c]=o;}
    async addCapability(c){this.caps.set(c,null);} registerCapabilityListener(c,f){this.listeners[c]=f;}
    async setCapabilityValue(c,v){this.caps.set(c,v);} async setAvailable(){} async setUnavailable(){}
    async setWarning(v){this.warning=v;} async unsetWarning(){this.warning=null;} error(){}
  }
  const context={module:{exports:{}},AbortController,require(name){
    if(name==='homey')return {Device:Base};
    if(name.endsWith('/modbus'))return require('../lib/modbus');
    if(name.endsWith('/models'))return require('../lib/models');
    if(name.endsWith('/diagnostics'))return {readDiagnostics:async()=>{if(diagnosticFailure)throw new Error('Unsupported register');return {measure_voltage:231.5,measure_temperature:42.1,solis_status:'Produceren (0x0003)',solis_status_code:3};}};
    if(name.endsWith('/solis'))return {verifyProfile:async()=>{if(profileFailure)throw new Error('Wrong profile');},readSolis:async()=>({measure_power:100,meter_power:123})};
    if(name.endsWith('/control'))return {
      percentToWatts:require('../lib/control').percentToWatts,readControl:async()=>({enabled:false,watts:3600}),
      setPower:async(_,watts)=>{writes++;if(failure)throw new Error('Niet bevestigd');return {enabled:true,watts};}
    };
    throw new Error(name);
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../drivers/solis-mini/device.js'),'utf8'),context);
  return {d:new context.module.exports(),writes:()=>writes};
}
test('upgrade adds controls without writing and exposes verified limit',async()=>{
  const {d,writes}=device();await d.onInit();await d.operations;
  assert.ok(d.hasCapability('solar_limit'));assert.ok(d.hasCapability('target_power'));assert.equal(writes(),0);
  assert.equal(d.caps.get('solar_limit'),100);
  await d.setSolarLimit(50);assert.equal(d.caps.get('solar_limit'),50);assert.equal(d.caps.get('target_power'),1800);
  await d.setSolarLimit(0);assert.equal(d.caps.get('solar_limit'),0);d.stop();
});
test('failed write clears confirmed setpoints and returns failure',async()=>{
  const {d}=device({failure:true});await d.onInit();await d.operations;
  await assert.rejects(d.setSolarLimit(50),/Niet bevestigd/);
  assert.equal(d.caps.get('target_power'),null);assert.equal(d.caps.get('solar_limit'),null);assert.equal(d.warning,'Niet bevestigd');d.stop();
});
test('deleted device rejects queued controls without a write',async()=>{
  const {d,writes}=device();await d.onInit();await d.operations;d.stop();await assert.rejects(d.setSolarLimit(50),/gestopt/);assert.equal(writes(),0);
});

test('migration enables day and limit history and publishes diagnostics',async()=>{
  const {d,writes}=device();await d.onInit();await d.operations;
  assert.equal(d.options['meter_power.today'].preventInsights,false);
  assert.equal(d.options.solar_limit.preventInsights,false);
  assert.equal(d.caps.get('measure_voltage'),231.5);
  assert.equal(d.caps.get('solis_status_code'),3);
  assert.equal(writes(),0);d.stop();
});
test('unsupported diagnostics preserve production and warning after control read',async()=>{
  const {d}=device({diagnosticFailure:true});await d.onInit();await d.operations;
  assert.equal(d.caps.get('measure_power'),100);
  assert.equal(d.caps.get('measure_voltage'),null);
  assert.match(d.warning,/Extra meetwaarden/);
  await d.setSolarLimit(50);assert.match(d.warning,/Extra meetwaarden/);d.stop();
});

test('production switch sends 0% for off and 100% for on',async()=>{
 const {d}=device();await d.onInit();await d.operations;
 await d.listeners.onoff(false);assert.equal(d.caps.get('solar_limit'),0);assert.equal(d.caps.get('onoff'),false);
 await d.listeners.onoff(true);assert.equal(d.caps.get('solar_limit'),100);assert.equal(d.caps.get('onoff'),true);
 assert.equal(d.options.solar_limit.max,100);assert.equal(d.options.target_power.max,3600);d.stop();
});

test('6kW model uses its rating in limits, percentage actions and readback',async()=>{
 const {d}=device({model:'1p-6000-4g'});await d.onInit();await d.operations;
 assert.equal(d.options.target_power.max,6000);assert.equal(d.options.target_power.step,60);
 await d.setSolarLimit(50);assert.equal(d.caps.get('target_power'),3000);assert.equal(d.caps.get('solar_limit'),50);
 await d.listeners.onoff(true);assert.equal(d.caps.get('target_power'),6000);d.stop();
});
test('model settings change updates UI without writing inverter',async()=>{
 const {d,writes}=device();await d.onInit();await d.operations;
 await d.onSettings({newSettings:{host:'localhost',model:'mini-1500-4g'}});
 assert.equal(d.options.target_power.max,1500);assert.equal(d.caps.get('target_power'),null);assert.equal(writes(),0);
 await d.setSolarLimit(50);assert.equal(d.caps.get('target_power'),750);d.stop();
});
test('failed profile verification keeps existing model and limits',async()=>{
 const {d}=device({profileFailure:true});await d.onInit();await d.operations;
 await assert.rejects(d.onSettings({newSettings:{host:'localhost',model:'1p-6000-4g'}}),/Wrong profile/);
 assert.equal(d.config.model,'mini-3600-4g');assert.equal(d.options.target_power.max,3600);d.stop();
});
