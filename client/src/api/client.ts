const BASE = '/api';

export interface Device {
  id: string;
  name: string;
  connected: boolean;
  productId: string;
  vendorId: string;
  battery: { level: number; charging: boolean } | null;
  dpi: { current: number; default: number; sensors: number } | null;
}

export async function fetchDevices(): Promise<Device[]> {
  const res = await fetch(`${BASE}/devices`);
  const data = await res.json();
  return data.devices;
}

export async function scanDevices(): Promise<Device[]> {
  const res = await fetch(`${BASE}/devices/scan`, { method: 'POST' });
  const data = await res.json();
  return data.devices;
}

export async function setDPI(id: string, dpi: number) {
  const res = await fetch(`${BASE}/devices/${encodeURIComponent(id)}/dpi`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dpi }),
  });
  return res.json();
}

export async function fetchButtonMap(id: string) {
  const res = await fetch(`${BASE}/devices/${encodeURIComponent(id)}/buttons`);
  return res.json();
}

export async function remapButton(id: string, from: string, to: string) {
  const res = await fetch(`${BASE}/devices/${encodeURIComponent(id)}/buttons/remap`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  });
  return res.json();
}

export async function unmapButton(id: string, from: string) {
  const res = await fetch(`${BASE}/devices/${encodeURIComponent(id)}/buttons/unmap`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from }),
  });
  return res.json();
}

export async function resetButtons(id: string) {
  const res = await fetch(`${BASE}/devices/${encodeURIComponent(id)}/buttons/reset`, {
    method: 'POST',
  });
  return res.json();
}
