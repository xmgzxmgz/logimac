import { Device } from '../api/client';
import DPIConfig from './DPIConfig';
import ButtonConfig from './ButtonConfig';

interface Props { device: Device }

export default function DeviceDetail({ device }: Props) {
  return (
    <div className="space-y-6">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">{device.name}</h2>
            <p className="text-sm text-gray-500 mt-1">{device.vendorId}:{device.productId}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            device.connected ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800'
              : 'bg-gray-800 text-gray-500 border border-gray-700'
          }`}>{device.connected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoCard label="Product ID" value={device.productId} />
          <InfoCard label="Protocol" value="HID++ 2.0" />
          <InfoCard label="DPI" value={device.dpi ? `${device.dpi.current}` : 'N/A'} />
        </div>
      </div>

      {device.dpi && <DPIConfig device={device} />}
      <ButtonConfig device={device} />

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h3 className="text-sm font-medium text-gray-400 mb-2">Notes</h3>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>• DPI control: HID++ 2.0 protocol (INDEX_OFFSET=1)</li>
          <li>• Button remapping: macOS CGEventTap (system-level)</li>
          <li>• LED control: not available (requires G HUB)</li>
        </ul>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium mt-0.5 text-gray-200">{value}</div>
    </div>
  );
}
