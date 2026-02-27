// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SFLCapture",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "SFLCapture",
            path: "Sources"
        )
    ]
)
