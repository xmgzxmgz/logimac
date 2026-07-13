import { useState, useEffect } from 'react';
import { Device, fetchButtonMap, remapButton, unmapButton, resetButtons } from '../api/client';

interface Props { device: Device }

// G502 HERO SE buttons (mouse HID usage numbers)
const BUTTONS = [
  { id: 1, name: '左键', icon: '①', desc: 'Left Click', canRemap: false },
  { id: 2, name: '右键', icon: '②', desc: 'Right Click', canRemap: false },
  { id: 3, name: '中键', icon: '③', desc: 'Scroll Wheel Press', canRemap: true },
  { id: 4, name: '后退键', icon: '④', desc: 'Side Front (Back)', canRemap: true },
  { id: 5, name: '前进键', icon: '⑤', desc: 'Side Back (Forward)', canRemap: true },
  { id: 6, name: 'DPI Shift', icon: '⑥', desc: 'Thumb Sniper Button', canRemap: true },
];

const KEY_OPTIONS: Array<{ label: string; code: string }> = [
  // Shortcut presets (⌘ combos)
  { label: '📋 复制 ⌘C', code: 'copy' },
  { label: '📌 粘贴 ⌘V', code: 'paste' },
  { label: '✂️ 剪切 ⌘X', code: 'cut' },
  { label: '↩️ 撤销 ⌘Z', code: 'undo' },
  { label: '↪️ 重做 ⌘⇧Z', code: 'redo' },
  { label: '🔘 全选 ⌘A', code: 'selectall' },
  { label: '💾 保存 ⌘S', code: 'save' },
  { label: '❌ 关闭 ⌘W', code: 'close' },
  // Mouse buttons
  { label: '→ 左键', code: 'mouse:1' },
  { label: '→ 右键', code: 'mouse:2' },
  { label: '→ 中键', code: 'mouse:3' },
  { label: '→ 后退键', code: 'mouse:4' },
  { label: '→ 前进键', code: 'mouse:5' },
  // Common keys
  { label: '→ A', code: 'key:a' }, { label: '→ B', code: 'key:b' },
  { label: '→ C', code: 'key:c' }, { label: '→ D', code: 'key:d' },
  { label: '→ E', code: 'key:e' }, { label: '→ F', code: 'key:f' },
  { label: '→ G', code: 'key:g' }, { label: '→ H', code: 'key:h' },
  { label: '→ I', code: 'key:i' }, { label: '→ J', code: 'key:j' },
  { label: '→ K', code: 'key:k' }, { label: '→ L', code: 'key:l' },
  { label: '→ M', code: 'key:m' }, { label: '→ N', code: 'key:n' },
  { label: '→ O', code: 'key:o' }, { label: '→ P', code: 'key:p' },
  { label: '→ Q', code: 'key:q' }, { label: '→ R', code: 'key:r' },
  { label: '→ S', code: 'key:s' }, { label: '→ T', code: 'key:t' },
  { label: '→ U', code: 'key:u' }, { label: '→ V', code: 'key:v' },
  { label: '→ W', code: 'key:w' }, { label: '→ X', code: 'key:x' },
  { label: '→ Y', code: 'key:y' }, { label: '→ Z', code: 'key:z' },
  // Numbers
  { label: '→ 0', code: 'key:0' }, { label: '→ 1', code: 'key:1' },
  { label: '→ 2', code: 'key:2' }, { label: '→ 3', code: 'key:3' },
  { label: '→ 4', code: 'key:4' }, { label: '→ 5', code: 'key:5' },
  { label: '→ 6', code: 'key:6' }, { label: '→ 7', code: 'key:7' },
  { label: '→ 8', code: 'key:8' }, { label: '→ 9', code: 'key:9' },
  // Special
  { label: '→ Space 空格', code: 'key:space' },
  { label: '→ Return 回车', code: 'key:return' },
  { label: '→ Tab', code: 'key:tab' },
  { label: '→ Esc', code: 'key:esc' },
  { label: '→ Delete', code: 'key:delete' },
  { label: '→ F1', code: 'key:f1' }, { label: '→ F2', code: 'key:f2' },
  { label: '→ F3', code: 'key:f3' }, { label: '→ F4', code: 'key:f4' },
  { label: '→ F5', code: 'key:f5' }, { label: '→ F6', code: 'key:f6' },
  { label: '→ F7', code: 'key:f7' }, { label: '→ F8', code: 'key:f8' },
  { label: '→ F9', code: 'key:f9' }, { label: '→ F10', code: 'key:f10' },
  { label: '→ F11', code: 'key:f11' }, { label: '→ F12', code: 'key:f12' },
  { label: '→ F13', code: 'key:f13' }, { label: '→ F14', code: 'key:f14' },
  { label: '→ F15', code: 'key:f15' }, { label: '→ F16', code: 'key:f16' },
  { label: '→ F17', code: 'key:f17' }, { label: '→ F18', code: 'key:f18' },
  // Consumer
  { label: '→ 静音', code: 'consumer:mute' },
  { label: '→ 音量+', code: 'consumer:volume_up' },
  { label: '→ 音量-', code: 'consumer:volume_down' },
  { label: '→ 播放/暂停', code: 'consumer:play_pause' },
  { label: '→ 下一曲', code: 'consumer:next_track' },
  { label: '→ 上一曲', code: 'consumer:prev_track' },
];

interface Mapping {
  src: string; dst: string;
  srcType: string; dstType: string;
  srcButton?: number; dstButton?: number; dstKey?: number;
  srcName?: string; dstName?: string; isShortcut?: boolean;
}

export default function ButtonConfig({ device }: Props) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const data = await fetchButtonMap(device.id);
    setMappings(data.mappings || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [device.id]);

  const doRemap = async (fromBtn: number, toCode: string) => {
    await remapButton(device.id, `mouse:${fromBtn}`, toCode);
    await refresh();
    setEditing(null);
  };

  const doUnmap = async (fromBtn: number) => {
    await unmapButton(device.id, `mouse:${fromBtn}`);
    await refresh();
    setEditing(null);
  };

  const doReset = async () => {
    await resetButtons(device.id);
    await refresh();
  };

  if (loading) return <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 animate-pulse h-32" />;

  const getMapping = (btnId: number): Mapping | undefined =>
    mappings.find(m => m.srcButton === btnId);

  const getTargetLabel = (m: Mapping): string => {
    if (m.isShortcut) return m.dstName || 'Shortcut';
    if (m.dstName) return m.dstName;
    if (m.dstButton) {
      const btn = BUTTONS.find(b => b.id === m.dstButton);
      return btn ? btn.name : `Button ${m.dstButton}`;
    }
    if (m.dstKey !== undefined) {
      const entry = KEY_OPTIONS.find(k => k.code === m.dst);
      return entry ? entry.label.replace('→ ', '') : `Key 0x${m.dstKey.toString(16)}`;
    }
    return m.dst;
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-gray-400">按键自定义</h3>
        {mappings.length > 0 && (
          <button onClick={doReset}
            className="text-xs text-red-400 hover:text-red-300 px-2 py-1 bg-red-900/20 rounded">
            重置全部
          </button>
        )}
      </div>
      <p className="text-xs text-gray-600 mb-4">
        G502 HERO SE · {BUTTONS.filter(b=>b.canRemap).length} 个可编程按键 · hidutil 内核级映射
      </p>

      <div className="space-y-2">
        {BUTTONS.map(btn => {
          const mapping = getMapping(btn.id);
          const isMapped = !!mapping;

          return (
            <div key={btn.id} className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
              btn.canRemap ? 'bg-gray-800/50 hover:bg-gray-800' : 'bg-gray-800/30 opacity-60'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                  btn.canRemap ? 'bg-emerald-900/50 text-emerald-400' : 'bg-gray-700 text-gray-500'
                }`}>{btn.icon}</div>
                <div>
                  <div className="text-sm font-medium">{btn.name}</div>
                  <div className="text-xs text-gray-500">{btn.desc}</div>
                  {isMapped && mapping && (
                    <div className="text-xs text-emerald-400 mt-0.5">→ {getTargetLabel(mapping)}</div>
                  )}
                </div>
              </div>

              {btn.canRemap && (
                editing === btn.id ? (
                  <div className="flex flex-col gap-1 w-52">
                    <select
                      className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-200"
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '__unmap__') doUnmap(btn.id);
                        else doRemap(btn.id, val);
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>选择映射目标...</option>
                      <optgroup label="⭐ 快捷键">
                        {KEY_OPTIONS.filter(k => ['copy','paste','cut','undo','redo','selectall','save','close'].includes(k.code)).map(k => (
                          <option key={k.code} value={k.code}>{k.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="🖱 鼠标按键">
                        {KEY_OPTIONS.filter(k => k.code.startsWith('mouse:')).map(k => (
                          <option key={k.code} value={k.code}>{k.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="键盘字母">
                        {KEY_OPTIONS.filter(k => k.code.match(/^key:[a-z]$/)).map(k => (
                          <option key={k.code} value={k.code}>{k.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="数字">
                        {KEY_OPTIONS.filter(k => k.code.match(/^key:\d$/)).map(k => (
                          <option key={k.code} value={k.code}>{k.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="功能键">
                        {KEY_OPTIONS.filter(k => k.code.match(/^key:f\d+$/)).map(k => (
                          <option key={k.code} value={k.code}>{k.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="特殊键">
                        {KEY_OPTIONS.filter(k => k.code.match(/^key:(space|return|tab|esc|delete)$/)).map(k => (
                          <option key={k.code} value={k.code}>{k.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="媒体控制">
                        {KEY_OPTIONS.filter(k => k.code.startsWith('consumer:')).map(k => (
                          <option key={k.code} value={k.code}>{k.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="操作">
                        <option value="__unmap__">恢复默认</option>
                      </optgroup>
                    </select>
                    <button onClick={() => setEditing(null)}
                      className="text-xs text-gray-500 hover:text-gray-300 text-right">取消</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(btn.id)}
                      className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300">修改</button>
                    {isMapped && (
                      <button onClick={() => doUnmap(btn.id)}
                        className="px-3 py-1 text-xs bg-red-900/50 hover:bg-red-800 rounded text-red-300">重置</button>
                    )}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 bg-gray-800/30 rounded-lg">
        <p className="text-xs text-gray-500">
          💡 <strong>提示</strong>：hidutil 在内核层直接映射，重启后失效。如需持久化，可在终端运行：
        </p>
        <code className="block mt-1 text-xs text-gray-400 bg-gray-800 rounded px-2 py-1 overflow-x-auto">
          hidutil property --get '"UserKeyMapping"'
        </code>
      </div>
    </div>
  );
}
