#!/usr/bin/env swift
/**
 * LogiMac Button Interceptor
 * Intercepts G502 mouse button events at the macOS system level
 * and remaps them without needing G HUB
 *
 * Requires: Accessibility permission in System Settings
 */
import Foundation
import IOKit
import IOKit.hid

// G502 button usage page and usage range
let LOGITECH_VENDOR_ID = 0x046d
let G502_PRODUCT_ID = 0xc08b

var manager: IOHIDManager?
var device: IOHIDDevice?

// Button mapping: usage -> new action
// G502 buttons: usage 1-16 on usagePage 9 (Button)
var buttonMap: [Int: Int] = [:]  // e.g., [4: 5] = remap button 4 to button 5

func outputJSON(_ dict: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: dict),
       let str = String(data: data, encoding: .utf8) {
        FileHandle.standardOutput.write((str + "\n").data(using: .utf8)!)
    }
}

// HID input value callback - fires on button press/release
func inputCallback(_ context: UnsafeMutableRawPointer?,
                   _ result: IOReturn,
                   _ sender: UnsafeMutableRawPointer?,
                   _ type: IOHIDReportType,
                   _ reportID: UInt32,
                   _ report: UnsafeMutablePointer<UInt8>,
                   _ reportLength: CFIndex) {
    // Parse the HID report to extract button states
    // The G502 report format (from report descriptor):
    // Byte 0: buttons 1-8 (bitfield)
    // Byte 1: buttons 9-16 (bitfield)
    // Byte 2-3: X axis (signed 16-bit LE)
    // Byte 4-5: Y axis (signed 16-bit LE)
    // Byte 6: wheel
    // Byte 7: horizontal wheel

    guard reportLength >= 2 else { return }

    let buttons1 = report[0]  // buttons 1-8
    let buttons2 = report[1]  // buttons 9-16

    // Detect button changes
    for i in 0..<8 {
        let pressed = (buttons1 >> i) & 1
        if pressed == 1 {
            let usage = i + 1
            if let remapTo = buttonMap[usage] {
                outputJSON(["event": "button_remap", "from": usage, "to": remapTo, "action": "press"])
            }
        }
    }
    for i in 0..<8 {
        let pressed = (buttons2 >> i) & 1
        if pressed == 1 {
            let usage = i + 9
            if let remapTo = buttonMap[usage] {
                outputJSON(["event": "button_remap", "from": usage, "to": remapTo, "action": "press"])
            }
        }
    }
}

func startIntercept() {
    manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))

    // Match G502 mouse interface (usagePage 0x01 = Generic Desktop, usage 0x02 = Mouse)
    let match: [String: Any] = [
        kIOHIDVendorIDKey: LOGITECH_VENDOR_ID,
        kIOHIDProductIDKey: G502_PRODUCT_ID,
        kIOHIDDeviceUsagePageKey: 0x0001,
        kIOHIDDeviceUsageKey: 0x0002,
    ]

    IOHIDManagerSetDeviceMatching(manager!, match as CFDictionary)

    // Register input report callback
    let context = Unmanaged.passUnretained(manager!).toOpaque()
    IOHIDManagerRegisterInputReportCallback(manager!, inputCallback, context)

    IOHIDManagerScheduleWithRunLoop(manager!, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
    let result = IOHIDManagerOpen(manager!, IOOptionBits(kIOHIDOptionsTypeNone))
    outputJSON(["status": result == kIOReturnSuccess ? "started" : "failed", "code": Int(result)])
}

// MARK: - Main

outputJSON(["status": "ready"])

// Start intercepting in background
DispatchQueue.global(qos: .userInitiated).async {
    startIntercept()
}

// Read commands from stdin
while let line = readLine() {
    guard let data = line.data(using: .utf8),
          let cmd = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let action = cmd["action"] as? String else {
        continue
    }

    switch action {
    case "remap":
        if let from = cmd["from"] as? Int, let to = cmd["to"] as? Int {
            buttonMap[from] = to
            outputJSON(["status": "ok", "remap": ["from": from, "to": to]])
        }
    case "unmap":
        if let from = cmd["from"] as? Int {
            buttonMap.removeValue(forKey: from)
            outputJSON(["status": "ok", "unmap": from])
        }
    case "get_map":
        outputJSON(["status": "ok", "map": buttonMap])
    case "quit":
        if let mgr = manager { IOHIDManagerClose(mgr, IOOptionBits(kIOHIDOptionsTypeNone)) }
        exit(0)
    default:
        outputJSON(["error": "unknown"])
    }
}
