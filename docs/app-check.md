# App Check

Firebase App Check attests that a request to Firestore, Storage or Functions came
from the genuine Kyuhachi binary on a real Apple device, rather than from a script
holding a valid ID token. It is defense in depth; it does not replace security
rules, and the rules stay the authority on who may read or write what.

Why it matters for the public release: `firebase/firestore.rules` grants the whole
onsen catalog, the area guides and the challenge types to any `isAuthenticated()`
user, and sign-up is open. On TestFlight that is fine, because the only accounts
are the maintainer's and the testers'. On a public App Store listing anyone can
register an account and then mirror the entire curated catalog, or simply loop
reads and run up the bill. App Check is what makes a stolen ID token outside the
app useless.

## Current state: monitoring, not enforcement

The app initializes App Check (`app/src/firebase/app-check.ts`, started from
`app/src/firebase/index.ts`) so real builds request an attestation token and
attach it to their Firebase calls. **Nothing is enforced.** Firestore, Storage and
Functions all still accept unattested requests, exactly as before, and no callable
in `functions/` sets `enforceAppCheck`.

Step (a) below is done: the DeviceCheck key was registered on 2026-08-10, and the
console shows `com.kyuhachi.app` as Registered with DeviceCheck and App Attest.
Steps (b) and (c) are the live ones, and verified traffic sits at 0% until a build
carrying this code reaches real devices.

That split is deliberate. Enforcement takes effect the moment it is switched on,
and it applies to every client, including the TestFlight builds already sitting on
the maintainer's and the testers' phones, which contain no App Check code at all
and can never attest. Turning it on before those builds are replaced bricks them.
So the first step is only to start producing attestations that can be watched in
the console.

Provider per build type:

| Build | Provider | Notes |
|---|---|---|
| Metro / simulator / dev client (`__DEV__`) | debug | Needs a debug token registered by hand, see step (e) |
| PR preview (`preview-build.yml` -> TestFlight) | DeviceCheck | Real device traffic, this is what we want measured |
| Production (`deploy.yml` -> TestFlight -> App Store) | DeviceCheck | Same |

Both shipped builds go through fastlane; the EAS profiles in `eas.json` are a
fallback and take the same paths.

The gate is `__DEV__`, not `DEV_TOOLS_ENABLED` from `app/src/lib/dev/flags.ts`.
`DEV_TOOLS_ENABLED` is also true for preview builds, and preview builds are
real signed binaries on real devices: they should attest with DeviceCheck like
production, not fall back to a debug token they do not have.

## Rollout order

Do these in order. Steps (a), (c), (d) and (e) are console work that only a human
with the Firebase and Apple Developer accounts can do.

### (a) Register a DeviceCheck private key (human, Apple + Firebase console)

DeviceCheck attestation is verified server side by Firebase against an Apple
private key, so the key has to exist before any token can be validated.

1. Apple Developer portal, <https://developer.apple.com/account>: **Certificates,
   Identifiers & Profiles** in the sidebar, then **Keys**, then the **+** button.
2. Name the key (for example `Kyuhachi App Check DeviceCheck`), tick
   **DeviceCheck**, then **Continue** and **Register**.
3. **Download** the `.p8` file. Apple allows exactly one download; if it is lost
   the key has to be revoked and recreated. Note the **Key ID** shown on the same
   page. Keep the `.p8` out of this repo.
4. Team ID: Apple Developer portal, **Membership details**, the **Team ID** field.
5. Firebase console, <https://console.firebase.google.com>, project `kyuhachi`:
   the gear icon next to **Project Overview**, then **Project settings**, then the
   **App Check** tab, then the **Apps** sub-tab. Expand the iOS app
   `com.kyuhachi.app`, click **DeviceCheck**, upload the `.p8`, fill in **Key ID**
   and **Team ID**, and **Save**.

Registering the key changes nothing on its own. It does not enforce anything.

### (b) Merge and ship a build

Merge this change, then cut a build the usual way (see [ios-deploy.md](ios-deploy.md))
and get it onto TestFlight. Attestation only starts being reported once real
devices are running code that asks for a token, so nothing useful shows up in the
console until testers are on the new build.

### (c) Watch the metrics until attestation is landing (human, Firebase console)

Firebase console, **Project settings**, **App Check** tab, **APIs** sub-tab. Each
service (Cloud Firestore, Cloud Storage, Cloud Functions) reports its requests
split into verified, unverified, and outdated-client buckets over the last 30
days.

What to wait for, per service:

- Verified requests climbing as testers move onto the new build.
- Unverified and outdated-client requests falling to roughly zero, or to a
  residue you can account for (an old build someone has not updated).

Do not read a single day and act on it. Enforcement is safe only once the traffic
that would be rejected is traffic you are willing to reject. Cloud Functions in
particular can look quiet for days, because `claimTier` is called rarely.

### (d) Enable enforcement, one service at a time (human, Firebase console)

Only after (c) looks healthy, and as a separate deliberate decision, not part of
this change.

**Never enable enforcement while a build is in App Review.** Enforcement applies
to every client at once, and the reviewer is running a build you cannot register a
debug token for. If it fails to attest, every Firestore read fails and the app
looks broken to them, with no error they can act on and none you can explain after
the fact. That is a rejection. Enable between submissions, never during one. Same
warning, from the submission side:
[app-store-submission.md](app-store-submission.md).

Same screen: **Project settings**, **App Check**, **APIs**, click the service, then
**Enforce**. Do one service, watch for a day, then the next. Suggested order is
Storage, then Firestore, then Functions, so the blast radius of a mistake grows
slowly rather than taking the whole app out at once.

Enforcement can be switched back off from the same screen and takes effect within
minutes, so this is recoverable, but users hit errors in between.

Cloud Functions has a second, code-level switch that is independent of the
console: `enforceAppCheck: true` on a v2 `onCall`. Nothing in `functions/` sets it
today and nothing should until this step. When it is added it will be to
`functions/src/callables/claimTier.ts`, and it needs a Functions deploy from the
main checkout on `master` (see the deploy notes in [ios-deploy.md](ios-deploy.md)),
not just a console toggle.

### (e) Debug token for the simulator or a dev client (human, Firebase console)

`__DEV__` builds use the debug provider, which cannot attest hardware and instead
presents a token you register by hand. Without one, a dev build's requests count
as unverified, which is harmless while nothing is enforced but becomes a hard
block after step (d).

1. Run the app in the simulator or a dev client. The native SDK prints a line like
   `Firebase App Check Debug Token: 12345678-90ab-cdef-1234-567890abcdef` to the
   Xcode console (and to the Metro logs). It generates a fresh one per install
   unless you pin it, see below.
2. Firebase console, **Project settings**, **App Check**, **Apps** sub-tab. On the
   iOS app row, open the overflow (three dots) menu, choose **Manage debug
   tokens**, then **Add debug token**, paste it, and give it a name identifying
   the machine or simulator.
3. To keep one token across reinstalls, set `EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN` in
   your local `.env` (or on the EAS `development` profile) to the registered
   value. `app/src/firebase/app-check.ts` passes it to the debug provider.

Debug tokens bypass attestation completely, so treat them as secrets: never commit
one, and delete the console entry when a machine is retired.

## Troubleshooting

- **Nothing appears in the metrics at all.** The build being tested predates this
  change, or the token request failed. Initialization failures are swallowed on
  purpose (nothing is enforced, so they must not break the app) but they log a
  warning in `__DEV__`.
- **A dev build shows as unverified.** Expected until its debug token is
  registered, see step (e).
- **`firestore/permission-denied` right after enabling enforcement.** That is
  enforcement rejecting an unattested client. Turn enforcement back off for that
  service, then work out which build is failing to attest before retrying.

## Related

- [adr/002-react-native-firebase-vs-js-sdk.md](adr/002-react-native-firebase-vs-js-sdk.md):
  App Check with DeviceCheck needs native integration, which is one of the reasons
  the app uses `@react-native-firebase` rather than the JS SDK.
- [implementation-plan.md](implementation-plan.md): the App Check section of the
  original plan, which assumed this was in place from Phase 1.
