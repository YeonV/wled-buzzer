'use strict';
const http = require('http');

// ── Fixtures captured from real WLED 0.15.3 at http://192.168.1.109 ──────────

const INFO_FIXTURE = {
  ver: '0.15.3', vid: 2508020, cn: 'Kōsen', release: 'ESP32',
  leds: { count: 72, pwr: 0, fps: 25, maxpwr: 3950, maxseg: 32,
    bootps: 4, seglc: [3], lc: 3, rgbw: true, wv: 2, cct: 0 },
  str: false, name: 'MockBuzzer', udpport: 21324, simplifiedui: false,
  live: false, liveseg: -1, lm: '', lip: '', ws: 1,
  fxcount: 187, palcount: 71, cpalcount: 0, maps: [{ id: 0 }],
  wifi: { bssid: '00:00:00:00:00:00', rssi: -50, signal: 90, channel: 6, ap: false },
  fs: { u: 20, t: 983, pmt: 0 }, ndc: -1,
  arch: 'esp32', core: 'v3.3.6-16-gcc5440f6a2', lwip: 0,
  freeheap: 160000, uptime: 1000, time: '00:00:10',
  opt: 79, brand: 'WLED', product: 'FOSS',
  mac: '000000000001', ip: '127.0.0.1',
};

const STATE_FIXTURE = {
  on: true, bri: 255, transition: 7, ps: 4, pl: -1, ledmap: 0,
  nl: { on: false, dur: 60, mode: 1, tbri: 0, rem: -1 },
  udpn: { send: false, recv: true, sgrp: 0, rgrp: 1 },
  lor: 0, mainseg: 0,
  seg: [{
    id: 0, start: 0, stop: 72, len: 72, grp: 1, spc: 0, of: 0,
    on: true, frz: false, bri: 255, cct: 127, set: 0,
    col: [[0, 80, 255, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    fx: 65, sx: 30, ix: 128, pal: 0, c1: 128, c2: 128, c3: 16,
    sel: true, rev: false, mi: false, o1: false, o2: false, o3: false,
    si: 0, m12: 0,
  }],
};

// ── Factory ───────────────────────────────────────────────────────────────────

function createMockWledServer(port) {
  const requests = [];

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const { method, url } = req;

      if (method === 'GET' && url === '/json/info') {
        res.writeHead(200);
        return res.end(JSON.stringify(INFO_FIXTURE));
      }

      if (method === 'GET' && url === '/json/state') {
        res.writeHead(200);
        return res.end(JSON.stringify(STATE_FIXTURE));
      }

      if (method === 'GET' && url === '/json') {
        res.writeHead(200);
        return res.end(JSON.stringify({ state: STATE_FIXTURE, info: INFO_FIXTURE }));
      }

      if (method === 'POST' && url === '/json/state') {
        // Accept preset saves, state updates, reboots — always acknowledge
        let parsed = {};
        try { parsed = JSON.parse(body); } catch {}
        res.writeHead(200);
        return res.end(JSON.stringify({ ...STATE_FIXTURE, ...parsed }));
      }

      if (method === 'POST' && url === '/json/cfg') {
        res.writeHead(200);
        return res.end(JSON.stringify({ success: true }));
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not found' }));
    });
  });

  return {
    start:       () => new Promise((resolve, reject) => {
      server.listen(port, '127.0.0.1', resolve);
      server.once('error', reject);
    }),
    stop:        () => new Promise(resolve => server.close(() => resolve())),
    getRequests: () => [...requests],
    clearRequests: () => requests.splice(0),
  };
}

module.exports = { createMockWledServer };
