# Solis Modbus voor Homey

Homey SDK 3-app voor **eenfasige Solis Mini 4G- en 1P 4G-omvormers**, lokaal uitgelezen via een **Waveshare RS485 TO POE ETH (B)**. Vereist een Homey met ondersteuning voor lokale apps (Homey Pro), software ≥12.13.0. Geen SolisCloud-account nodig.

## Model kiezen (versie 1.4.0)

Selecteer in de setup het exacte model van het typeplaatje:

- Mini 4G: 700, 1000, 1500, 2000, 2500, 3000 en 3600 W.
- 1P 4G (Europese reeks): 2.5K, 3K, 3.6K, 4K, 4.6K, 5K en 6K.

Het nominale AC-vermogen volgt uit de modelkeuze. Bijvoorbeeld: 50% is 1800 W bij de Mini 3600, maar 3000 W bij de 1P6K. Gebruik niet het totale paneelvermogen. De maximale wattinstelling, 0–100%-regeling en controle op onwaarschijnlijke meetwaarden volgen hetzelfde model.

Deze modellen gebruiken het korte Solis 3000-registerprofiel. De setup controleert de eenfasige uitgangsconfiguratie en leest productiegegevens voordat het apparaat wordt toegevoegd. Dit is geen automatische herkenning van het exacte model: controleer zelf het typeplaatje. Driefasige, hybride, US-, 5G-, S5- en S6-modellen zijn niet opgenomen; kies daarvoor niet een gelijkend 4G-model.

Bestaande apparaten zonder modelinstelling blijven Mini 3600 4G; apparaat-ID, instellingen en historie blijven behouden. Het model is naderhand aanpasbaar via de apparaatinstellingen. Daarbij wordt opnieuw verbinding getest (dus bij voorkeur overdag), zonder instellingen naar de omvormer te schrijven. Nieuwe modellen zijn getest met gesimuleerde Modbus-antwoorden, nog niet op fysieke hardware. De fysieke praktijktest uit eerdere versies betreft alleen de Mini 3600 4G.

Bronnen: [Solis-protocol §5.3 en §5.6](https://api.library.loxone.com/downloader/file/1197/RS485_MODBUS%20Communication%20Protocol_Solis%20Inverters.pdf), [1P 4G-fabrikantdatasheet](https://www.clenergytech.com/products/grid-tide-inverters/solis/single-phase-inverters/download/data_sheet.pdf).

## Meetwaarden

- Actueel opgewekt vermogen in W (`measure_power`).
- Totale opbrengst in kWh (`meter_power`, resolutie van de omvormer: 1 kWh).
- Opbrengst vandaag in kWh (`meter_power.today`, resolutie 0,1 kWh).

Het apparaat heeft klasse `solarpanel`. Positief vermogen betekent productie; de totaalteller wordt gebruikt voor Homey Energy. De dagteller staat apart en wordt niet als cumulatieve Energy-teller gebruikt. De standaard capability Flow-kaarten en de hieronder beschreven vermogensregeling zijn beschikbaar.

## Historie en diagnose (versie 1.2.0)

Nieuwe waarden: **netspanning** (V), **omvormertemperatuur** (°C) en **omvormerstatus** met een leesbare omschrijving en ruwe statuscode. Netspanning, temperatuur, dagopbrengst, vermogenslimiet en statuscode worden in Homey Insights geregistreerd. De tekststatus is alleen voor weergave; de numerieke statuscode maakt veranderingen over tijd zichtbaar. Codes zijn categorieën, geen oplopende ernstschaal: 0 = wachten, 1 = opstarten, 2 = geleidelijk opstarten, 3 = produceren. Overige codes worden met hun hexadecimale waarde getoond; onbekende codes blijven herkenbaar.

Historie begint na installatie van deze versie; eerdere gegevens worden niet aangevuld. Dagopbrengst is de dagteller van de omvormer en kan dagelijks terugvallen. De cumulatieve Energy-teller blijft ongewijzigd. De vermogenslimiet is een teruggelezen instelling, niet het daadwerkelijke vermogen; bij uitgeschakelde regeling of mislukte controle is deze onbekend.

De extra uitlezing gebruikt FC04 draadadres 3035, lengte 9: documentregister 3036 voor eenfasige netspanning, 3042 voor temperatuur en 3044 voor status. Ontbrekende of ongeldige diagnoses worden niet als nulmetingen opgeslagen. Een diagnosefout laat de bestaande productiemeting doorwerken en geeft een waarschuwing. Ondersteuning en waarden moeten nog op de fysieke omvormer worden gecontroleerd.

## Zonneproductie bedienen (versie 1.3.0)

- **Zonneproductie uit:** zet de productiegrens op **0%**.
- **Zonneproductie aan:** zet de productiegrens op **100%** (het nominale vermogen van het gekozen model).
- **Productielimiet (0–100%):** stel een tussenliggend percentage in; 50% is 1800 W bij de Mini 3600.

De aan/uit-schakelaar geeft aan of de limiet productie toestaat. Hij geeft niet aan of er op dat moment daadwerkelijk zon of productie is. Daarvoor blijft de vermogensmeting beschikbaar. Aan herstelt altijd 100%, niet het vorige percentage.

De bestaande Flow-acties voor procentregeling en stoppen blijven werken. Homey's doelvermogen blijft beschikbaar met bereik 0–het nominale modelvermogen. Oude opdrachten boven 100% / het nominale modelvermogen worden afgewezen. Bestaande apparaten krijgen de schakelaar en de nieuwe grenzen automatisch, zonder verwijdering van historie.

De regeling gebruikt nu het procentregister **3052** (draadadres **3051**), waarbij 10000 gelijk is aan 100%. De regelschakelaar is register 3070 (draadadres 3069). Het eerder gebruikte wattregister 3081 wordt niet meer gebruikt. Elke opdracht wordt bevestigd met een teruglezing van de schakelaar en het percentage.

Op deze Mini 4G is de aanvankelijke schakelaarwaarde **0** en een bestaande limiet van **11000** waargenomen. Die uitgangstoestand wordt nu geaccepteerd voor het instellen van een nieuwe limiet. Een ongedefinieerde schakelaarwaarde 0 wordt niet als een bevestigde productie-instelling getoond. Bij een expliciete opdracht wordt de schakelaar op 0xAA gezet en de nieuwe procentlimiet geschreven. Andere onbekende modi blijven een fout geven met de ruwe waarde erbij.

0% is een softwarematige productiegrens, geen elektrische scheiding. Het werkelijk gemeten vermogen kan vertraagd reageren. Instellingen worden niet automatisch naar flash opgeslagen of na herstart opnieuw toegepast. Bij een verloren schrijfbevestiging kan de instelling toch gewijzigd zijn; de app meldt dit en probeert niet blind opnieuw of terug te draaien.

De 100%-opdracht is tijdens deze update op de fysieke omvormer geschreven en correct teruggelezen. Een volledige praktijktest van de vermogensrespons bij lagere percentages is nog niet uitgevoerd.

## Waveshare en Solis instellen

1. Verbind de RS485-communicatiepoort van de omvormer met de Waveshare. Gebruik de A/B-aansluitingen volgens de handleiding van jouw connector; deze app gaat niet uit van een specifieke RJ45-pinindeling.
2. Stel op Waveshare de seriële poort in op **9600 baud, 8 databits, geen pariteit, 1 stopbit (8N1)**. Controleer of dit overeenkomt met de omvormer.
3. Gebruik **TCP Server** met een vast IP-adres of DHCP-reservering, bereikbaar vanaf Homey.
4. Aanbevolen: schakel de Modbus TCP-naar-RTU gatewayfunctie in (in de firmware bijvoorbeeld `Modbus_TCP Protocol`). Gebruik in de app **Modbus TCP**. Stel een luisterpoort in, bijvoorbeeld **502**; neem de daadwerkelijk ingestelde poort over in Homey.
5. Alternatief: gebruik TCP Server met transparante seriële doorgifte en kies **RTU over TCP** in de app. Modbus TCP en transparante doorgifte hebben verschillende frames en zijn niet onderling uitwisselbaar.
6. Schakel extra registratiepakketten, heartbeat-data en actieve JSON/MQTT-polling uit op deze verbinding. Voorkom gelijktijdige Modbus-masters op de RS485-bus.
7. Controleer het Modbus-adres van de Solis. De app gebruikt standaard slave-ID **1**, instelbaar van 1–247.

PoE voedt de Waveshare. De RS485-instellingen worden in de gateway ingesteld, niet door de app gewijzigd.

## Installeren

Op een Mac met geïnstalleerde Homey CLI kun je dubbelklikken op **Installeren.command**. Dit werkt ook voor upgrades en behoudt bestaande instellingen. Het lokale script is niet Apple Developer ID-ondertekend of genotariseerd; dit is geen ondertekende macOS-app. Vereisten: Node.js, Homey CLI en een aangemelde/geselecteerde Homey. Onderstaande terminalstappen zijn alleen nodig voor de eerste inrichting of als alternatief.

Open een terminal in deze projectmap. Installeer zo nodig de Homey CLI met `npm install -g homey`. Log in en selecteer je Homey:

```sh
homey login
homey select
homey app install
```

Er zijn geen externe runtime-afhankelijkheden. Voor tijdelijk ontwikkelen met loguitvoer kan `homey app run` worden gebruikt (afhankelijk van je Homey-model is Docker vereist).

Ga daarna in Homey naar **Apparaten → + → Solis Modbus → Solis eenfasig 4G**. Kies je model en vul IP, poort, slave-ID en protocol in. De app leest de omvormer voordat het apparaat wordt aangemaakt. Voeg bij voorkeur overdag toe, wanneer de omvormer actief is.

In de geavanceerde apparaatinstellingen zijn het meetinterval (standaard 30 seconden) en de timeout (5 seconden) aanpasbaar. Nieuwe instellingen worden bij de volgende lezing gebruikt. Een lopende lezing kan nog de vorige instellingen gebruiken. Het interval begint na het afronden van de vorige lezing, zodat lezingen niet overlappen.

## Verbinding testen zonder Homey

```sh
npm run probe -- 192.168.1.100 502 1 tcp
# Voor een transparante gateway:
npm run probe -- 192.168.1.100 502 1 rtu
```

Vervang het voorbeeldadres door je eigen gatewayadres. Dit leest alleen de drie meetwaarden uit.

## Storingen

- **Timeout:** controleer IP, poort, gatewaymodus, A/B, slave-ID en of de Solis wakker is.
- **Modbus-exceptie 2:** de omvormer accepteert dit registerbereik niet. Controleer model en firmware; deze app gebruikt het korte Solis 4G-registerprotocol, geen hybride 33000-registerkaart.
- **CRC/header-fout:** meestal verschil tussen Modbus TCP en RTU-over-TCP, extra gatewaybytes of een verstoorde verbinding.
- **Onbeschikbaar in de nacht:** de omvormer kan de communicatie uitschakelen. De app blijft proberen en herstelt automatisch zodra geldige data binnenkomt.

Bij verbindingsverlies markeert Homey het apparaat als onbeschikbaar en blijven de laatste waarden behouden. Er wordt geen fictieve 0 W of 0 kWh geschreven; de getoonde waarden zijn dan niet actueel. Tel dezelfde omvormer niet ook via een andere app mee in Energy.

## Protocol en verificatie

FC04 leest 11 registers vanaf draadadres **3004**. Dit correspondeert met Solis-documentadressen 3005–3015. Vermogen is U32 op 3005–3006, totale energie U32 op 3009–3010, dagenergie U16 op 3015 met factor 0,1. Woordvolgorde: hoog woord eerst. Het meetblok blijft binnen het aanbevolen maximum van 50 registers en de vereiste pauze tussen verzoeken.

```sh
npm test
homey app validate --level publish
```

De tests gebruiken tijdelijke Modbus-servers op localhost en controleren TCP/RTU, fragmentatie, adressering, schaling, CRC, uitzonderingen, foutieve frames, timeouts, annuleren, schrijfbevestigingen, het teruglezen van limieten en de wachtrij voor bediening. **Uitlezen, Homey Insights en het instellen/teruglezen van 100% zijn op één fysieke Solis Mini 3600 4G-installatie gecontroleerd.** Lagere vermogenslimieten en herstel na nachtelijke slaapstand zijn nog niet volledig in de praktijk gevalideerd. Controleer bij de eerste lezing W en kWh tegen het omvormerdisplay voordat je de waarden gebruikt voor automatiseringen. De registerkaart is gebaseerd op het Solis-protocol; modelspecifieke firmwareverschillen moeten nog op jouw installatie worden bevestigd.

## Bronnen

- [Homey Energy en zonnepaneel-capabilities](https://apps.developer.homey.app/the-basics/devices/energy).
- [Waveshare RS485 TO POE ETH (B) handleiding](https://www.waveshare.com/wiki/RS485_TO_POE_ETH_%28B%29).
- [Solis RS485 Modbus-protocol, fabrikantdocument gehost door Loxone, §2, §5.3 en §5.6](https://api.library.loxone.com/downloader/file/1197/RS485_MODBUS%20Communication%20Protocol_Solis%20Inverters.pdf).

Dit is een zelfstandige lokale app, niet gepubliceerd in de Homey App Store. De afbeeldingen zijn schematische illustraties.
