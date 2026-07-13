import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DeviceManager } from './device-manager.js';
import { createDeviceRoutes } from './routes/devices.js';
import { createButtonRoutes, initShortcutBridge } from './routes/buttons.js';
import { setupWebSocket } from './websocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = 18765;

const app = express();
const httpServer = createServer(app);
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '../client/dist')));

const manager = new DeviceManager();

app.use('/api/devices', createDeviceRoutes(manager));
app.use('/api', createButtonRoutes());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', devices: manager.getConnectedDevices().length });
});

app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, '../client/dist/index.html'));
});

setupWebSocket(httpServer, manager);

httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n  LogiMac running at http://localhost:${PORT}\n`);
  try {
    await manager.init();
    const shortcutOk = await initShortcutBridge();
    console.log(`Shortcut daemon: ${shortcutOk ? 'active' : 'needs accessibility permission'}`);
    manager.startScanning(8000);
  } catch (err) {
    console.error('Init failed:', (err as Error).message);
  }
});

process.on('SIGINT', () => { manager.closeAll(); process.exit(0); });
process.on('SIGTERM', () => { manager.closeAll(); process.exit(0); });
