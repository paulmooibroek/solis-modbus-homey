#!/bin/bash
# Local convenience launcher; no bundled runtime and no silent dependency installation.
cd -- "$(dirname -- "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v homey >/dev/null 2>&1; then
  echo 'De Homey CLI ontbreekt. Installeer eerst Node.js en voer npm install -g homey uit.'
  read -r -p 'Druk op Enter om af te sluiten.'
  exit 1
fi
echo 'Solis Modbus installeren/bijwerken op je geselecteerde Homey.'
echo 'Bestaande apparaten en instellingen blijven behouden.'
if homey app install; then
  echo 'Installatie voltooid.'
else
  echo 'Installatie mislukt. Controleer de melding hierboven. Gebruik zo nodig homey login en homey select.'
  read -r -p 'Druk op Enter om af te sluiten.'
  exit 1
fi
read -r -p 'Druk op Enter om af te sluiten.'
