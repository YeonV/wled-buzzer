/**
 * Setup screen relay handlers — syncs setup state between moderator and display.
 */
const state = require('./state');
const wled = require('./wled');

let io = null;
function init(ctx) { io = ctx.getIo(); }

/** Register setup-related socket handlers on a per-connection basis */
function registerHandlers(socket) {
  socket.on('setupSnapshot', (data) => {
    state.setupSnapshot = data;
    socket.broadcast.emit('setupSnapshot', data);
  });

  socket.on('setupActiveToggle', (data) => {
    if (data.hexId) state.setupSnapshot[data.hexId] = { ...(state.setupSnapshot[data.hexId] ?? {}), active: data.active };
    socket.broadcast.emit('setupActiveToggle', data);
  });

  socket.on('setupNameChange', (data) => {
    if (data.hexId) state.setupSnapshot[data.hexId] = { ...(state.setupSnapshot[data.hexId] ?? {}), name: data.name };
    socket.broadcast.emit('setupNameChange', data);
  });

  socket.on('setupWledName', (data) => {
    if (data.hexId) state.setupSnapshot[data.hexId] = { ...(state.setupSnapshot[data.hexId] ?? {}), wledName: data.wledName };
    socket.broadcast.emit('setupWledName', data);
  });

  socket.on('setupColorChange', (data) => {
    if (data.hexId) state.setupSnapshot[data.hexId] = { ...(state.setupSnapshot[data.hexId] ?? {}), color: data.color, useIndividual: data.useIndividual ?? false };
    socket.broadcast.emit('setupColorChange', data);
  });

  socket.on('setupAliasChange', (data) => {
    if (data.hexId) state.setupSnapshot[data.hexId] = { ...(state.setupSnapshot[data.hexId] ?? {}), aliases: data.aliases ?? [] };
    socket.broadcast.emit('setupAliasChange', data);
  });

  socket.on('setupIconChange', (data) => {
    if (data.hexId) state.setupSnapshot[data.hexId] = { ...(state.setupSnapshot[data.hexId] ?? {}), icon: data.icon };
    socket.broadcast.emit('setupIconChange', data);
  });

  // ── WLED discovery + preset push ─────────────────────────────────────────
  socket.on('discoverWleds', () => {
    wled.discover(
      (ip, info) => io.emit('wledFound', { ip, ...info }),
      (done, total) => socket.emit('wledScanProgress', { done, total })
    ).then(() => socket.emit('wledScanDone'));
  });

  socket.on('wledPushMqtt', async ({ ip }) => {
    try {
      const { clientId, brokerIp } = await wled.pushMqttConfig(ip);
      socket.emit('wledMqttProgress', { ip, msg: `Pushing config… (broker=${brokerIp}, id=${clientId})` });
      socket.emit('wledMqttProgress', { ip, msg: 'Config saved — rebooting, waiting for device…' });
      socket.emit('wledMqttDone', { ip, clientId, brokerIp });
      wled.waitAndNudge(ip).catch(() => {});
    } catch (e) {
      console.info(`⚠️  MQTT config failed for ${ip}: ${e.message}`);
      socket.emit('wledMqttError', { ip, msg: e.message });
    }
  });

  socket.on('wledSetupPresets', async ({ ip }) => {
    try {
      await wled.setupPresetsWithProgress(ip, (step, total, msg) => {
        socket.emit('wledPresetProgress', { ip, step, total, msg });
      });
      socket.emit('wledPresetDone', { ip });
    } catch (e) {
      socket.emit('wledPresetError', { ip, msg: e.message });
    }
  });

  socket.on('setIdleColor', async ({ ip, color }) => {
    if (!ip || !Array.isArray(color)) return;
    try {
      await wled.wledSetIdleColor(ip, color);
      socket.emit('setIdleColorDone', { ip });
    } catch (e) {
      socket.emit('setIdleColorError', { ip, msg: e.message });
    }
  });

  socket.on('setBuzzerRoster', async (roster) => {
    state.buzzerRoster = roster;
    state.hexIdToPlayer = {};
    for (const entry of roster) {
      state.hexIdToPlayer[entry.hexId] = entry.hexId;
      for (const alias of (entry.aliases ?? [])) {
        state.hexIdToPlayer[alias] = entry.hexId;
      }
    }
    const names = roster.map(r => r.name || r.hexId);
    console.info(`📋  Roster: ${names.join(', ')}`);
    for (const { hexId, name } of roster) {
      if (name?.trim()) state.displayNames[hexId] = name.trim();
    }
    io.emit('buzzerRoster', state.buzzerRoster);
    io.emit('gameStarted', { roster });
    io.emit('displayNames', { names: state.displayNames });
    io.emit('rosterPresetsReady', false);
    io.emit('rosterSetupProgress', { type: 'roster', names });

    const STAGGER_MS = 50;
    await Promise.all(state.buzzerRoster.map(async ({ hexId, ip, name, color, useIndividual }, idx) => {
      if (idx > 0) await new Promise(r => setTimeout(r, idx * STAGGER_MS));
      const label = name || hexId;
      const liveIp = state.mqttClientIpMap[hexId] ?? ip;
      if (liveIp && liveIp !== 'unknown') {
        io.emit('rosterSetupProgress', { type: 'setting-up', name: label });
        const idleColor = useIndividual && Array.isArray(color) ? color : null;
        await wled.setupPresets(label, liveIp, idleColor);
        io.emit('rosterSetupProgress', { type: 'done', name: label });
      } else {
        console.info(`⚠️  No IP for ${hexId} — skipping`);
        io.emit('rosterSetupProgress', { type: 'skipped', name: label });
      }
    }));
    io.emit('rosterPresetsReady', true);
    state.buzzerOpen = false;
    io.emit('buzzerOpen', { open: false });
    state.saveCheckpoint();
  });
}

/** Emit setup state to a freshly connected socket */
function emitState(socket) {
  if (Object.keys(state.setupSnapshot).length > 0) socket.emit('setupSnapshot', state.setupSnapshot);
  socket.emit('mqttClientIpMap', state.mqttClientIpMap);
  socket.emit('mqttClientNameMap', state.mqttClientNameMap);
  socket.emit('buzzerRoster', state.buzzerRoster);
  if (state.buzzerRoster.length > 0) socket.emit('gameStarted', { roster: state.buzzerRoster });
}

module.exports = { init, registerHandlers, emitState };
