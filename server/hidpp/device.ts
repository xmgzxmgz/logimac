/**
 * HID++ Device Abstraction Layer
 *
 * Wraps a node-hid device handle and provides HID++ 2.0 message send/receive
 * with feature discovery and caching.
 */
import HID from 'node-hid';
import { EventEmitter } from 'events';
import {
  encodeMessage,
  decodeMessage,
  isError,
  ErrorCode,
  Feature,
  HIDppMessage,
  SHORT_REPORT_LENGTH,
  LONG_REPORT_LENGTH,
  HIDPP_REPORT_SHORT,
  HIDPP_REPORT_LONG,
} from './protocol.js';

// Re-export protocol types for other modules
export { Feature } from './protocol.js';
export type { HIDppMessage, ErrorCode } from './protocol.js';

const RESPONSE_TIMEOUT = 2000; // ms
const DEVICE_READ_INTERVAL = 10; // ms polling fallback

export interface DeviceInfo {
  path: string;
  vendorId: number;
  productId: number;
  serialNumber: string;
  product: string;
  manufacturer: string;
  interface: number;
  usagePage: number;
  usage: number;
}

export class HIDppDevice extends EventEmitter {
  private device: HID.HID;
  private deviceIndex: number;
  private swId: number;
  private featureMap: Map<number, number> = new Map(); // featureId -> featureIndex
  private pendingResponses: Map<number, {
    resolve: (msg: HIDppMessage) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();

  public name: string = 'Unknown Device';
  public features: Map<number, { version: number }> = new Map();
  public info: DeviceInfo;

  constructor(devicePath: string, deviceIndex: number = 1) {
    super();
    this.device = new HID.HID(devicePath);
    this.deviceIndex = deviceIndex;
    this.swId = Math.floor(Math.random() * 15) + 1; // 1-15
    this.info = this.parseDeviceInfo(devicePath);

    // Set up data listener
    this.device.on('data', (data: Buffer) => {
      const msg = decodeMessage(data);
      if (msg) this.handleMessage(msg);
    });

    this.device.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }

  private parseDeviceInfo(path: string): DeviceInfo {
    // node-hid's devices() gives us path info; we'll populate from enumerate
    return {
      path,
      vendorId: 0,
      productId: 0,
      serialNumber: '',
      product: '',
      manufacturer: '',
      interface: -1,
      usagePage: 0,
      usage: 0,
    };
  }

  static enumerate(): DeviceInfo[] {
    const devices = HID.devices();
    return devices
      .filter((d: HID.Device) => d.vendorId === 0x046d && d.path) // Logitech only with valid path
      .map((d: HID.Device) => ({
        path: d.path!,
        vendorId: d.vendorId,
        productId: d.productId,
        serialNumber: d.serialNumber || '',
        product: d.product || '',
        manufacturer: d.manufacturer || '',
        interface: d.interface ?? -1,
        usagePage: d.usagePage ?? 0,
        usage: d.usage ?? 0,
      }));
  }

  /**
   * Send HID++ message and wait for response
   */
  async send(
    featureIndex: number,
    func: number,
    params: Buffer
  ): Promise<HIDppMessage> {
    return new Promise((resolve, reject) => {
      const encodedFeatureIndex = featureIndex;
      const encodedFunc = func;

      const key = this.makeResponseKey(encodedFeatureIndex, encodedFunc);
      const timer = setTimeout(() => {
        this.pendingResponses.delete(key);
        reject(new Error(`HID++ response timeout for feature 0x${featureIndex.toString(16)} func ${func}`));
      }, RESPONSE_TIMEOUT);

      this.pendingResponses.set(key, { resolve, reject, timer });

      const msg = encodeMessage(this.deviceIndex, encodedFeatureIndex, encodedFunc, params, this.swId);
      try {
        this.device.write(Array.from(msg));
      } catch (err) {
        clearTimeout(timer);
        this.pendingResponses.delete(key);
        reject(err);
      }
    });
  }

  private makeResponseKey(featureIndex: number, func: number): number {
    return (featureIndex << 8) | func;
  }

  private handleMessage(msg: HIDppMessage): void {
    // Check for error responses
    if (isError(msg)) {
      const errFeature = msg.parameters[0];
      const errFunc = msg.parameters[1];
      const errCode = msg.parameters[2];
      const key = this.makeResponseKey(errFeature, errFunc);
      const pending = this.pendingResponses.get(key);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingResponses.delete(key);
        pending.reject(new Error(`HID++ Error: ${ErrorCode[errCode] || `code 0x${errCode.toString(16)}`}`));
      }
      return;
    }

    // Match to pending request
    const key = this.makeResponseKey(msg.featureIndex, msg.function);
    const pending = this.pendingResponses.get(key);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingResponses.delete(key);
      pending.resolve(msg);
      return;
    }

    // Unsolicited notification
    this.emit('notification', msg);
  }

  /**
   * Discover device features using HID++ 2.0 Root protocol
   * Feature index 0x00 is always the IRoot feature
   */
  async discoverFeatures(): Promise<void> {
    // Get number of features (IRoot function 0x00 = rootGetFeature)
    // IRoot has special behavior: featureIndex=0, function=0 gives feature count
    // Actually: func 0 = ping, func 1 = getFeatureIndex

    // First ping the device to make sure it's alive
    try {
      await this.send(0x00, 0x00, Buffer.alloc(3));
    } catch {
      // Some devices don't respond to ping, that's ok
    }

    // Get number of features: send to IRoot (feature 0) func 0
    // Actually in HID++ 2.0, the IRoot feature uses function index 0 to return
    // the feature count. The encoding is:
    // function=0, feature_index=0 -> response gives feature count in params[0]
    const countResp = await this.send(0x00, 0x00, Buffer.alloc(16));
    const featureCount = countResp.parameters[0];

    // Enumerate each feature index
    for (let i = 1; i <= Math.min(featureCount, 100); i++) {
      try {
        // IRoot func 1 = getFeatureID: returns the feature ID for a given feature index
        const resp = await this.send(0x00, 0x01, Buffer.from([i, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
        const featureId = (resp.parameters[0] << 8) | resp.parameters[1];
        const version = resp.parameters[2];

        if (featureId !== 0x0000) {
          this.featureMap.set(featureId, i);
          this.features.set(featureId, { version });
        }
      } catch (err) {
        // Skip features that error out
      }
    }

    this.emit('featuresDiscovered', this.features);
  }

  /**
   * Get the feature index for a given feature ID
   */
  getFeatureIndex(featureId: number): number | undefined {
    return this.featureMap.get(featureId);
  }

  /**
   * Get device name using Feature 0x0005
   */
  async getDeviceName(): Promise<string> {
    const fi = this.getFeatureIndex(Feature.DeviceName);
    if (!fi) throw new Error('DeviceName feature not supported');

    // func 0 = getDeviceNameLength
    const lenResp = await this.send(fi, 0x00, Buffer.alloc(16));
    const nameLen = lenResp.parameters[0];

    // func 1 = getDeviceName (read in chunks of 16 bytes)
    let name = '';
    const chunkSize = 16;
    for (let offset = 0; offset < nameLen; offset += chunkSize) {
      const resp = await this.send(fi, 0x01, Buffer.from([offset, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
      const bytesToRead = Math.min(chunkSize, nameLen - offset);
      for (let j = 0; j < bytesToRead; j++) {
        name += String.fromCharCode(resp.parameters[j]);
      }
    }

    this.name = name.trim();
    return this.name;
  }

  /**
   * Get battery level using Feature 0x0008
   */
  async getBatteryLevel(): Promise<{ level: number; charging: boolean }> {
    const fi = this.getFeatureIndex(Feature.BatteryLevel);
    if (!fi) throw new Error('Battery feature not supported');

    // func 1 = getBatteryLevelStatus
    const resp = await this.send(fi, 0x01, Buffer.alloc(16));
    const level = resp.parameters[0];
    const charging = resp.parameters[1] === 0x01;

    return { level, charging };
  }

  /**
   * Get DPI settings using Feature 0x2200
   */
  async getDPI(): Promise<{ current: number; sensor: number }> {
    const fi = this.getFeatureIndex(Feature.AdjustableDPI);
    if (!fi) throw new Error('AdjustableDPI feature not supported');

    // func 1 = getSensorDPI (sensor 0)
    const resp = await this.send(fi, 0x01, Buffer.from([0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    const dpi = (resp.parameters[1] << 8) | resp.parameters[2];
    const sensor = resp.parameters[0];

    return { current: dpi, sensor };
  }

  /**
   * Set DPI using Feature 0x2200
   */
  async setDPI(dpi: number, sensor: number = 0): Promise<void> {
    const fi = this.getFeatureIndex(Feature.AdjustableDPI);
    if (!fi) throw new Error('AdjustableDPI feature not supported');

    // func 2 = setSensorDPI
    const params = Buffer.from([
      sensor,                 // sensor index
      (dpi >> 8) & 0xff,     // DPI high byte
      dpi & 0xff,            // DPI low byte
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    await this.send(fi, 0x02, params);
  }

  /**
   * Get DPI range (min/max/steps) using Feature 0x2200
   */
  async getDPIRange(sensor: number = 0): Promise<{ min: number; max: number; step: number }> {
    const fi = this.getFeatureIndex(Feature.AdjustableDPI);
    if (!fi) throw new Error('AdjustableDPI feature not supported');

    // func 0 = getSensorDPIList
    const resp = await this.send(fi, 0x00, Buffer.from([sensor, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    const min = (resp.parameters[1] << 8) | resp.parameters[2];
    const max = (resp.parameters[3] << 8) | resp.parameters[4];
    const step = (resp.parameters[5] << 8) | resp.parameters[6];

    return { min, max, step };
  }

  /**
   * Get reprogrammable buttons info using Feature 0x1b00
   */
  async getButtonCount(): Promise<number> {
    const fi = this.getFeatureIndex(Feature.ReprogrammableButtons);
    if (!fi) throw new Error('ReprogrammableButtons feature not supported');

    // func 0 = getControlCount
    const resp = await this.send(fi, 0x00, Buffer.alloc(16));
    return resp.parameters[0];
  }

  /**
   * Get button info by index
   */
  async getButtonInfo(index: number): Promise<{
    cid: number;        // Control ID
    taskId: number;     // Current task/action
    flags: number;
    position: number;
    group: number;
    groupMask: number;
    additionalFlags: number;
  }> {
    const fi = this.getFeatureIndex(Feature.ReprogrammableButtons);
    if (!fi) throw new Error('ReprogrammableButtons feature not supported');

    // func 1 = getControlInfo (by control index, 0-based)
    const resp = await this.send(fi, 0x01, Buffer.from([index, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));

    return {
      cid: (resp.parameters[0] << 8) | resp.parameters[1],
      taskId: (resp.parameters[2] << 8) | resp.parameters[3],
      flags: resp.parameters[4],
      position: resp.parameters[5],
      group: resp.parameters[6],
      groupMask: resp.parameters[7],
      additionalFlags: resp.parameters[8],
    };
  }

  /**
   * Get all button mappings
   */
  async getAllButtons(): Promise<Array<{
    index: number;
    cid: number;
    currentTaskId: number;
    flags: number;
    position: number;
    group: number;
  }>> {
    const fi = this.getFeatureIndex(Feature.ReprogrammableButtons);
    if (!fi) throw new Error('ReprogrammableButtons feature not supported');

    const count = await this.getButtonCount();
    const buttons = [];

    for (let i = 0; i < count; i++) {
      const info = await this.getButtonInfo(i);
      buttons.push({
        index: i,
        cid: info.cid,
        currentTaskId: info.taskId,
        flags: info.flags,
        position: info.position,
        group: info.group,
      });
    }

    return buttons;
  }

  /**
   * Set button mapping
   * cid: Control ID of the button to remap
   * newTaskId: New action/task ID to assign
   */
  async setButtonMapping(cid: number, newTaskId: number): Promise<void> {
    const fi = this.getFeatureIndex(Feature.ReprogrammableButtons);
    if (!fi) throw new Error('ReprogrammableButtons feature not supported');

    // func 2 = setControlReporting
    const params = Buffer.from([
      0x00,                          // diverted (0 = not diverted)
      (cid >> 8) & 0xff,            // CID high
      cid & 0xff,                    // CID low
      (newTaskId >> 8) & 0xff,      // new task high
      newTaskId & 0xff,              // new task low
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    await this.send(fi, 0x02, params);
  }

  /**
   * Get device info (Feature 0x0003)
   */
  async getDeviceInfo(): Promise<{
    entityCount: number;
    entities: Array<{ type: number; length: number }>;
  }> {
    const fi = this.getFeatureIndex(Feature.DeviceInformation);
    if (!fi) throw new Error('DeviceInformation feature not supported');

    // func 0 = getDeviceInfo (get entity count)
    const resp = await this.send(fi, 0x00, Buffer.alloc(16));
    const entityCount = resp.parameters[0];
    const entities = [];

    for (let i = 0; i < Math.min(entityCount, 4); i++) {
      // func 1 = getDeviceType with entity index
      const entityResp = await this.send(fi, 0x01, Buffer.from([i, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
      entities.push({
        type: entityResp.parameters[0],
        length: entityResp.parameters[1],
      });
    }

    return { entityCount, entities };
  }

  close(): void {
    // Clear all pending responses
    for (const [_, pending] of this.pendingResponses) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Device closed'));
    }
    this.pendingResponses.clear();

    try {
      this.device.close();
    } catch {
      // ignore
    }
    this.emit('closed');
  }
}

// Common Logitech button CID mappings
export const BUTTON_NAMES: Record<number, string> = {
  0x00d0: 'Left Button',
  0x00d1: 'Right Button',
  0x00d2: 'Middle Button',
  0x00d3: 'Back Button',
  0x00d4: 'Forward Button',
  0x00d5: 'Button 6',
  0x00d6: 'Button 7',
  0x00d7: 'Button 8',
  0x00f1: 'DPI Switch',
  0x00f2: 'DPI Up',
  0x00f3: 'DPI Down',
  0x00c1: 'SmartShift',
  0x00c2: 'Gesture Button',
  0x00c3: 'Top Button',
  0x00c4: 'Bottom Button',
  0x00c5: 'Left Tilt',
  0x00c6: 'Right Tilt',
  0x00c7: 'Left Scroll',
  0x00c8: 'Right Scroll',
};

// Common task/action IDs
export const TASK_NAMES: Record<number, string> = {
  0x0000: 'Default',
  0x0001: 'Mouse Left Click',
  0x0002: 'Mouse Right Click',
  0x0003: 'Mouse Middle Click',
  0x0004: 'Mouse Back',
  0x0005: 'Mouse Forward',
  0x0006: 'Mouse Scroll Up',
  0x0007: 'Mouse Scroll Down',
  0x0008: 'DPI Cycle',
  0x0009: 'DPI Up',
  0x000a: 'DPI Down',
  0x00ff: 'Disabled',
};
