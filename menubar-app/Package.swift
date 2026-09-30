// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "JarvisOSv2MenuBar",
    platforms: [.macOS(.v12)],
    targets: [
        .executableTarget(name: "JarvisOSv2MenuBar", path: "Sources/JarvisOSv2MenuBar")
    ]
)
