/**
 * HID++ 2.0 Protocol Core
 *
 * Message format:
 *   Short Report (0x10): [reportId, devIndex, featIndex|func, swId|pad, params...16]
 *   Long Report  (0x11): [reportId, devIndex, featIndex|func, swId|pad, params...60]
 *
 * Feature Index 0x00 = IRoot (feature discovery)
 */

export const HIDPP_REPORT_SHORT = 0x10;
export const HIDPP_REPORT_LONG = 0x11;
export const SHORT_REPORT_LENGTH = 20;
export const LONG_REPORT_LENGTH = 64;
export const LOGITECH_VENDOR_ID = 0x046d;

// Known HID++ 2.0 features
export const Feature = {
  IRoot: 0x0000,
  FeatureSet: 0x0001,
  DeviceInformation: 0x0003,
  DeviceName: 0x0005,
  Reset: 0x0007,
  BatteryLevel: 0x0008,
  ReprogrammableButtons: 0x1b00,
  AdjustableDPI: 0x2200,
  WirelessDeviceStatus: 0x1d4b,
  DFUControl: 0x00c1,
  SpecialButtons: 0x8110,
} as const;

export interface HIDppMessage {
  reportId: number;
  deviceIndex: number;
  featureIndex: number;
  function: number;
  softwareId: number;
  parameters: Buffer;
}

export function encodeMessage(
  deviceIndex: number,
  featureIndex: number,
  func: number,
  params: Buffer,
  swId: number = 1
): Buffer {
  const isLong = params.length > 16;
  const reportId = isLong ? HIDPP_REPORT_LONG : HIDPP_REPORT_SHORT;
  const totalLen = isLong ? LONG_REPORT_LENGTH : SHORT_REPORT_LENGTH;

  const buf = Buffer.alloc(totalLen);
  buf[0] = reportId;
  buf[1] = deviceIndex;
  buf[2] = ((func & 0x0f) << 4) | (featureIndex & 0x0f);
  buf[3] = ((swId & 0x0f) << 4);

  // For feature index > 0x0f, we need to handle the encoding differently
  // The lower nibble of byte 2 is the lower nibble of featureIndex
  // Byte 2 upper nibble = function (4 bits)
  // Actually, in HID++ 2.0:
  // byte 2 = (function << 4) | (featureIndex & 0x0F) -- for short feature index
  // But feature indices can be > 0x0F, so the full feature index is in byte 2 only for indices 0-15
  // For indices > 15, the protocol uses a different addressing mode
  // However, most implementations just put the full feature index in byte 2
  // Let me correct: byte 2 is the feature index (0-255), byte 3 high nibble = function
  // Actually re-reading the spec more carefully:
  // byte 2 = feature_index
  // byte 3 = (function_number << 4) | software_id
  buf[2] = featureIndex & 0xff;
  buf[3] = ((func & 0x0f) << 4) | (swId & 0x0f);

  params.copy(buf, 4);

  return buf;
}

export function decodeMessage(data: Buffer): HIDppMessage | null {
  if (data.length < 4) return null;

  const reportId = data[0];
  if (reportId !== HIDPP_REPORT_SHORT && reportId !== HIDPP_REPORT_LONG) return null;

  return {
    reportId,
    deviceIndex: data[1],
    featureIndex: data[2],
    function: (data[3] >> 4) & 0x0f,
    softwareId: data[3] & 0x0f,
    parameters: data.slice(4),
  };
}

// Check if a response is an error (feature index 0x8f = error notification)
export function isError(msg: HIDppMessage): boolean {
  return msg.featureIndex === 0x8f;
}

// HID++ 1.0 error codes
export const ErrorCode: Record<number, string> = {
  0x00: 'Success',
  0x01: 'Invalid argument',
  0x02: 'Out of range',
  0x03: 'HW error',
  0x04: 'Logitech internal',
  0x05: 'Invalid feature index',
  0x06: 'Invalid function ID',
  0x07: 'Busy',
  0x08: 'Unsupported',
};
