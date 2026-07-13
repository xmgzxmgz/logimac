interface Props {
  deviceCount: number;
  connectedCount: number;
}

export default function StatusBar({ deviceCount, connectedCount }: Props) {
  return (
    <footer className="border-t border-gray-800 bg-gray-900/50 py-2 px-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-gray-600">
        <div className="flex items-center gap-4">
          <span>
            {connectedCount}/{deviceCount} devices connected
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            HID++ 2.0
          </span>
        </div>
        <span>LogiMac v1.0</span>
      </div>
    </footer>
  );
}
