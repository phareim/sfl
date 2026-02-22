# SFL iOS App — Setup

## Prerequisites

- Xcode 15+
- Free Apple Developer account (for sideloading)
- iOS 16.0+ device

---

## 1. Open the project

```
open ios/SFL.xcodeproj
```

---

## 2. Set your Team

In Xcode: select the **SFL** project in the navigator → for each target (`SFL` and `SFLShareExtension`) → **Signing & Capabilities → Team** → select your personal Apple ID.

Xcode will generate provisioning profiles automatically.

---

## 3. Configure App Groups

Both targets need the same App Group so settings sync between the app and Share Extension.

For **each target** → **Signing & Capabilities → + Capability → App Groups**:
- Add: `group.sfl.personal`

If you want a different group ID, update it in three places:
- `Signing & Capabilities` for both targets
- `Settings.swift`: `static let appGroupID = "group.sfl.personal"`

---

## 4. Build & Run

Connect your iPhone → select it in the toolbar → **⌘R**.

On first launch: **Settings → General → VPN & Device Management → Trust** your developer certificate.

---

## 5. Configure API

Open the app → **Settings tab** → enter your Worker URL and API key.

---

## 6. Use the Share Extension

- In Safari or any app: tap **Share** → **SFL**
- If not visible: tap **More** → enable SFL

---

## Bundle ID

The default bundle ID is `com.personal.sfl`. Change it in **Build Settings → Product Bundle Identifier** for both targets (extension must be `<app-id>.ShareExtension`).
