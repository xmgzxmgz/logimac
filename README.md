# LogiMac

macOS 上的罗技鼠标管理工具，通过 Web UI 配置按键映射、DPI 调节等功能。

基于 HID++ 2.0 协议（参考 [logiops](https://github.com/PixlOne/logiops) 和 [Solaar](https://github.com/pwr-Solaar/Solaar)）。

## 功能

- 🔍 自动扫描罗技 USB/蓝牙 HID 设备
- 🖱️ 设备信息（名称、PID、序列号）
- 🔋 电池电量监控
- 🎯 DPI 调节（滑块 + 预设）
- 🔘 按键重映射（自定义功能分配）
- 📡 WebSocket 实时状态更新

## 安装

```bash
cd ~/code/logimac

# 安装后端依赖
npm install

# 安装前端依赖
cd client && npm install && cd ..
```

## 运行

```bash
# 开发模式（同时启动前后端）
npm run dev

# 浏览器打开 http://localhost:3000
```

## macOS 权限

首次运行需要授予 Input Monitoring 权限：

1. 系统设置 → 隐私与安全性 → 输入监控
2. 添加 Terminal（或 iTerm2）到允许列表
3. 重启终端后重新运行

## 技术架构

```
Web UI (React + Tailwind)     ← 浏览器 http://localhost:3000
        ↕
Express + WebSocket            ← Node.js 后端 :3000
        ↕
HID++ 2.0 Protocol Layer       ← 协议实现
        ↕
node-hid (hidapi)              ← USB/蓝牙 HID 通信
        ↕
macOS IOKit                    ← 系统 HID 驱动
```

### HID++ 2.0 协议

| Feature ID | 名称 | 用途 |
|-----------|------|------|
| 0x0000 | IRoot | 特性发现 |
| 0x0003 | DeviceInformation | 设备信息 |
| 0x0005 | DeviceName | 设备名称 |
| 0x0008 | BatteryLevel | 电池电量 |
| 0x1b00 | ReprogrammableButtons | 按键重映射 |
| 0x2200 | AdjustableDPI | DPI 调节 |

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/devices | 列出所有设备 |
| GET | /api/devices/:id | 设备详情 |
| POST | /api/devices/scan | 触发扫描 |
| GET | /api/devices/:id/battery | 电池电量 |
| GET | /api/devices/:id/buttons | 按键列表 |
| POST | /api/devices/:id/buttons/:cid/remap | 重映射按键 |
| GET | /api/devices/:id/dpi | 当前 DPI |
| POST | /api/devices/:id/dpi | 设置 DPI |

## 支持设备

所有使用 HID++ 2.0 协议的罗技设备，包括但不限于：
- MX Master 系列 (MX Master 3S, 3, 2S, 2)
- MX Anywhere 系列
- G Pro / G502 / G903 等游戏鼠标
- M720 / M590 等办公鼠标
- 罗技 Unifying 接收器连接的设备

## License

MIT
