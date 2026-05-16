import 'dotenv/config';
import express from 'express';

const app = express();
app.use(express.json());

// In-memory data store for ESP32 states (Simulating IoT behavior)
let sensorData = { temp: 24.5, hum: 55.0 };
let history: any[] = [];
let relays: Record<string, boolean> = { '1': false, '2': false, '3': false, '4': false };
let logs: any[] = [];
let lastEspHeartbeat = Date.now();

// Utility for Telegram Messaging
async function sendTelegramMessage(text: string) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) {
    logs.unshift({ time: new Date().toISOString(), message: "Telegram not configured, message skipped.", type: "system" });
    return;
  }
  
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Status ${response.status}: ${errText}`);
    }
    logs.unshift({ time: new Date().toISOString(), message: text, type: "telegram" });
  } catch (error: any) {
    logs.unshift({ time: new Date().toISOString(), message: `Telegram Error: ${error.message}`, type: "error" });
  }
  
  // keep logs array compact
  if (logs.length > 50) logs.pop();
}

// ESP32 Synchronization Endpoint (Hardware device calls this)
app.get('/esp-sync', (req, res) => {
  const { temp, hum } = req.query;
  
  if (temp && hum) {
    sensorData.temp = Number(temp);
    sensorData.hum = Number(hum);
    
    // Periodically save to history to avoid overflowing memory
    if (Math.random() > 0.2) {
      history.push({ time: new Date().toISOString(), temp: sensorData.temp, hum: sensorData.hum });
      if (history.length > 50) history.shift();
    }
  }
  
  lastEspHeartbeat = Date.now();
  
  // Return current relay statuses so the ESP32 can act on them
  res.json(relays);
});

// APIs
app.get('/full-state', (req, res) => {
  const formattedData = {
    temp: Number(sensorData.temp.toFixed(1)),
    hum: Number(sensorData.hum.toFixed(1))
  };

  const espoOnline = (Date.now() - lastEspHeartbeat) < 15000;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;

  res.json({
    dht: formattedData,
    history: history,
    status: {
      esp32_online: espoOnline,
      telegram_configured: !!(BOT_TOKEN && CHAT_ID),
      relays: relays
    },
    logs: logs
  });
});

app.get('/dht', (req, res) => {
  const formattedData = {
    temp: Number(sensorData.temp.toFixed(1)),
    hum: Number(sensorData.hum.toFixed(1))
  };

  res.json(formattedData);
});

app.get('/dht/history', (req, res) => {
  res.json(history);
});

app.get('/relay/:id/:state', async (req, res) => {
  const { id, state } = req.params;
  const pinMapping: Record<string, number> = { '1': 5, '2': 19, '3': 18, '4': 23 };
  
  if (!['1', '2', '3', '4'].includes(id) || !['on', 'off'].includes(state)) {
    res.status(400).json({ error: "Invalid relay ID or state" });
    return;
  }

  const notify = req.query.notify !== 'false';
  const isTurningOn = state === 'on';
  relays[id] = isTurningOn;
  lastEspHeartbeat = Date.now(); // Interaction implies connection

  // Try to push command directly to ESP if an IP is configured
  if (process.env.ESP_IP) {
    try {
      // Timeout added so it doesn't block if ESP is offline or on a private network relative to the server
      await fetch(`http://${process.env.ESP_IP}/relay/${id}/${state}`, { signal: AbortSignal.timeout(2000) });
    } catch (err) {
      console.log("Failed to ping ESP directly:", err);
    }
  }

  const pin = pinMapping[id];
  
  if (notify) {
    const message = `\uD83D\uDD0C Relay ${id} (Pin ${pin}) was turned ${state.toUpperCase()}`;
    await sendTelegramMessage(message);
  }

  res.json({
    success: true,
    relay_id: id,
    pin: pin,
    state: isTurningOn,
    relays_status: relays
  });
});

app.post('/api/notify', express.json(), async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "No message provided" });
  await sendTelegramMessage(message);
  res.json({ success: true });
});

app.get('/status', (req, res) => {
  const espoOnline = (Date.now() - lastEspHeartbeat) < 15000; // 15 seconds threshold
  const { BOT_TOKEN, CHAT_ID } = process.env;
  
  res.json({
    esp32_online: espoOnline,
    telegram_configured: !!(BOT_TOKEN && CHAT_ID),
    relays: relays
  });
});

app.get('/logs', (req, res) => {
  res.json(logs);
});

export default app;
