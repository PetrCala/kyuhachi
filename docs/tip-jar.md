# Tip jar: App Store Connect setup

The in-app side of the tip jar is finished and tested. It cannot work until the
products exist and are approved in App Store Connect; until then `fetchProducts`
returns nothing and the Support screen shows "The tip jar cannot be reached
right now." That is the expected state of a build made before the steps below
are done, not a bug. Why it is built this way: [ADR-011](adr/011-tip-jar.md).

To see where things stand at any point:

```bash
node scripts/asc/tip-products.mjs status
```

## 1. Prerequisites (once, manual)

Both are silent failures: without them, products stay in **Missing Metadata**
and the store returns nothing to the app, with no error that says why.

- **Paid Applications Agreement** accepted in App Store Connect →
  Business → Agreements.
- **Banking and tax details** filled in for the account.
- Confirm enrolment in the **Small Business Program** (15% rather than 30%).
  The proceeds the API reports on a price point are a quick sanity check: ¥191
  on the ¥300 tier is the 30% rate after Japanese consumption tax, ¥232 is the
  15% one.

## 2. Create the products

```bash
node scripts/asc/tip-products.mjs setup
```

Idempotent: it skips anything that already exists, so it is safe to re-run
after a failure partway through. It creates each product, both localizations,
the territory list (mirroring the app's own), and the price.

| Product ID | Price (JPN base) | Type |
|---|---|---|
| `com.kyuhachi.app.tip.bath` | ¥300 | Consumable |
| `com.kyuhachi.app.tip.towel` | ¥800 | Consumable |
| `com.kyuhachi.app.tip.stay` | ¥2,000 | Consumable |

The ids, names, descriptions and review note all live in
[scripts/asc/tip-products.mjs](../scripts/asc/tip-products.mjs) so there is one
copy of them; they must match `TIP_PRODUCT_IDS` in
[shared/src/types/support.ts](../shared/src/types/support.ts) exactly, because
StoreKit silently omits an id it does not recognise. Only the JPN price is set
by hand: Apple derives the other 174 territories from it.

What the API teaches you the hard way:

- **Localization descriptions cap at 45 characters** and names at 30. Longer
  copy is rejected, so these are terser than the app's own strings.
- **A price schedule resource exists as soon as the product does**, carrying no
  price. Its existence proves nothing; check `manualPrices` instead.
- **Transient 500s are normal.** The client retries them.

## 3. Review screenshots

Each product needs a screenshot, and this is the one genuine catch-22: sandbox
only returns products that are at least Ready to Submit, and a product cannot
reach Ready to Submit without a screenshot. So the first screenshot cannot come
from a real purchase flow.

Two ways out if the products ever do get filtered out, both showing the real
screen with the real copy:

- **A StoreKit configuration file in Xcode** (File → New → StoreKit
  Configuration File, then Product → Scheme → Edit Scheme → Run → Options).
  Apple's own mechanism, but it only applies when running from the Xcode GUI:
  `xcodebuild` and `simctl launch` do not sync it.
- **A temporary local stub** of `useTipJar` returning the three products with
  the exact titles and prices published above, built to the simulator. Never
  committed; revert it after capturing.

In practice neither was needed: products in Missing Metadata *are* returned to
a TestFlight build, so a screenshot of the real screen on a real phone is the
easiest source. Take one, then upload the same image to all three products:

```bash
node scripts/asc/tip-products.mjs screenshot path/to/shot.png
```

App Store Connect accepts review screenshots only at specific dimensions and
rejects everything else with `IMAGE_INCORRECT_DIMENSIONS`, minutes after the
upload itself reports success. A phone screenshot is not one of the accepted
sizes, so the script letterboxes it to 640x920 first. Two more traps in the
same call: the relationship is `inAppPurchaseV2` (`inAppPurchase` comes back
as a 409), and a failed asset shows up only in `assetDeliveryState`, never as
an HTTP error, which is why `status` prints it.

## 4. Submitting

The **first** time, the products must be submitted **attached to a binary**:
select them in the version's In-App Purchases section before submitting.
Products submitted on their own sit in "Waiting for Review" indefinitely.

`expo-iap` is a native module, so the release carrying the tip jar has to be an
EAS build. It cannot go out as an OTA update.

## 5. Testing once approved

- **Sandbox on device.** Create a Sandbox Apple Account in App Store Connect →
  Users and Access → Sandbox, then sign into it on the device under Settings →
  Developer → Sandbox Apple Account. Purchases are free and repeatable.
- **The unavailable path** is worth seeing at least once: turn on airplane mode
  and open the Support screen.

## What is deliberately absent

- **No receipt validation, no server, no Firestore write.** A tip grants
  nothing, so there is nothing for a forged receipt to obtain (ADR-011).
- **No Restore Purchases button.** Consumables are not restorable, and there is
  no entitlement to restore. A non-consumable product would require one.
- **No App Privacy change.** Apple, not the app, handles the transaction; the
  app stores only a local count of tips given, which never leaves the device.
