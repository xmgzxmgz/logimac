/**
 * Device Manager v4 - DPI via HID++ + Button via hidutil
 */
import { EventEmitter } from 'events';
import { HIDppBridge } from './hidpp/bridge.js';

export interface ManagedDevice {
  id: string;
  name: string;
  productId: string;
  vendorId: string;
  battery: { level: number; charging: boolean } | null;
  dpi: { current: number; default: number; sensors: number } | null;
  connected: boolean;
  lastSeen: number;
}

export class DeviceManager extends EventEmitter {
  private bridge: HIDppBridge;
  private device: ManagedDevice | null = null;
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor() {
    super();
    this.bridge = new HIDppBridge();
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.bridge.start();
    this.initialized = true;
    console.log('HID++ helper initialized');
  }

  async scan(): Promise<ManagedDevice[]> {
    if (!this.initialized) await this.init();
    try {
      await this.bridge.open();
      const name = await this.bridge.getName();
      const dpi = await this.bridge.getDPI();
      if (!this.device) {
        this.device = {
          id: 'logi-g502', name, productId: '0xc08b', vendorId: '0x046d',
          battery: null, dpi, connected: true, lastSeen: Date.now(),
        };
        this.emit('deviceConnected', this.device);
        console.log(`Connected: ${name} (DPI: ${dpi.current})`);
      } else {
        this.device.name = name;
        this.device.dpi = dpi;
        this.device.connected = true;
        this.device.lastSeen = Date.now();
      }
    } catch (err) {
      if (this.device) this.device.connected = false;
    }
    return this.getAllDevices();
  }

  async refreshDPI() {
    if (!this.initialized) return null;
    try {
      await this.bridge.open();
      const dpi = await this.bridge.getDPI();
      if (this.device) this.device.dpi = dpi;
      return dpi;
    } catch { return null; }
  }

  async setDPI(dpi: number) {
    if (!this.initialized) return null;
    try {
      await this.bridge.open();
      const actual = await this.bridge.setDPI(dpi);
      if (this.device?.dpi) this.device.dpi.current = actual;
      return actual;
    } catch { return null; }
  }

  startScanning(intervalMs = 8000) {
    this.scan();
    this.scanInterval = setInterval(() => this.scan(), intervalMs);
  }

  stopScanning() {
    if (this.scanInterval) { clearInterval(this.scanInterval); this.scanInterval = null; }
  }

  getAllDevices(): ManagedDevice[] { return this.device ? [this.device] : []; }
  getConnectedDevices() { return this.getAllDevices().filter(d => d.connected); }
  getDevice(id: string) { return this.device?.id === id ? this.device : undefined; }

  closeAll() {
    this.stopScanning();
    this.bridge.stop();
  }
}
