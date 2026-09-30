import Cocoa
import WebKit
import Carbon.HIToolbox
import Speech
import AVFoundation

let dashboardPath = "/Users/anthonyjpoole/Code/agents/jarvis-os-v2/dashboard/index.html"
// Distinct from original 'JARV' (0x4a415256) — 'JV2S'
let hotKeyID = EventHotKeyID(signature: OSType(0x4A563253), id: 1)
let silenceTimeout: TimeInterval = 1.2
let initialGracePeriod: TimeInterval = 4.5

class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    var statusItem: NSStatusItem!
    var window: NSWindow!
    var webView: WKWebView!
    var hotKeyRef: EventHotKeyRef?

    var speechRecognizer: SFSpeechRecognizer?
    var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    var recognitionTask: SFSpeechRecognitionTask?
    let audioEngine = AVAudioEngine()
    var isListening = false
    var silenceTimer: Timer?
    var lastTranscript = ""
    var hasReceivedSpeech = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            button.title = "J2"
            button.font = NSFont.systemFont(ofSize: 12, weight: .bold)
            button.action = #selector(toggleWindow)
            button.target = self
        }

        setupWindow()
        registerHotKey()
    }

    func setupWindow() {
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "jarvis")
        config.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1320, height: 850), configuration: config)
        let fileURL = URL(fileURLWithPath: dashboardPath)
        webView.loadFileURL(fileURL, allowingReadAccessTo: fileURL.deletingLastPathComponent())

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1320, height: 850),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Jarvis OS v2"
        window.contentView = webView
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 1100, height: 720)
        window.appearance = NSAppearance(named: .darkAqua)
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(red: 0.02, green: 0.06, blue: 0.10, alpha: 1)
        window.center()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "jarvis",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "voice":
            startListening()
        case "voiceCancel":
            finishListening(send: false)
        case "hideWindow":
            window.orderOut(nil)
        default:
            break
        }
    }

    func startListening() {
        if isListening {
            finishListening(send: true)
            return
        }

        SFSpeechRecognizer.requestAuthorization { [weak self] authStatus in
            DispatchQueue.main.async {
                guard authStatus == .authorized else {
                    self?.notifyJS(event: "jarvis-voice-error", payload: ["message": "Speech recognition permission was denied."])
                    return
                }
                AVCaptureDevice.requestAccess(for: .audio) { granted in
                    DispatchQueue.main.async {
                        guard granted else {
                            self?.notifyJS(event: "jarvis-voice-error", payload: ["message": "Microphone permission was denied."])
                            return
                        }
                        self?.beginAudioCapture()
                    }
                }
            }
        }
    }

    func beginAudioCapture() {
        guard !isListening else { return }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")), recognizer.isAvailable else {
            notifyJS(event: "jarvis-voice-error", payload: ["message": "Speech recognizer is unavailable right now."])
            return
        }
        speechRecognizer = recognizer

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        recognitionRequest = request

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            notifyJS(event: "jarvis-voice-error", payload: ["message": "Couldn't start audio capture."])
            return
        }

        isListening = true
        lastTranscript = ""
        hasReceivedSpeech = false
        notifyJS(event: "jarvis-voice-start", payload: [:])
        resetSilenceTimer()

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                let text = result.bestTranscription.formattedString
                if text != self.lastTranscript {
                    self.lastTranscript = text
                    self.hasReceivedSpeech = true
                    self.notifyJS(event: "jarvis-voice-partial", payload: ["text": text])
                    self.resetSilenceTimer()
                }
            }
            if error != nil {
                self.finishListening(send: false)
            }
        }
    }

    func resetSilenceTimer() {
        silenceTimer?.invalidate()
        let timeout = hasReceivedSpeech ? silenceTimeout : initialGracePeriod
        silenceTimer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { [weak self] _ in
            self?.finishListening(send: true)
        }
    }

    func finishListening(send: Bool) {
        guard isListening else { return }
        isListening = false
        silenceTimer?.invalidate()
        silenceTimer = nil

        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil

        let finalText = lastTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        if send && !finalText.isEmpty {
            notifyJS(event: "jarvis-voice-result", payload: ["text": finalText])
        } else {
            notifyJS(event: "jarvis-voice-cancelled", payload: [:])
        }
    }

    func notifyJS(event: String, payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        let js = "window.dispatchEvent(new CustomEvent('\(event)', {detail: \(json)}))"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func registerHotKey() {
        let eventHandler: EventHandlerUPP = { (_, _, userData) -> OSStatus in
            guard let userData = userData else { return noErr }
            let appDelegate = Unmanaged<AppDelegate>.fromOpaque(userData).takeUnretainedValue()
            DispatchQueue.main.async {
                appDelegate.toggleWindow()
            }
            return noErr
        }

        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: OSType(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), eventHandler, 1, &eventType, Unmanaged.passUnretained(self).toOpaque(), nil)

        let keyCode = UInt32(kVK_ANSI_S)
        let modifiers = UInt32(optionKey | cmdKey)
        RegisterEventHotKey(keyCode, modifiers, hotKeyID, GetApplicationEventTarget(), 0, &hotKeyRef)
    }

    @objc func toggleWindow() {
        if window.isVisible {
            window.orderOut(nil)
        } else {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
