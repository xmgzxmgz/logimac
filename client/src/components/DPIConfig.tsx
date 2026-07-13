import { useState } from 'react';
import { Device, setDPI } from '../api/client';

interface Props { device: Device }

const DPI_PRESETS = [400, 800, 1000, 1200, 1600, 2000, 2400, 3200, 4000, 6400];

export default function DPIConfig({ device }: Props) {
  const dpi = device.dpi;
  if (!dpi) return null;

  const [value, setValue] = useState(dpi.current);
  const [saving, setSaving] = useState(false);

  const apply = async (v: number) => {
    setSaving(true);
    try {
      const r = await setDPI(device.id, v);
      if (r.dpi) setValue(r.dpi);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h3 className="text-sm font-medium text-gray-400 mb-4">DPI Settings</h3>
      <div className="text-4xl font-bold text-emerald-400 mb-1">{value}</div>
      <div className="text-xs text-gray-500 mb-4">Default: {dpi.default} · {dpi.sensors} sensor(s)</div>

      <input
        type="range" min={100} max={16000} step={50} value={value}
        onChange={e => setValue(parseInt(e.target.value))}
        onMouseUp={() => apply(value)}
        onTouchEnd={() => apply(value)}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 mb-4"
        disabled={saving}
      />

      <div className="flex flex-wrap gap-2">
        {DPI_PRESETS.map(p => (
          <button key={p} onClick={() => { setValue(p); apply(p); }}
            disabled={saving}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              value === p ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}>{p}</button>
        ))}
      </div>

      {saving && <div className="mt-3 text-xs text-emerald-400">Applying...</div>}
    </div>
  );
}
