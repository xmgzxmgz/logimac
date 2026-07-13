import { useDevices } from './hooks/useDevices';
import DeviceList from './components/DeviceList';
import DeviceDetail from './components/DeviceDetail';
import StatusBar from './components/StatusBar';
import { useState } from 'react';
import { Device } from './api/client';

export default function App() {
  const { devices, loading, error, scan } = useDevices();
  const [selected, setSelected] = useState<Device | null>(null);

  const selectedDevice = selected
    ? devices.find(d => d.id === selected.id) || selected
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold">LogiMac</h1>
            <span className="text-xs text-gray-500">Logitech Mouse Manager</span>
          </div>
          <button
            onClick={scan}
            disabled={loading}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 rounded text-sm font-medium transition-colors"
          >
            {loading ? 'Scanning...' : 'Scan Devices'}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Device list */}
          <div className="lg:col-span-1">
            <DeviceList
              devices={devices}
              selected={selectedDevice}
              onSelect={setSelected}
              loading={loading}
            />
          </div>

          {/* Device detail */}
          <div className="lg:col-span-2">
            {selectedDevice ? (
              <DeviceDetail device={selectedDevice} />
            ) : (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
                <div className="text-gray-600 text-4xl mb-4">🖱️</div>
                <p className="text-gray-500">
                  {devices.length === 0
                    ? 'No Logitech devices detected. Click "Scan Devices" to search.'
                    : 'Select a device from the list to view details and configure buttons.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Status bar */}
      <StatusBar deviceCount={devices.length} connectedCount={devices.filter(d => d.connected).length} />
    </div>
  );
}
