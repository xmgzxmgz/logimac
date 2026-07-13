import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { DeviceManager, ManagedDevice } from './device-manager.js';

export function setupWebSocket(httpServer: HttpServer, manager: DeviceManager): SocketIOServer {
  const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

  manager.on('deviceConnected', (d: ManagedDevice) => {
    io.emit('device:connected', { id: d.id, name: d.name, dpi: d.dpi });
  });

  manager.on('deviceDisconnected', (d: ManagedDevice) => {
    io.emit('device:disconnected', { id: d.id });
  });

  io.on('connection', (socket: Socket) => {
    const devices = manager.getAllDevices().map(d => ({
      id: d.id, name: d.name, connected: d.connected, dpi: d.dpi,
    }));
    socket.emit('devices', devices);
  });

  return io;
}
