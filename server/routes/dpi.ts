import { Router } from 'express';
import { DeviceManager } from '../device-manager.js';

export function createDPIRoutes(manager: DeviceManager): Router {
  const router = Router();
  router.get('/devices/:id/dpi', async (_req, res) => {
    const dpi = await manager.refreshDPI();
    res.json(dpi || { error: 'not available' });
  });
  router.post('/devices/:id/dpi', async (req, res) => {
    const { dpi } = req.body;
    const actual = await manager.setDPI(dpi);
    res.json(actual ? { dpi: actual } : { error: 'failed' });
  });
  return router;
}
