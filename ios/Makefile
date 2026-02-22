PROJECT   = SFL.xcodeproj
SCHEME    = SFL
CONFIG    = Debug
BUILD_DIR = .build
APP       = $(BUILD_DIR)/Build/Products/$(CONFIG)-iphoneos/SFL.app

# ── Targets ──────────────────────────────────────────────────────────────────

.PHONY: build install devices

## List connected iPhones and their UDIDs
devices:
	xcrun devicectl list devices 2>/dev/null | grep -v Simulator

## Build the app (output goes to ios/.build)
build:
	xcodebuild \
	  -project $(PROJECT) \
	  -scheme $(SCHEME) \
	  -configuration $(CONFIG) \
	  -derivedDataPath $(BUILD_DIR) \
	  -destination 'generic/platform=iOS' \
	  build

## Build and install on the first connected iPhone
install: build
	@DEVICE=$$(xcrun devicectl list devices 2>/dev/null \
	  | grep -v Simulator | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' \
	  | head -1); \
	if [ -z "$$DEVICE" ]; then \
	  echo "No iPhone found. Connect your phone and unlock it."; exit 1; \
	fi; \
	echo "→ Installing on $$DEVICE"; \
	xcrun devicectl device install app --device "$$DEVICE" "$(APP)"
