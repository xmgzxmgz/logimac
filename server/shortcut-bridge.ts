/**
 * Shortcut Bridge - manages the CGEventTap shortcut daemon
 */
import { spawn, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ShortcutMsg { status?: string; error?: string; trigger?: number; keycode?: number; shortcuts?: any[]; }

export class ShortcutBridge {
  private proc: ChildProcess | null = null;
  private ready = false;
  private buffer = '';
  private pendingResolve: ((msg: ShortcutMsg) => void) | null = null;

  async start(): Promise<boolean> {
    return new Promise(resolve => {
      this.proc = spawn(join(__dirname, 'shortcut-daemon'), [], { stdio: ['pipe', 'pipe', 'pipe'] });
      let started = false;

      this.proc.stdout?.on('data', (d: Buffer) => {
        this.buffer += d.toString();
        let idx: number;
        while ((idx = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, idx).trim();
          this.buffer = this.buffer.slice(idx + 1);
          if (!line) continue;
          try {
            const msg: ShortcutMsg = JSON.parse(line);
            if (msg.status === 'started' && !started) { started = true; this.ready = true; resolve(true); }
            if (msg.error === 'accessibility_required' && !started) { started = true; resolve(false); }
            if (this.pendingResolve) { const r = this.pendingResolve; this.pendingResolve = null; r(msg); }
          } catch {}
        }
      });

      this.proc.on('error', () => { if (!started) resolve(false); });
      setTimeout(() => { if (!started) resolve(false); }, 5000);
    });
  }

  private async cmd(c: Record<string, unknown>): Promise<ShortcutMsg> {
    const stdin = this.proc?.stdin;
    if (!stdin || !this.ready) throw new Error('not ready');
    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      const t = setTimeout(() => { this.pendingResolve = null; reject(new Error('timeout')); }, 3000);
      this.pendingResolve = m => { clearTimeout(t); resolve(m); };
      stdin.write(JSON.stringify(c) + '\n');
    });
  }

  async set(trigger: number, keycode: number, flags: string[]) { return this.cmd({ action: 'set', trigger, keycode, flags }); }
  async remove(trigger: number) { return this.cmd({ action: 'remove', trigger }); }
  async getAll() { return this.cmd({ action: 'get' }); }
  stop() { this.proc?.stdin?.write(JSON.stringify({ action: 'quit' }) + '\n'); setTimeout(() => this.proc?.kill(), 500); }
  get isReady() { return this.ready; }
}
