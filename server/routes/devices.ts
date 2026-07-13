/**
 * Device API Routes v4
 */
import { Router } from 'express';
import { DeviceManager } from '../device-manager.js';

export function createDeviceRoutes(manager: DeviceManager): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ devices: manager.getAllDevices().map(toJson) });
  });

  router.get('/:id', (req, res) => {
    const d = manager.getDevice(decodeURIComponent(req.params.id));
    if (!d) return res.status(404).json({ error: 'not found' });
    res.json(toJson(d));
  });

  router.post('/scan', async (_req, res) => {
    try {
      await manager.scan();
      res.json({ devices: manager.getAllDevices().map(toJson) });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  router.get('/:id/dpi', async (_req, res) => {
    res.json(await manager.refreshDPI() || { error: 'failed' });
  });

  router.post('/:id/dpi', async (req, res) => {
    const { dpi } = req.body;
    const actual = await manager.setDPI(dpi);
    res.json(actual ? { dpi: actual } : { error: 'failed' });
  });

  return router;
}

function toJson(d: any) {
  return {
    id: d.id, name: d.name, connected: d.connected,
    productId: d.productId, vendorId: d.vendorId,
    battery: d.battery, dpi: d.dpi,
  };
}
