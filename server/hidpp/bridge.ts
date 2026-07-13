/**
 * HID++ Helper Bridge v2
 * Communicates with the Swift HID helper via stdin/stdout JSON
 */
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface HelperMessage {
  status?: string;
  error?: string;
  name?: string;
  length?: number;
  sensorCount?: number;
  currentDPI?: number;
  defaultDPI?: number;
  dpi?: number;
  featureCount?: number;
  features?: Array<Record<string, unknown>>;
  response?: string;
  params?: string;
  raw?: number[];
  hex?: string;
  feature?: number;
  pid?: number;
  device?: string;
}

export class HIDppBridge extends EventEmitter {
  private process: ChildProcess | null = null;
  private ready: boolean = false;
  private buffer: string = '';
  private pendingResolve: ((msg: HelperMessage) => void) | null = null;

  async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const helperPath = join(__dirname, '../hid-helper');
      this.process = spawn(helperPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
      let started = false;

      this.process.stdout?.on('data', (data: Buffer) => {
        this.buffer += data.toString();
        let idx: number;
        while ((idx = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, idx).trim();
          this.buffer = this.buffer.slice(idx + 1);
          if (!line) continue;
          try {
            const msg: HelperMessage = JSON.parse(line);
            if (msg.status === 'ready' && !started) {
              started = true;
              this.ready = true;
              resolve();
            }
            if (this.pendingResolve) {
              const r = this.pendingResolve;
              this.pendingResolve = null;
              r(msg);
            }
            this.emit('message', msg);
          } catch {}
        }
      });

      this.process.stderr?.on('data', (d: Buffer) => console.error('helper:', d.toString()));
      this.process.on('exit', () => { this.ready = false; });
      this.process.on('error', reject);
      setTimeout(() => { if (!started) reject(new Error('helper start timeout')); }, 10000);
    });
  }

  private async cmd(command: Record<string, unknown>, timeout = 10000): Promise<HelperMessage> {
    const stdin = this.process?.stdin;
    if (!stdin || !this.ready) throw new Error('not ready');
    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      const timer = setTimeout(() => { this.pendingResolve = null; reject(new Error('timeout')); }, timeout);
      this.pendingResolve = (msg) => { clearTimeout(timer); resolve(msg); };
      stdin.write(JSON.stringify(command) + '\n');
    });
  }

  async open(): Promise<void> {
    const r = await this.cmd({ action: 'open' });
    if (r.error) throw new Error(r.error);
  }

  async ensureOpen(): Promise<void> {
    // Always send open - the helper handles re-opening gracefully
    await this.open();
  }

  async getName(): Promise<string> {
    const r = await this.cmd({ action: 'getName' });
    if (r.error) throw new Error(r.error);
    return r.name || 'Unknown';
  }

  async getDPI(): Promise<{ current: number; default: number; sensors: number }> {
    const r = await this.cmd({ action: 'getDPI' });
    if (r.error) throw new Error(r.error);
    return { current: r.currentDPI || 0, default: r.defaultDPI || 0, sensors: r.sensorCount || 0 };
  }

  async setDPI(dpi: number): Promise<number> {
    const r = await this.cmd({ action: 'setDPI', dpi });
    if (r.error) throw new Error(r.error);
    return r.dpi || dpi;
  }

  async getButtons(): Promise<HelperMessage> {
    return this.cmd({ action: 'getButtons' });
  }

  async discover(): Promise<HelperMessage> {
    return this.cmd({ action: 'discover' }, 30000);
  }

  async raw(feature: number, func: number, params?: number[]): Promise<HelperMessage> {
    return this.cmd({ action: 'raw', feature, function: func, params: params || new Array(16).fill(0) });
  }

  async close(): Promise<void> {
    await this.cmd({ action: 'close' });
  }

  stop(): void {
    this.process?.stdin?.write(JSON.stringify({ action: 'quit' }) + '\n');
    setTimeout(() => this.process?.kill(), 500);
  }

  get isReady(): boolean { return this.ready; }
}
