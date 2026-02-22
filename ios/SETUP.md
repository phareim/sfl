# SFL iOS App — Xcode Setup

## Prerequisites

- Xcode 15+
- Free Apple Developer account (for sideloading to personal device)
- iOS 16.0+ device

---

## 1. Create the Xcode Project

1. Open Xcode → **File → New → Project**
2. Choose **iOS → App**
3. Fill in:
   - Product Name: `SFL`
   - Bundle Identifier: `com.YOURNAME.sfl` *(pick any unique ID)*
   - Interface: **SwiftUI**
   - Language: **Swift**
   - Minimum Deployment: **iOS 16.0**
4. Save to `sfl/ios/` (this folder)

---

## 2. Add the Share Extension Target

1. **File → New → Target**
2. Choose **iOS → Share Extension**
3. Product Name: `SFLShareExtension`
4. Activate the scheme when prompted

---

## 3. Configure App Groups (enables settings to sync between app + extension)

Do this for **both** the `SFL` target and `SFLShareExtension` target:

1. Select target → **Signing & Capabilities** → **+ Capability → App Groups**
2. Add group: `group.com.YOURNAME.sfl`
   *(must match exactly in both targets)*
3. Update `Settings.swift` to use your group ID:
   ```swift
   static let appGroupID = "group.com.YOURNAME.sfl"
   ```

---

## 4. Add Source Files

### Main App target (`SFL`)

Delete the Xcode-generated `ContentView.swift`. Then drag in all files from:
- `ios/SFL/Shared/` → add to **SFL** target ✓
- `ios/SFL/SFLApp.swift` → add to **SFL** target ✓
- `ios/SFL/Views/` → add to **SFL** target ✓

### Share Extension target (`SFLShareExtension`)

1. Delete the Xcode-generated `ShareViewController.swift`
2. Drag in:
   - `ios/SFLShareExtension/ShareViewController.swift` → **SFLShareExtension** only
   - `ios/SFLShareExtension/ShareView.swift` → **SFLShareExtension** only
3. **Also add Shared files to the extension target:**
   - Select `Theme.swift`, `Models.swift`, `Settings.swift`, `APIClient.swift`
   - In File Inspector (right panel) → **Target Membership** → check `SFLShareExtension`

---

## 5. Configure Share Extension Info.plist

Open `SFLShareExtension/Info.plist` and set:

```xml
<key>NSExtension</key>
<dict>
    <key>NSExtensionAttributes</key>
    <dict>
        <key>NSExtensionActivationRule</key>
        <dict>
            <key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
            <integer>1</integer>
            <key>NSExtensionActivationSupportsText</key>
            <true/>
        </dict>
    </dict>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.share-services</string>
</dict>
```

---

## 6. Set Signing

For both targets:
- **Signing & Capabilities → Team**: select your personal Apple ID
- Let Xcode manage provisioning profiles automatically

---

## 7. Build & Run

1. Connect your iPhone via USB and trust the computer
2. Select your device in the toolbar
3. **Product → Run** (⌘R)
4. On first launch: **Settings app → General → VPN & Device Management → Trust** your developer cert
5. Open SFL → Settings tab → enter your Worker URL + API key

---

## 8. Use the Share Extension

- In Safari/any app: tap **Share** → scroll down → **SFL**
- If not visible: tap **More** → enable SFL in the list

---

## Notes

- The Share Extension and main app share settings via the App Group — configure once in the app.
- Network calls require `NSAppTransportSecurity` if your Worker URL is plain HTTP (it won't be — Cloudflare Workers are always HTTPS).
- All type-specific data (article text, tweet body, etc.) is not fetched at capture time — the extension just saves the URL/title/type. Article text is fetched by the API's existing pipeline.
