'use strict';
const Homey = require('homey');
const { settings } = require('../../lib/modbus');
const { readSolis, verifyProfile } = require('../../lib/solis');
const { models, getModel } = require('../../lib/models');
module.exports = class SolisDriver extends Homey.Driver {
  async onPair(session) {
    let busy = false;
    session.setHandler('models', async () => models);
    session.setHandler('connect', async input => {
      if (busy) throw new Error('Verbinding wordt al getest.');
      busy = true;
      try {
        const config = settings(input);
        const id = `${config.host.toLowerCase()}:${config.port}:${config.unit_id}`;
        if (this.getDevices().some(d => d.getData().id === id)) throw new Error('Deze omvormer is al toegevoegd.');
        await verifyProfile(config);
        const values = await readSolis(config);
        return { name: getModel(config).name, data: { id }, settings: config, capabilities: [...Object.keys(values), 'onoff', 'solar_limit', 'target_power', 'measure_voltage', 'measure_temperature', 'solis_status', 'solis_status_code'], capabilitiesValues: values };
      } finally { busy = false; }
    });
  }
};
