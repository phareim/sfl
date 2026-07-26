# Xcode Cloud → TestFlight for SFL iOS

**Date:** 2026-07-26
**Status:** Approved

## Goal

`git push` to `main` — from a phone, Claude Code web, or any machine — triggers Xcode Cloud to build the SFL iOS app (including the Share Extension) and deliver it to TestFlight, installable on Petter's phone ~15 minutes later. No Mac in the loop after the one-time setup.

## Approach

Use **Xcode Cloud** (Apple's hosted CI, included with the Apple Developer Program: 25 free compute hours/month, roughly 50–100 builds). Rejected alternative: GitHub Actions + fastlane — more control but requires managing signing certificates as secrets, and private-repo macOS runners bill at 10x (only ~10–15 builds/month on the free tier).

## One-time setup (requires Mac + Xcode, ~30 min)

1. **App Store Connect record.** Verify the SFL bundle ID is registered and an app record exists in App Store Connect; create both if missing. (Local signing already works — the Makefile uses `-allowProvisioningUpdates` — but the app may never have been registered.)
2. **Create the workflow.** In Xcode: Product → Xcode Cloud → Create Workflow for the SFL scheme. Approve the GitHub App installation linking App Store Connect to `phareim/sfl`.
3. **Workflow configuration:**
   - **Trigger:** push to `main`, with a files-and-folders start condition limited to `ios/**`, so monorepo pushes touching only `web/`, `api/`, `cli/`, etc. don't consume build hours.
   - **Action:** Archive for App Store distribution. Cloud-managed signing covers both the app target and the Share Extension.
   - **Post-action:** Distribute to a TestFlight **internal testing** group containing Petter. Internal builds skip Apple's beta review and are installable as soon as processing finishes.
   - Build numbers: Xcode Cloud auto-increments; no version-bump scripting.
4. **Phone side.** Install TestFlight, accept the internal-tester invite (one-time).

## Daily flow

Edit code anywhere → push to `main` → TestFlight push notification → tap update.

## Requirements for the scheme

The SFL scheme must be **shared** (checked into the repo under `SFL.xcodeproj/xcshareddata/xcschemes/`) — Xcode Cloud can only build shared schemes.

## Error handling

- Build failures surface in App Store Connect and as email notifications from Xcode Cloud; logs are viewable in App Store Connect on any device, including a phone.
- If cloud signing fails for the Share Extension, fix is to let Xcode Cloud manage certificates (default) rather than mixing in manually-managed profiles.

## Out of scope (YAGNI)

No fastlane, no certificates in the repo, no external-tester groups, no App Store release automation, no other apps (`do`, `every15`, `write`) — the same recipe can be repeated for them later.

## Verification

1. Push a trivial change under `ios/` to `main` → build starts in App Store Connect.
2. Push a change only touching `web/` → no build starts.
3. Build completes → TestFlight shows the new build → installs on the phone.
