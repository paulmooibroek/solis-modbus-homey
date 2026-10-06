'use strict';
const Homey = require('homey');
const { settings } = require('../../lib/modbus');
const { readSolis, verifyProfile } = require('../../lib/solis');
const { readDiagnostics } = require('../../lib/diagnostics');
const { percentToWatts, readControl, setPower } = require('../../lib/control');
const { getModel } = require('../../lib/models');
module.exports = class SolisDevice extends Homey.Device {
  async onInit() {
    this.stopped = false;
    this.lifetime = new AbortController();
    this.config = settings(this.getSettings());
    this.operations = Promise.resolve();
    for (const cap of ['onoff', 'solar_limit', 'target_power', 'measure_voltage', 'measure_temperature', 'solis_status', 'solis_status_code']) {
      if (!this.hasCapability(cap)) await this.addCapability(cap);
    }
    // Upgrade existing paired devices without removing capabilities or history.
    for (const cap of ['meter_power.today', 'solar_limit', 'measure_voltage', 'measure_temperature', 'solis_status_code']) {
      await this.setCapabilityOptions(cap, { ...this.getCapabilityOptions(cap), preventInsights: false });
    }
    await this.setCapabilityOptions('solar_limit', { ...this.getCapabilityOptions('solar_limit'), min: 0, max: 100, step: 1 });
    await this.setCapabilityOptions('target_power', { ...this.getCapabilityOptions('target_power'), min: 0, max: getModel(this.config).watts, step: getModel(this.config).watts / 100 });
    await this.setCapabilityOptions('onoff', { title: { en: 'Solar production', nl: 'Zonneproductie' } });
    this.registerCapabilityListener('onoff', on => this.setSolarLimit(on ? 100 : 0));
    this.diagnosticWarning = null;
    this.registerCapabilityListener('solar_limit', percent => this.setSolarLimit(percent));
    this.registerCapabilityListener('target_power', watts => this.applyPower(watts));
    this.poll();
  }
  enqueue(work) {
    const operation = this.operations.then(() => {
      if (this.stopped) throw new Error('Apparaat is gestopt.');
      return work();
    });
    this.operations = operation.catch(() => {});
    return operation;
  }
  async updateControl(state) {
    const known = Number.isFinite(state.watts) && state.watts >= 0 && state.watts <= getModel(this.config).watts;
    await this.setCapabilityValue('solar_limit', known ? Math.round(state.watts / getModel(this.config).watts * 10000) / 100 : null);
    await this.setCapabilityValue('target_power', known ? state.watts : null);
    await this.setCapabilityValue('onoff', known ? state.watts > 0 : null);
  }
  setSolarLimit(percent) { return this.applyPower(percent, true); }
  applyPower(input, isPercent = false) {
    return this.enqueue(async () => {
      try {
        const watts = isPercent ? percentToWatts(input, this.config) : input;
        const actual = await setPower(this.config, watts, this.lifetime.signal);
        await this.updateControl(actual);
        await this.refreshWarning();
      } catch (err) {
        if (!this.stopped) {
          await this.updateControl({});
          await this.setWarning(err.message);
        }
        throw err;
      }
    });
  }
  async refreshWarning() {
    if (this.diagnosticWarning) await this.setWarning(this.diagnosticWarning);
    else await this.unsetWarning();
  }
  async poll() {
    if (this.stopped) return;
    try {
      await this.enqueue(async () => {
        const values = await readSolis(this.config, this.lifetime.signal);
        if (this.stopped) return;
        for (const [cap, value] of Object.entries(values)) await this.setCapabilityValue(cap, value);
        await this.setAvailable();
        try {
          const diagnostics = await readDiagnostics(this.config, this.lifetime.signal);
          if (this.stopped) return;
          for (const [cap, value] of Object.entries(diagnostics)) await this.setCapabilityValue(cap, value);
          this.diagnosticWarning = Object.values(diagnostics).some(v => v === null)
            ? 'Een of meer diagnosewaarden zijn niet beschikbaar op deze firmware.' : null;
        } catch (err) {
          if (this.stopped) return;
          for (const cap of ['measure_voltage', 'measure_temperature', 'solis_status_code', 'solis_status']) {
            await this.setCapabilityValue(cap, null);
          }
          this.diagnosticWarning = `Extra meetwaarden niet beschikbaar: ${err.message}`;
        }
        try {
          await this.updateControl(await readControl(this.config, this.lifetime.signal));
          await this.refreshWarning();
        } catch (err) {
          if (!this.stopped) {
            await this.updateControl({ enabled: false });
            await this.setWarning(`Meetwaarden beschikbaar; vermogensregeling niet bevestigd: ${err.message}`);
          }
        }
      });
    } catch (err) {
      if (!this.stopped) {
        this.error('Solis uitlezen:', err.message);
        await this.setUnavailable(`Geen actuele Solis-meting: ${err.message}`).catch(e => this.error(e));
      }
    } finally {
      if (!this.stopped) this.timer = this.homey.setTimeout(() => this.poll(), this.config.poll_interval * 1000);
    }
  }
  async onSettings({ newSettings }) {
    const next = settings(newSettings);
    await this.enqueue(async () => {
      const old = this.config;
      const changed = ['model', 'host', 'port', 'unit_id', 'protocol'].some(key => next[key] !== old[key]);
      if (changed) await verifyProfile(next, this.lifetime.signal);
      await this.setCapabilityOptions('target_power', {
        ...this.getCapabilityOptions('target_power'), max: getModel(next).watts, step: getModel(next).watts / 100,
      });
      this.config = next;
      if (changed) await this.updateControl({});
    });
  }
  async onDeleted() { this.stop(); }
  async onUninit() { this.stop(); }
  stop() {
    this.stopped = true;
    if (this.timer) this.homey.clearTimeout(this.timer);
    this.lifetime?.abort();
  }
};
