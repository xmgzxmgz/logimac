#!/usr/bin/env swift

/**
 * LogiMac HID++ Helper v2
 * Full HID++ 2.0 protocol implementation for Logitech devices
 * Handles INDEX_OFFSET quirk (G502 uses sub_id = feature_index + 1)
 */

import Foundation
import IOKit
import IOKit.hid

var gResp: [[UInt8]] = []
var gBuf = [UInt8](repeating: 0, count: 64)
var gDevice: IOHIDDevice?
var gManager: IOHIDManager?

func hidCB(_ ctx: UnsafeMutableRawPointer?, _: IOReturn, _: UnsafeMutableRawPointer?,
           _: IOHIDReportType, _: UInt32, _ report: UnsafeMutablePointer<UInt8>, _ len: CFIndex) {
    var d = [UInt8](repeating: 0, count: len)
    d.withUnsafeMutableBufferPointer { bp in _ = memcpy(bp.baseAddress!, report, len) }
    gResp.append(d)
}

func out(_ dict: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: dict),
       let s = String(data: data, encoding: .utf8) {
        FileHandle.standardOutput.write((s + "\n").data(using: .utf8)!)
    }
}

// MARK: - Device management

func openDevice() -> Bool {
    // If already open, just drain pending messages and return
    if gDevice != nil {
        gResp.removeAll()
        return true
    }

    gManager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
    IOHIDManagerSetDeviceMatching(gManager!, [
        kIOHIDVendorIDKey: 0x046d,
        kIOHIDDeviceUsagePageKey: 0xff00,
        kIOHIDDeviceUsageKey: 0x01,
    ] as CFDictionary)
    IOHIDManagerScheduleWithRunLoop(gManager!, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
    IOHIDManagerOpen(gManager!, IOOptionBits(kIOHIDOptionsTypeNone))
    Thread.sleep(forTimeInterval: 0.3)
    guard let dev = (IOHIDManagerCopyDevices(gManager!) as? Set<IOHIDDevice>)?.first else { return false }
    guard IOHIDDeviceOpen(dev, IOOptionBits(kIOHIDOptionsTypeNone)) == kIOReturnSuccess else { return false }
    gDevice = dev
    IOHIDDeviceRegisterInputReportCallback(dev, &gBuf, 64, hidCB, nil)
    IOHIDDeviceScheduleWithRunLoop(dev, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
    Thread.sleep(forTimeInterval: 2.0)
    gResp.removeAll()
    return true
}

func closeDevice() {
    if let dev = gDevice {
        IOHIDDeviceUnscheduleFromRunLoop(dev, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
        IOHIDDeviceClose(dev, IOOptionBits(kIOHIDOptionsTypeNone))
        gDevice = nil
    }
}

// MARK: - HID++ protocol

func hidppSend(_ feature: Int, _ function: Int, _ params: [UInt8], _ devIdx: UInt8 = 0xff, indexOffset: Int = 1) -> [UInt8]? {
    guard let dev = gDevice else { return nil }
    let subId = UInt8(feature + indexOffset)
    let addr = UInt8(((function & 0x0f) << 4) | 0x08)
    var msg = [UInt8](repeating: 0, count: 20)
    msg[0] = 0x10; msg[1] = devIdx; msg[2] = subId; msg[3] = addr
    for i in 0..<min(params.count, 16) { msg[4 + i] = params[i] }

    // Drain pending
    for _ in 0..<10 {
        gResp.removeAll()
        CFRunLoopRunInMode(CFRunLoopMode.defaultMode, 0.1, true)
        if gResp.isEmpty { break }
    }
    gResp.removeAll()

    var m = msg
    let sr = m.withUnsafeMutableBufferPointer { bp in
        IOHIDDeviceSetReport(dev, kIOHIDReportTypeOutput, CFIndex(0x10), bp.baseAddress!, msg.count)
    }
    guard sr == kIOReturnSuccess else { return nil }

    // Collect ALL responses, prefer success over error
    var bestMatch: [UInt8]? = nil
    let deadline = Date().addingTimeInterval(3.0)
    while Date() < deadline {
        CFRunLoopRunInMode(CFRunLoopMode.defaultMode, 0.1, true)
        for r in gResp {
            // Success match - return immediately
            if r.count >= 4 && r[2] == subId && r[3] == addr { return r }
            // Error match - save but keep looking for success
            if r.count >= 7 && r[2] == 0xff && r[3] == subId && bestMatch == nil {
                bestMatch = r
            }
        }
        // If we found an error but no success after 1s, return the error
        if bestMatch != nil && Date().timeIntervalSince(deadline.addingTimeInterval(-3.0)) > 1.0 {
            return bestMatch
        }
    }
    return bestMatch
}

// MARK: - High-level commands

func handleDiscover() {
    guard openDevice() else { out(["error": "open_failed"]); return }

    // Get feature count from IRoot func 0
    guard let countResp = hidppSend(0, 0, [UInt8](repeating: 0, count: 16)) else {
        out(["error": "no_response"]); closeDevice(); return
    }
    let featureCount = Int(countResp[4])
    var features: [[String: Any]] = []

    // Probe each feature
    for idx in 0..<featureCount {
        let r0 = hidppSend(idx, 0, [UInt8](repeating: 0, count: 16))
        let r1 = hidppSend(idx, 1, [UInt8](repeating: 0, count: 16))

        let p0 = r0.map { Array($0.suffix(from: 4)) } ?? []
        let p1 = r1.map { Array($0.suffix(from: 4)) } ?? []

        var feature: [String: Any] = ["index": idx]
        feature["func0"] = p0.map { Int($0) }
        feature["func1"] = p1.map { Int($0) }

        // Detect known features
        if idx == 3 && p1.count >= 12 {
            // DeviceName
            let nameBytes = p1.prefix(while: { $0 >= 0x20 && $0 < 0x7f })
            if let name = String(bytes: nameBytes, encoding: .utf8) {
                feature["type"] = "DeviceName"
                feature["name"] = name
            }
        }
        if idx == 3 && p0.count >= 1 && p0[0] > 0 && p0[0] < 100 {
            feature["nameLength"] = Int(p0[0])
        }

        features.append(feature)
    }

    out(["status": "ok", "featureCount": featureCount, "features": features])
    closeDevice()
}

func handleGetDeviceName() {
    guard gDevice != nil || openDevice() else { out(["error": "not_open"]); return }

    // Get name length (feature 3, func 0)
    guard let lenResp = hidppSend(3, 0, [UInt8](repeating: 0, count: 16)) else {
        out(["error": "no_length_response"]); return
    }
    let nameLen = Int(lenResp[4])

    // Get name (feature 3, func 1)
    guard let nameResp = hidppSend(3, 1, [UInt8](repeating: 0, count: 16)) else {
        out(["error": "no_name_response"]); return
    }
    let nameBytes = Array(nameResp.suffix(from: 4)).prefix(nameLen)
    let name = String(bytes: nameBytes.filter { $0 >= 0x20 && $0 < 0x7f }, encoding: .utf8) ?? ""

    out(["status": "ok", "name": name, "length": nameLen])
}

func handleGetDPI() {
    guard gDevice != nil || openDevice() else { out(["error": "not_open"]); return }

    guard let countResp = hidppSend(9, 0, [UInt8](repeating: 0, count: 16)) else {
        out(["error": "no_sensor_count"]); return
    }
    let sensorCount = Int(countResp[4])

    let dpiResp = hidppSend(9, 2, [0x00, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])

    var result: [String: Any] = ["status": "ok", "sensorCount": sensorCount]

    if let r = dpiResp {
        let p = Array(r.suffix(from: 4))
        // BIG-ENDIAN: dpi = p[1]<<8 | p[2]
        let currentDPI = (Int(p[1]) << 8) | Int(p[2])
        let defaultDPI = p.count >= 5 ? ((Int(p[3]) << 8) | Int(p[4])) : currentDPI
        result["currentDPI"] = currentDPI
        result["defaultDPI"] = defaultDPI
    }

    out(result)
    Thread.sleep(forTimeInterval: 0.1)
    gResp.removeAll()
}

func handleSetDPI(_ cmd: [String: Any]) {
    guard let dpi = cmd["dpi"] as? Int else { out(["error": "missing_dpi"]); return }
    guard gDevice != nil || openDevice() else { out(["error": "not_open"]); return }

    let sensor = UInt8(cmd["sensor"] as? Int ?? 0)
    // BIG-ENDIAN: [sensor, dpi_hi, dpi_lo]
    let params: [UInt8] = [sensor, UInt8((dpi >> 8) & 0xff), UInt8(dpi & 0xff), 0,0,0,0,0,0,0,0,0,0,0,0,0]

    for _ in 0..<3 {
        Thread.sleep(forTimeInterval: 0.3)
        _ = hidppSend(9, 3, params)
        Thread.sleep(forTimeInterval: 0.5)

        gResp.removeAll()

        if let resp = hidppSend(9, 2, [0x00, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]) {
            let p = Array(resp.suffix(from: 4))
            let actualDPI = (Int(p[1]) << 8) | Int(p[2])
            if actualDPI == dpi {
                out(["status": "ok", "dpi": actualDPI])
                return
            }
        }
    }
    out(["error": "set_dpi_failed"])
}

func handleGetButtons() {
    guard gDevice != nil || openDevice() else { out(["error": "not_open"]); return }

    // Feature 11: ReprogrammableButtons (probe func 0)
    // func 0 returns button info array
    if let r = hidppSend(11, 0, [UInt8](repeating: 0, count: 16)) {
        let p = Array(r.suffix(from: 4))
        out(["status": "ok", "raw": p.map { Int($0) }, "hex": p.map { String(format: "%02x", $0) }.joined()])
    } else {
        // Try feature 12
        if let r = hidppSend(12, 0, [UInt8](repeating: 0, count: 16)) {
            let p = Array(r.suffix(from: 4))
            out(["status": "ok", "feature": 12, "raw": p.map { Int($0) }])
        } else {
            out(["error": "no_button_feature"])
        }
    }
}

func handleRaw(_ cmd: [String: Any]) {
    let feature = cmd["feature"] as? Int ?? 0
    let function = cmd["function"] as? Int ?? 0
    let params = (cmd["params"] as? [Int])?.map { UInt8($0 & 0xff) } ?? [UInt8](repeating: 0, count: 16)
    let offset = cmd["indexOffset"] as? Int ?? 1

    guard gDevice != nil || openDevice() else { out(["error": "not_open"]); return }

    if let r = hidppSend(feature, function, params, indexOffset: offset) {
        let isError = r[2] == 0xff
        out(["status": isError ? "error" : "ok",
             "response": r.map { String(format: "%02x", $0) }.joined(),
             "params": Array(r.suffix(from: 4)).map { String(format: "%02x", $0) }.joined()])
    } else {
        out(["status": "timeout"])
    }
}

// MARK: - Main

out(["status": "ready", "pid": ProcessInfo.processInfo.processIdentifier])

while let line = Swift.readLine() {
    guard let data = line.data(using: .utf8),
          let cmd = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let action = cmd["action"] as? String else {
        out(["error": "invalid_json"]); continue
    }

    switch action {
    case "open": openDevice() ? out(["status": "opened"]) : out(["error": "open_failed"])
    case "discover": handleDiscover()
    case "getName": handleGetDeviceName()
    case "getDPI": handleGetDPI()
    case "setDPI": handleSetDPI(cmd)
    case "getButtons": handleGetButtons()
    case "raw": handleRaw(cmd)
    case "close": closeDevice(); out(["status": "closed"])
    case "quit": closeDevice(); exit(0)
    default: out(["error": "unknown_action"])
    }
}
