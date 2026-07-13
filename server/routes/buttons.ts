/**
 * Button Routes v5 - hidutil for direct mapping + shortcut daemon for combos
 */
import { Router } from 'express';
import { execSync } from 'child_process';
import { ShortcutBridge } from '../shortcut-bridge.js';

const MOUSE_BASE = 0x900000000;
const KEY_BASE = 0x700000000;
const CONSUMER_BASE = 0xB00000000;

const KEY_USAGES: Record<string, number> = {
  'a': 4, 'b': 5, 'c': 6, 'd': 7, 'e': 8, 'f': 9, 'g': 10, 'h': 11,
  'i': 12, 'j': 13, 'k': 14, 'l': 15, 'm': 16, 'n': 17, 'o': 18, 'p': 19,
  'q': 20, 'r': 21, 's': 22, 't': 23, 'u': 24, 'v': 25, 'w': 26, 'x': 27,
  'y': 28, 'z': 29, '1': 30, '2': 31, '3': 32, '4': 33, '5': 34,
  '6': 35, '7': 36, '8': 37, '9': 38, '0': 39,
  'return': 40, 'esc': 41, 'backspace': 42, 'tab': 43, 'space': 44,
  'f1': 58, 'f2': 59, 'f3': 60, 'f4': 61, 'f5': 62, 'f6': 63,
  'f7': 64, 'f8': 65, 'f9': 66, 'f10': 67, 'f11': 68, 'f12': 69,
  'f13': 105, 'f14': 106, 'f15': 107, 'f16': 108, 'f17': 109, 'f18': 110,
  'f19': 111, 'f20': 112,
  'delete': 76, 'home': 74, 'end': 77, 'pageup': 75, 'pagedown': 78,
  'left': 80, 'right': 79, 'down': 81, 'up': 82,
};

const CONSUMER_USAGES: Record<string, number> = {
  'mute': 0xE2, 'volume_up': 0xE9, 'volume_down': 0xEA,
  'play_pause': 0xCD, 'next_track': 0xB5, 'prev_track': 0xB6,
};

// Shortcut presets: button → F-key → shortcut
// We use F13-F20 as intermediary keys (not on most keyboards)
const SHORTCUT_PRESETS: Record<string, { fkey: number; keycode: number; flags: string[] }> = {
  'copy':       { fkey: 105, keycode: 8,  flags: ['cmd'] },      // F13 → ⌘C
  'paste':      { fkey: 106, keycode: 25, flags: ['cmd'] },      // F14 → ⌘V
  'cut':        { fkey: 107, keycode: 27, flags: ['cmd'] },      // F15 → ⌘X
  'undo':       { fkey: 108, keycode: 29, flags: ['cmd'] },      // F16 → ⌘Z
  'redo':       { fkey: 109, keycode: 29, flags: ['cmd', 'shift'] }, // F17 → ⌘⇧Z
  'selectall':  { fkey: 110, keycode: 0,  flags: ['cmd'] },      // F18 → ⌘A
  'save':       { fkey: 111, keycode: 1,  flags: ['cmd'] },      // F19 → ⌘S
  'close':      { fkey: 112, keycode: 13, flags: ['cmd'] },      // F20 → ⌘W
};

let shortcutBridge: ShortcutBridge | null = null;

export async function initShortcutBridge(): Promise<boolean> {
  shortcutBridge = new ShortcutBridge();
  return shortcutBridge.start();
}

function getHidCode(target: string): number | null {
  if (target.startsWith('mouse:')) return MOUSE_BASE + parseInt(target.slice(6));
  if (target.startsWith('key:')) {
    const key = target.slice(4).toLowerCase();
    return KEY_USAGES[key] != null ? KEY_BASE + KEY_USAGES[key] : null;
  }
  if (target.startsWith('consumer:')) {
    const key = target.slice(9).toLowerCase();
    return CONSUMER_USAGES[key] != null ? CONSUMER_BASE + CONSUMER_USAGES[key] : null;
  }
  const num = parseInt(target);
  if (!isNaN(num)) return MOUSE_BASE + num;
  return KEY_USAGES[target.toLowerCase()] != null ? KEY_BASE + KEY_USAGES[target.toLowerCase()] : null;
}

function getMappings(): Array<{src: number, dst: number}> {
  try {
    const raw = execSync('hidutil property --get UserKeyMapping', { encoding: 'utf8' });
    if (!raw || raw.includes('(null)') || raw.trim() === '') return [];
    const mappings: Array<{src: number, dst: number}> = [];
    const blockRegex = /\{([^}]+)\}/g;
    let m;
    while ((m = blockRegex.exec(raw)) !== null) {
      const src = m[1].match(/HIDKeyboardModifierMappingSrc = (\d+)/);
      const dst = m[1].match(/HIDKeyboardModifierMappingDst = (\d+)/);
      if (src && dst) mappings.push({ src: parseInt(src[1]), dst: parseInt(dst[1]) });
    }
    return mappings;
  } catch { return []; }
}

function applyMappings(mappings: Array<{src: number, dst: number}>) {
  const formatted = mappings.map(m => ({
    HIDKeyboardModifierMappingSrc: m.src,
    HIDKeyboardModifierMappingDst: m.dst,
  }));
  execSync(`hidutil property --set '${JSON.stringify({ UserKeyMapping: formatted })}'`);
}

function getButtonName(src: number): string {
  const btn = src - MOUSE_BASE;
  const names: Record<number, string> = { 1: '左键', 2: '右键', 3: '中键', 4: '后退键', 5: '前进键', 6: 'DPI Shift' };
  return names[btn] || `Button ${btn}`;
}

function getTargetLabel(dst: number, mappings?: Array<{src: number, dst: number, shortcut?: string}>): string {
  // Check if it's an F-key mapped to a shortcut
  const fkeyName = Object.entries(SHORTCUT_PRESETS).find(([_, v]) => v.fkey === (dst - KEY_BASE));
  if (fkeyName) return fkeyName[0];

  if (dst >= CONSUMER_BASE) {
    const key = dst - CONSUMER_BASE;
    const names: Record<number, string> = { 0xE2: '静音', 0xE9: '音量+', 0xEA: '音量-', 0xCD: '播放/暂停', 0xB5: '下一曲', 0xB6: '上一曲' };
    return names[key] || `Consumer ${key}`;
  }
  if (dst >= KEY_BASE) {
    const key = dst - KEY_BASE;
    const name = Object.entries(KEY_USAGES).find(([_, v]) => v === key);
    return name ? name[0].toUpperCase() : `Key ${key}`;
  }
  if (dst >= MOUSE_BASE) return getButtonName(dst);
  return `0x${dst.toString(16)}`;
}

export function createButtonRoutes(): Router {
  const router = Router();

  router.get('/devices/:id/buttons', (_req, res) => {
    const raw = getMappings();
    const mappings = raw.map(m => ({
      src: `0x${m.src.toString(16)}`, dst: `0x${m.dst.toString(16)}`,
      srcType: m.src >= MOUSE_BASE ? 'mouse' : 'keyboard',
      dstType: m.dst >= CONSUMER_BASE ? 'consumer' : m.dst >= KEY_BASE ? 'keyboard' : 'mouse',
      srcButton: m.src >= MOUSE_BASE ? m.src - MOUSE_BASE : undefined,
      dstButton: m.dst >= MOUSE_BASE ? m.dst - MOUSE_BASE : undefined,
      dstKey: m.dst >= KEY_BASE && m.dst < CONSUMER_BASE ? m.dst - KEY_BASE : undefined,
      srcName: getButtonName(m.src),
      dstName: getTargetLabel(m.dst),
      isShortcut: Object.values(SHORTCUT_PRESETS).some(s => s.fkey === m.dst - KEY_BASE),
    }));
    res.json({ remapReady: true, method: 'hidutil', mappings });
  });

  router.post('/devices/:id/buttons/remap', async (req, res) => {
    const { from, to } = req.body;
    const srcCode = getHidCode(String(from));
    if (srcCode == null) return res.status(400).json({ error: 'Invalid source' });

    // Check if it's a shortcut preset
    const preset = SHORTCUT_PRESETS[String(to).toLowerCase()];
    if (preset && shortcutBridge?.isReady) {
      // Map button to F-key via hidutil
      const fkeyCode = KEY_BASE + preset.fkey;
      const existing = getMappings().filter(m => m.src !== srcCode);
      existing.push({ src: srcCode, dst: fkeyCode });
      applyMappings(existing);
      // Register F-key → shortcut in daemon
      await shortcutBridge.set(preset.fkey, preset.keycode, preset.flags);
      return res.json({ status: 'ok', shortcut: to });
    }

    // Direct mapping
    const dstCode = getHidCode(String(to));
    if (dstCode == null) return res.status(400).json({ error: 'Invalid target' });
    const existing = getMappings().filter(m => m.src !== srcCode);
    existing.push({ src: srcCode, dst: dstCode });
    applyMappings(existing);
    res.json({ status: 'ok' });
  });

  router.post('/devices/:id/buttons/unmap', (req, res) => {
    const { from } = req.body;
    const srcCode = getHidCode(String(from));
    if (srcCode == null) return res.status(400).json({ error: 'Invalid' });
    const existing = getMappings().filter(m => m.src !== srcCode);
    applyMappings(existing);
    res.json({ status: 'ok' });
  });

  router.post('/devices/:id/buttons/reset', async (_req, res) => {
    applyMappings([]);
    // Clear shortcut daemon
    if (shortcutBridge?.isReady) {
      for (const preset of Object.values(SHORTCUT_PRESETS)) {
        await shortcutBridge.remove(preset.fkey).catch(() => {});
      }
    }
    res.json({ status: 'ok' });
  });

  router.get('/buttons/presets', (_req, res) => {
    res.json({ presets: Object.entries(SHORTCUT_PRESETS).map(([name, cfg]) => ({
      name, fkey: cfg.fkey, keycode: cfg.keycode, flags: cfg.flags,
    }))});
  });

  router.get('/buttons/keys', (_req, res) => {
    res.json({ keys: KEY_USAGES, consumers: CONSUMER_USAGES });
  });

  return router;
}
