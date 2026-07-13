import { Device } from '../api/client';

interface Props {
  devices: Device[];
  selected: Device | null;
  onSelect: (device: Device) => void;
  loading: boolean;
}

export default function DeviceList({ devices, selected, onSelect, loading }: Props) {
  if (loading && devices.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="animate-pulse space-y-3">
          {[1, 2].map(i => <div key={i} className="h-16 bg-gray-800 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-gray-400 mb-3 px-1">Devices ({devices.length})</h2>
      {devices.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center text-gray-500 text-sm">
          No devices found
        </div>
      ) : devices.map(device => (
        <button key={device.id} onClick={() => onSelect(device)}
          className={`w-full text-left p-4 rounded-xl border transition-all ${
            selected?.id === device.id
              ? 'bg-gray-800 border-emerald-600 ring-1 ring-emerald-600/50'
              : 'bg-gray-900 border-gray-800 hover:border-gray-700 hover:bg-gray-800/50'
          }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${device.connected ? 'bg-emerald-500' : 'bg-gray-600'}`} />
              <div>
                <div className="font-medium text-sm">{device.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{device.vendorId}:{device.productId}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {device.dpi && (
                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                  {device.dpi.current} DPI
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
