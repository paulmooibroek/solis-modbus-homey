'use strict';
const { readSolis } = require('../lib/solis');
const [host, port = '502', unit = '1', protocol = 'tcp'] = process.argv.slice(2);
if (!host) { console.error('Gebruik: npm run probe -- <IP> [poort=502] [slave-ID=1] [tcp|rtu]'); process.exitCode = 1; }
else readSolis({host,port:Number(port),unit_id:Number(unit),protocol})
  .then(values => console.log(JSON.stringify(values,null,2)))
  .catch(err => { console.error(err.message); process.exitCode = 1; });
