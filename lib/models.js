'use strict';
// European single-phase grid-tied 4G models using the INV-3000 register map.
// Manufacturer protocol §5.3/5.6; no hybrid, US or 5G/S5/S6 assumptions.
const models = [
  ...[700, 1000, 1500, 2000, 2500, 3000, 3600].map(watts => ({
    id: `mini-${watts}-4g`, name: `Solis-mini-${watts}-4G`, watts,
  })),
  ...[2500, 3000, 3600, 4000, 4600, 5000, 6000].map(watts => ({
    id: `1p-${watts}-4g`, name: `Solis-1P${watts / 1000}K-4G`, watts,
  })),
];
function getModel(config = {}) {
  const id = config.model ?? 'mini-3600-4g';
  const model = models.find(item => item.id === id);
  if (!model) throw new Error('Onbekend Solis-model. Kies een ondersteund 4G-model in de instellingen.');
  return model;
}
module.exports = { models, getModel };
