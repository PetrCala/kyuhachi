# Tip jar: App Store Connect setup

The in-app side of the tip jar is finished and tested. It cannot work until the
products exist in App Store Connect, and until they do, `fetchProducts` returns
an empty list and the Support screen shows "The tip jar cannot be reached right
now." That is the expected state of a build made before the steps below are
done. Why it is built this way: [ADR-011](adr/011-tip-jar.md).

## 1. Prerequisites (once)

Both of these are silent failures: without them, products stay in **Missing
Metadata** and the store returns nothing to the app, with no error that says
why.

- **Paid Applications Agreement** accepted in App Store Connect →
  Business → Agreements.
- **Banking and tax details** filled in for the account, including the Japanese
  tax forms if the account is Japan-based.
- Confirm the account is enrolled in the **Small Business Program** (15% rather
  than 30%).

## 2. Create the products

App Store Connect → the app (`6761064476`) → **Monetization → In-App
Purchases**. Three products, all of type **Consumable**:

| Product ID | Reference name | Price point |
|---|---|---|
| `com.kyuhachi.app.tip.bath` | Tip: bath | ¥300 |
| `com.kyuhachi.app.tip.towel` | Tip: towel | ¥800 |
| `com.kyuhachi.app.tip.stay` | Tip: stay | ¥2,000 |

The ids must match `TIP_PRODUCT_IDS` in
[shared/src/types/support.ts](../shared/src/types/support.ts) exactly. StoreKit
silently omits an id it does not recognise, so a typo shows up as a missing row
rather than an error.

Each product needs **two localizations**, English and Japanese. The display
name is what the app renders in the row, so it carries the voice
([brand-voice.md](brand-voice.md)); the description is only seen in the App
Store listing.

| Product | EN display name | JA display name |
|---|---|---|
| bath | Buy me a bath | 一湯ぶんの心付け |
| towel | A bath and a towel | 湯とタオルぶん |
| stay | A night's stay | 一泊ぶん |

| Product | EN description | JA description |
|---|---|---|
| bath | A thank-you the size of one onsen entry fee. Unlocks nothing. | 温泉一回ぶんのお礼です。機能は何も変わりません。 |
| towel | A thank-you the size of a bath and a rental towel. Unlocks nothing. | 入浴とタオルぶんのお礼です。機能は何も変わりません。 |
| stay | A thank-you the size of a night in a small inn. Unlocks nothing. | 素泊まり一泊ぶんのお礼です。機能は何も変わりません。 |

Each product also needs a **review screenshot**: the Support screen with the
tip jar visible, taken from a simulator or a device.

## 3. Review notes

Paste this into each product's review notes. It answers the two questions a
reviewer asks about a tip jar:

> Optional tip. It unlocks no features, content, or functionality: the app
> behaves identically whether or not a tip is ever given, and no part of the
> app is gated. Consumable so it can be given more than once; there is nothing
> to restore. To see it: Menu → Support Kyuhachi.

## 4. Submitting

The **first** time, the products must be submitted for review **attached to a
binary** (select them in the version's "In-App Purchases" section before
submitting). Products submitted on their own stay in "Waiting for Review"
indefinitely.

`expo-iap` is a native module, so the release carrying the tip jar has to be an
EAS build. It cannot go out as an OTA update.

## 5. Testing before release

- **Sandbox on device.** Create a Sandbox Apple Account in App Store Connect →
  Users and Access → Sandbox, then sign into it on the device under Settings →
  Developer → Sandbox Apple Account. Purchases are free and repeatable. The
  products must be at least "Ready to Submit" for sandbox to return them.
- **Simulator.** Sandbox does not work there. Add a StoreKit configuration file
  in Xcode (File → New → StoreKit Configuration File, synced with App Store
  Connect) and select it in the scheme's Run → Options. This is a local-only
  change to `ios/`, which is gitignored.
- **The unavailable path** is worth seeing at least once: turn on airplane mode
  and open the Support screen.

## What is deliberately absent

- **No receipt validation, no server, no Firestore write.** A tip grants
  nothing, so there is nothing for a forged receipt to obtain (ADR-011).
- **No Restore Purchases button.** Consumables are not restorable, and there is
  no entitlement to restore. A non-consumable product would require one.
- **No App Privacy change.** Apple, not the app, handles the transaction; the
  app stores only a local count of tips given, which never leaves the device.
