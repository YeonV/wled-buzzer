'use strict';

function createBroker({ getIo, mqttClientIpMap, mqttClientNameMap }) {
  const broker    = require('aedes')();
  const net       = require('net');
  const tcpServer = net.createServer(broker.handle);

  broker.on('client', (client) => {
    const ip = client.conn?.remoteAddress?.replace(/^::ffff:/, '') ?? 'unknown';
    console.info(`📡  Buzzer connected: ${client.id} (${ip})`);
    // Some mock clients might only connect and not publish status right away
    // we still want to track them if possible, but hexId comes from topic.
  });

  broker.on('clientDisconnect', (client) => {
    console.info(`📴  Buzzer disconnected: ${client.id}`);
  });

  // Capture topic-based hex ID → IP mapping (topic prefix ≠ MQTT Client ID in WLED)
  broker.on('publish', (packet, client) => {
    if (!client) return; // broker-internal / retained messages
    const parts = packet.topic.split('/');
    if (parts[0] !== 'wled' || parts.length < 2) return;
    const hexId = parts[1];
    // Normalise IPv6-mapped IPv4 (::ffff:127.0.0.1) and IPv6 loopback (::1)
    const raw = client.conn?.remoteAddress ?? 'unknown';
    const ip = raw.replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
    let changed = false;
    if (mqttClientIpMap[hexId] !== ip) {
      mqttClientIpMap[hexId] = ip;
      changed = true;
    }
    if (mqttClientNameMap[hexId] !== client.id) {
      mqttClientNameMap[hexId] = client.id;
      changed = true;
    }
    if (changed) {
      const io = getIo();
      io.emit('mqttClientIpMap',  { ...mqttClientIpMap });
      io.emit('mqttClientNameMap', { ...mqttClientNameMap });
    }
  });

  return { tcpServer, broker };
}

module.exports = { createBroker };
