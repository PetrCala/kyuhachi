# ADR-011: Tips Are Consumable In-App Purchases That Unlock Nothing

**Date:** 2026-08-25
**Status:** Accepted

## Context

Kyuhachi is free, has no ads, and carries no third-party analytics. It also has
running costs (Firebase, the Apple developer program) and one unpaid
maintainer. The Support screen already collects the free ways to help: rating,
sharing, bug reports. The open question was whether money should be one of
them, and in what form.

Apple constrains the answer more than product taste does:

- **Money for the developer of the app has to go through in-app purchase**
  (App Review guideline 3.1.1). A "tip jar" is the established shape for this.
- **Linking out to Ko-fi, Patreon, GitHub Sponsors, or PayPal is not a safe
  substitute.** The 2025 external-purchase-link carve-out applies to the US
  storefront; a majority of this app's users are on the JP storefront.
- **The charity rules do not apply.** Those need a registered nonprofit and
  Apple's own donation platform; this is one person's side project.

## Decision

A tip jar of **three consumable in-app purchases**, and nothing else:

| Product id | Price (JP) | What it is |
|---|---|---|
| `com.kyuhachi.app.tip.bath` | ¥300 | The price of one bath |
| `com.kyuhachi.app.tip.towel` | ¥800 | A bath and a towel |
| `com.kyuhachi.app.tip.stay` | ¥2,000 | A night's stay |

The ids live in `shared/src/types/support.ts`; the App Store Connect setup is
in [tip-jar.md](../tip-jar.md).

Four rules follow from "a tip is a thank-you":

1. **A tip unlocks nothing.** No feature, no cosmetic, no badge in the Spaport,
   no changed limit. This is what keeps the app honestly free, and it is what
   the Support screen tells the user in as many words.
2. **No receipt validation and no server component.** Validation exists to
   protect an entitlement. There is no entitlement, so there is nothing a
   forged receipt could obtain. Firestore, the rules, and Functions are
   untouched by this feature.
3. **Consumable, not non-consumable.** A tip can be given again, which a
   non-consumable forbids. It also means there is no purchase to restore, so
   the screen needs no Restore button (a non-consumable would require one).
4. **The only local state is a count of tips given**, in AsyncStorage, driving
   one thank-you line. Nothing reads it to decide what the user may do, so
   losing it on reinstall costs the user nothing.

Prices are shown as the store reports them (`displayPrice`), already formatted
for the user's storefront and currency; the app never formats one. Tier
**names** are the app's own i18n strings, not the store's product names:
StoreKit localizes a product name by the device's App Store account, so a
reader who has set the app to Japanese on, say, a Czech storefront would
otherwise get English names in an otherwise Japanese screen. The App Store
Connect display names still exist (they appear in the purchase sheet) and are
kept in step by hand, in `scripts/asc/tip-products.mjs`.

## Consequences

- **The store is optional infrastructure.** If StoreKit is unreachable
  (offline, sandbox down, products not yet approved), the section says so and
  the rest of the screen is unaffected. This matches the offline-first stance
  of ADR-005: no feature of the app depends on the tip jar.
- **This cannot ship over the air.** `expo-iap` is a native module, so the
  first tip-jar release needs an EAS build, not an OTA update.
- **App Store Connect gains prerequisites** that are easy to forget and fail
  silently by returning zero products: the Paid Applications Agreement, banking
  and tax details, and the products submitted for review alongside a binary.
  All of it is written down in [tip-jar.md](../tip-jar.md).
- **Apple keeps 15%** under the Small Business Program.

## Alternatives considered

- **A non-consumable "supporter" unlock with a cosmetic thank-you.** Rejected:
  it needs a Restore Purchases button and an entitlement to protect, and it
  starts the slide from "tip" toward "paywall" that rule 1 exists to prevent.
- **RevenueCat.** Rejected: it exists to manage entitlements and subscriptions
  across platforms. With nothing to entitle, it would add a third-party service
  and a data-sharing question to a feature whose whole implementation is one
  hook.
- **An external donation link.** Rejected on rejection risk; see Context.
- **Nothing at all.** This was the state of the previous release and it was
  defensible. It also leaves users who want to say thanks with no way to.
