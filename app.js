'use strict';
const Homey = require('homey');
module.exports = class SolisApp extends Homey.App {
  async onInit() {
    this.homey.flow.getActionCard('set_solar_limit').registerRunListener(async ({ device, percent }) => {
      await device.setSolarLimit(percent);
    });
    this.homey.flow.getActionCard('stop_solar').registerRunListener(async ({ device }) => {
      await device.setSolarLimit(0);
    });
    this.log('Solis Modbus gestart');
  }
};
