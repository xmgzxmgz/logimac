#!/usr/bin/env swift
/**
 * Shortcut Daemon - intercepts F13-F20 keys and injects keyboard shortcuts
 * Used together with hidutil: button → F18 → this daemon → ⌘C
 */
import Foundation
import CoreGraphics

func outputJSON(_ dict: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: dict),
       let str = String(data: data, encoding: .utf8) {
        FileHandle.standardOutput.write((str + "\n").data(using: .utf8)!)
    }
}

// Map: F-key keycode -> (target keycode, flags)
// F13=0x69, F14=0x6A, F15=0x6B, F16=0x6C, F17=0x6D, F18=0x6E, F19=0x6F, F20=0x70
var shortcutMap: [CGKeyCode: (keycode: CGKeyCode, flags: CGEventFlags)] = [:]

func keyCallback(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent, refcon: UnsafeMutableRawPointer?) -> Unmanaged<CGEvent>? {
    if type == .tapDisabledByTimeout {
        if let tap = globalTap { CGEvent.tapEnable(tap: tap, enable: true) }
        return Unmanaged.passUnretained(event)
    }

    guard type == .keyDown else { return Unmanaged.passUnretained(event) }

    let keycode = CGKeyCode(event.getIntegerValueField(.keyboardEventKeycode))

    if let (targetKey, flags) = shortcutMap[keycode] {
        // Inject the shortcut
        if let kd = CGEvent(keyboardEventSource: nil, virtualKey: targetKey, keyDown: true) {
            kd.flags = flags
            kd.post(tap: .cghidEventTap)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) {
            if let ku = CGEvent(keyboardEventSource: nil, virtualKey: targetKey, keyDown: false) {
                ku.post(tap: .cghidEventTap)
            }
        }
        outputJSON(["event": "shortcut", "trigger": keycode, "keycode": targetKey, "flags": flags.rawValue])
        return nil  // Suppress the F-key
    }

    return Unmanaged.passUnretained(event)
}

var globalTap: CFMachPort?
let mask: CGEventMask = 1 << CGEventType.keyDown.rawValue

guard let tap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .defaultTap,
    eventsOfInterest: mask,
    callback: keyCallback,
    userInfo: nil
) else {
    outputJSON(["error": "accessibility_required"])
    RunLoop.current.run()
    exit(1)
}

globalTap = tap
CGEvent.tapEnable(tap: tap, enable: true)
outputJSON(["status": "started"])
RunLoop.current.add(tap, forMode: .default)

DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine() {
        guard let data = line.data(using: .utf8),
              let cmd = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let action = cmd["action"] as? String else { continue }
        switch action {
        case "set":
            // {"action":"set","trigger":106,"keycode":8,"flags":["cmd"]}
            if let trigger = cmd["trigger"] as? CGKeyCode,
               let keycode = cmd["keycode"] as? CGKeyCode {
                var flags = CGEventFlags()
                for f in (cmd["flags"] as? [String] ?? []) {
                    switch f {
                    case "cmd": flags.insert(.maskCommand)
                    case "shift": flags.insert(.maskShift)
                    case "alt": flags.insert(.maskAlternate)
                    case "ctrl": flags.insert(.maskControl)
                    default: break
                    }
                }
                shortcutMap[trigger] = (keycode, flags)
                outputJSON(["status": "ok", "trigger": trigger, "keycode": keycode])
            }
        case "remove":
            if let trigger = cmd["trigger"] as? CGKeyCode {
                shortcutMap.removeValue(forKey: trigger)
                outputJSON(["status": "ok"])
            }
        case "get":
            var result: [[String: Any]] = []
            for (k, v) in shortcutMap {
                result.append(["trigger": k, "keycode": v.keycode, "flags": v.flags.rawValue])
            }
            outputJSON(["status": "ok", "shortcuts": result])
        case "quit": exit(0)
        default: outputJSON(["error": "unknown"])
        }
    }
}

RunLoop.current.run()
