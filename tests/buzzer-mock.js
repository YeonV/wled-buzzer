const mqtt = require('mqtt');

class BuzzerMock {
  constructor(clientId, mqttPort) {
    this.clientId = clientId;
    this.mqttPort = mqttPort;
    this.client = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(`mqtt://localhost:${this.mqttPort}`, {
        clientId: this.clientId,
      });

      this.client.on('connect', () => {
        // console.log(`[Buzzer ${this.clientId}] Connected to MQTT`);
        // WLED sends status on connect
        this.sendStatus(4); // IDLE
        resolve();
      });

      this.client.on('error', (err) => {
        reject(err);
      });
    });
  }

  sendStatus(presetId) {
    if (this.client) {
      const topic = `wled/${this.clientId}/status`;
      const payload = JSON.stringify({ state: { ps: presetId, on: true, bri: 255 } });
      this.client.publish(topic, payload);
    }
  }

  async press() {
    this.sendStatus(1); // PRESS
  }

  async disconnect() {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
  }
}

module.exports = BuzzerMock;
