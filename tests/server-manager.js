const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const { createMockWledServer } = require('./wled-mock');

class ServerManager {
  constructor(configPath) {
    const cfg = require(configPath);
    this.configPath = configPath;
    this.wsPort = cfg.ports.ws;
    this.wledMock = cfg.wledPort ? createMockWledServer(cfg.wledPort) : null;
    this.backendProcess = null;
  }

  async start() {
    // Clean up checkpoint so tests always start fresh
    const checkpointPath = path.join(__dirname, '../backend/game-state.json');
    try { require('fs').unlinkSync(checkpointPath); } catch {}

    if (this.wledMock) {
      await this.wledMock.start();
      console.log(`Mock WLED server running on port ${require(this.configPath).wledPort}`);
    }
    return new Promise((resolve, reject) => {
      console.log('Starting backend server...');
      this.backendProcess = spawn('node', [path.join(__dirname, '../backend/server.js')], {
        env: {
          ...process.env,
          BUZZER_CONFIG: this.configPath,
        },
      });

      this.backendProcess.stdout.on('data', (data) => {
        const output = data.toString();
        // console.log(`[Backend] ${output.trim()}`);
        if (output.includes('WLED Buzzer running')) {
          resolve();
        }
      });

      let stderrBuf = '';
      this.backendProcess.stderr.on('data', (data) => { stderrBuf += data.toString(); });
      this.backendProcess.on('close', () => { if (stderrBuf.trim()) console.error('[Backend STDERR]\n' + stderrBuf.trim()); });

      this.backendProcess.on('close', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Backend process exited with code ${code}`));
        }
      });

      // Timeout if server doesn't start
      setTimeout(() => reject(new Error('Server start timed out')), 10000);
    });
  }

  async stop() {
    if (this.backendProcess) {
      this.backendProcess.kill();
      this.backendProcess = null;
    }
    if (this.wledMock) await this.wledMock.stop();
  }

  async isRunning() {
    return new Promise((resolve) => {
      http.get(`http://localhost:${this.wsPort}`, (res) => {
        resolve(res.statusCode === 200);
      }).on('error', () => {
        resolve(false);
      });
    });
  }
}

module.exports = ServerManager;
