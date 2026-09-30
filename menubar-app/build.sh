#!/bin/zsh
# Builds JarvisOSv2MenuBar and packages it into JarvisOSv2MenuBar.app.
# Run this after any source change, then restart the LaunchAgent:
#   launchctl kickstart -k gui/$(id -u)/com.jarvis.os.v2.menubar

set -e
cd "$(dirname "$0")"

swift build -c release
BIN_PATH=$(swift build -c release --show-bin-path)

mkdir -p JarvisOSv2MenuBar.app/Contents/MacOS
cp "$BIN_PATH/JarvisOSv2MenuBar" JarvisOSv2MenuBar.app/Contents/MacOS/JarvisOSv2MenuBar
chmod +x JarvisOSv2MenuBar.app/Contents/MacOS/JarvisOSv2MenuBar

# Privacy strings required for mic + speech (must live in the .app Info.plist)
cat > JarvisOSv2MenuBar.app/Contents/Info.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDisplayName</key>
    <string>Jarvis OS v2</string>
    <key>CFBundleExecutable</key>
    <string>JarvisOSv2MenuBar</string>
    <key>CFBundleIdentifier</key>
    <string>com.jarvis.os.v2.menubar</string>
    <key>CFBundleName</key>
    <string>JarvisOSv2MenuBar</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.1</string>
    <key>CFBundleVersion</key>
    <string>1.1</string>
    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSMicrophoneUsageDescription</key>
    <string>Jarvis OS v2 needs microphone access so you can talk to it with the voice button.</string>
    <key>NSSpeechRecognitionUsageDescription</key>
    <string>Jarvis OS v2 uses speech recognition to turn what you say into text.</string>
</dict>
</plist>
PLIST

codesign --force --deep --sign - JarvisOSv2MenuBar.app

echo "Built JarvisOSv2MenuBar.app (with mic/speech privacy keys)"
