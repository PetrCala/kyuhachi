# Konbini eat-in batch job

**Last updated:** 2026-10-08

A one-off, re-runnable job that flags which convenience stores (コンビニ) along
the planned route have an eat-in space (イートインスペース), and publishes the
answers to `/konbini` so the finder can show a badge. The script is
`scripts/konbini-eat-in.ts`; its evidence rules, merge and cost model live in
`functions/src/util/konbini-eat-in.ts` so they are typechecked and unit tested
in CI.

## What the app does with it

Stores still come live from Apple Maps (MKLocalSearch); nothing about the
finder's listing changed. When the category is convenience stores, the finder
reads `/konbini` once (offline persistence serves it from cache), matches each
live result to a document by position (within 120 m) with the chain name as a
tie-breaker (`app/src/lib/eat-in.ts`), and shows an **Eat-in** or **Eat-in
(likely)** pill in the row and in the pin's callout. `no` and `unknown` render
nothing. Apple results carry no stable id, which is why the join is geometric.

## Stages

Cheapest first. Each later stage runs only for stores the earlier ones left
`unknown`.

1. **OpenStreetMap (free).** One Overpass query for every `shop=convenience`
   element within the buffer (default 2 km) of the route polyline, re-filtered
   locally against the full-resolution route. Seating tags are direct evidence:
   `indoor_seating`, `eat_in`, `seating` (any value but `no`), and a positive
   `seats` / `capacity:seats`. `outdoor_seating` is not evidence.
2. **Google Places API (New).** Text Search with an IDs-only field mask (free
   SKU) inside a ±150 m box, restricted to `convenience_store`, then one Place
   Details call per store for `dineIn`, `reviews`, `photos`, `location`,
   `displayName` and `addressComponents`. The call is billed once, as
   Enterprise + Atmosphere (the highest SKU among the fields), 1,000 free per
   month. `dineIn=true` is evidence; `false` is not (the attribute is rarely
   maintained for Japanese chains). A review counts when a sentence names the
   space (イートイン, 店内飲食, 座席, eat-in, dine-in) with no negation or wish
   in the same sentence.
3. **Photos.** Up to `--max-photos` (3) of the matched place's photos (Place
   Photo SKU, 10,000 free per month) are sent in one request to Claude
   (`claude-opus-5-5`, structured JSON output) to say whether each shows indoor
   customer seating. A confident `indoor` verdict yields `likely`, never `yes`.

### Merge rules (precision first)

| Evidence | Status |
| --- | --- |
| any `yes` source, no `no` source | `yes` (agreeing sources raise confidence) |
| a `yes` and a `no` source | `unknown` (a contradiction never earns a badge) |
| only `no` sources | `no` |
| only photo evidence | `likely` |
| nothing | `unknown` |

## Running

```sh
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json \
GOOGLE_MAPS_API_KEY=... \
ANTHROPIC_API_KEY=... \
npm run konbini:eat-in -- [flags]
```

- The service account key is the one the other scripts use; keep it outside
  the repository.
- The Google key needs **Places API (New)** enabled on its project. The legacy
  Places API cannot be enabled on new projects and is not used.
- Omit `GOOGLE_MAPS_API_KEY` to stop after stage 1; omit `ANTHROPIC_API_KEY`
  to stop after stage 2.
- `--dry-run` writes nothing and, with no keys, needs no credentials at all:
  the route (the default challenge's `activeRouteId`) and the onsen catalog
  are public reads.

Useful flags: `--buffer-km`, `--route-id` / `--gpx`, `--osm-file` (a saved
Overpass JSON, e.g. an overpass-turbo export, instead of querying),
`--skip-google`, `--skip-photos`, `--max-photos`, `--limit` (first n
unresolved stores only), `--refresh-google`, `--cache-dir`, `--report`.
`--help` prints the full list.

## Idempotency

- Document ids are the OSM element ids (`osm-node-123`), so a re-run upserts
  the same documents; `createdAt` is preserved.
- Stores already answered in Firestore are not looked up again unless
  `--refresh-google` is passed.
- Every Overpass response, Google lookup and photo verdict is cached under
  `--cache-dir` (default `.cache/konbini-eat-in`, git-ignored). A re-run after
  a crash, a rule tweak or a wiped collection costs nothing for stores already
  fetched.
- Documents are never deleted. A store that leaves the buffer (a changed
  route) keeps its document; the app only ever matches by position anyway.

## Spend guard

Every paid call is counted at Google's **list price**, as if no free allowance
existed (the safe direction). The job refuses to start a stage whose projected
total would pass `--max-spend-usd` (default 10) and stops mid-stage before any
call that would cross it, exiting with status 2 so a re-run (with a higher cap)
can continue from the cache. The report shows both the list price and the
charge expected after the monthly free allowance; for a few hundred stores the
latter is $0.

List prices used (March 2025 pricing; verify before budgeting): Place Details
Enterprise + Atmosphere $25 per 1,000 (1,000 free per month), Place Photo $7
per 1,000 (10,000 free), Text Search IDs only free. Claude usage is priced from
the response's token counts at the model's list rate.

## Output

A Markdown report (default `<cache-dir>/report.md`, also printed): total
stores, counts per status, estimated cost, every `yes` / `likely` store with
name, town, confidence, offset from the route and the evidence behind it, and
the names still `unknown`.

`town` is best effort: OSM `addr:city`, else Google's locality, else the
nearest onsen's area (suffixed 周辺) within 15 km, else null.
