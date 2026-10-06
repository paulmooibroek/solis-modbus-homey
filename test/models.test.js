'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { models, getModel } = require('../lib/models');
const { settings } = require('../lib/modbus');
const { percentToWatts, validateWatts } = require('../lib/control');
const { decode } = require('../lib/solis');
test('legacy settings default to original Mini 3600; explicit unknown models fail', () => {
  assert.equal(settings({host:'localhost'}).model,'mini-3600-4g');
  assert.throws(()=>settings({host:'localhost',model:'hybrid'}));
});
test('all model ratings and percentage boundaries match Homey settings choices', () => {
  const choices = require('../app.json').drivers[0].settings.find(s=>s.id==='model').values;
  assert.deepEqual(choices.map(c=>c.id),models.map(m=>m.id));
  for(const model of models){
    const config={model:model.id};
    assert.equal(getModel(config).watts,model.watts);
    assert.equal(percentToWatts(100,config),model.watts);
    assert.equal(percentToWatts(50,config),model.watts/2);
    assert.equal(percentToWatts(0,config),0);
    assert.throws(()=>validateWatts(model.watts+1,config));
  }
});
test('plausibility check scales with rating without changing energy scaling', () => {
  const b=Buffer.alloc(22);b.writeUInt32BE(6000,0);b.writeUInt32BE(123456,8);b.writeUInt16BE(1200,20);
  assert.equal(decode(b,{model:'1p-6000-4g'}).meter_power,123456);
  assert.equal(decode(b,{model:'1p-6000-4g'})['meter_power.today'],120);
  assert.throws(()=>decode(b,{model:'mini-700-4g'}));
});
