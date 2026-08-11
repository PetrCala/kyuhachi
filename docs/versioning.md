# Versioning

Two numbers ship with every build, and they have different owners.

| Number | Where it lives | Who decides it |
|---|---|---|
| Marketing version `X.Y.Z` (`CFBundleShortVersionString`) | `version` in [app/package.json](../app/package.json) | this repo, bumped automatically on deploy |
| Build number (`CFBundleVersion`) | nowhere, computed at build time | TestFlight: `latest for this version + 1` |

The build number has always been automatic. This page is about the first row.

## The rule

Every push to `master` runs [deploy.yml](../.github/workflows/deploy.yml), which
resolves a bump level, applies it, tags it, and then builds that commit.

The level is resolved by
[scripts/resolve-version-level.mjs](../scripts/resolve-version-level.mjs). First
match wins:

1. **A `workflow_dispatch` input**, when the deploy is triggered by hand.
2. **A `version:*` label** on any PR in the release. If several PRs carry one,
   the strongest wins (`major` > `minor` > `patch` > `none`).
3. **What the push changed.** Anything under `app/`, `shared/`, or `functions/`
   is a `patch`. Docs, CI, Firestore rules, and the fastlane metadata and
   screenshot trees are `none`.

`major` and `minor` are never inferred. A release that big is a decision, so it
takes a label or a manual dispatch. The inferred default is deliberately
conservative: it keeps the public number honest without inflating it by one
minor per feature.

A `none` release still builds and still uploads to TestFlight. It just reuses
the current marketing version, so the build number is the only thing that moves,
which is what every deploy did before this existed.

## Controlling a release

| You want | You do |
|---|---|
| a feature release | label the PR `version:minor` before merging |
| hold the version | label the PR `version:none` |
| ship 2.0 | label the PR `version:major` |
| an exact number | `npm run version:bump -- 1.4.0` locally, merge it with `version:none` |
| a release with no merge | run the Deploy workflow manually and pick a level |

Labels are read off the PRs in the release **at deploy time**, so a label
applied after the merge but before the deploy runs still counts.

## The release range

The level is resolved over everything since the last `v*` tag, not just the head
commit. A push that resolves to `none` leaves no tag behind, so its files and its
PR labels roll forward into the next release rather than being lost. Two docs
pushes followed by a feature merge produce one `patch` (or whatever the labels
ask for) covering all three.

Each commit in the range is mapped back to its PR through GitHub's
`commits/{sha}/pulls` API, so the lookup works whatever merge method was used.
Reading the `(#123)` suffix off the subject would be cheaper, but that suffix
only exists on squash merges and this repo rebase-merges.

## What the deploy actually does

When the level is not `none` and the run is on `master`:

1. `node scripts/version.mjs <level>` updates `app/package.json` and the `app`
   entry in `package-lock.json` (they have to agree or `npm ci` fails).
2. Commits as `chore(release): v1.2.3 [skip ci]` and tags `v1.2.3`.
3. Pushes both to `master`.
4. The build job checks out **that commit**, so the binary carries the new
   version. Checking out the commit that triggered the run would ship the old one.

Three separate things keep the release commit from starting another deploy:
pushes made with the default `GITHUB_TOKEN` do not trigger workflow runs at all,
`[skip ci]` in the commit subject would skip them anyway, and the `version` job
declines to run for the `github-actions[bot]` actor. Any one of them is enough.

Because `master` is unprotected, the built-in `GITHUB_TOKEN` can push directly:
no bot account, no automation PR, no admin merge. If `master` ever gains branch
protection, that push breaks and the job needs a PAT with bypass rights.

### When a bump is wasted

If the build fails after the bump, that version number is spent and the next
deploy takes the next one. That is the right trade: the binary has to carry the
version it was built with, and a skipped integer costs nothing.

If the push is rejected because `master` moved while the run sat in the
concurrency queue, the job fails loudly and the queued deploy picks up both sets
of changes.

## Local and manual use

`npm run version:bump -- <patch|minor|major|X.Y.Z>` still works and is the escape
hatch for setting an exact number. Merge such a change with `version:none` so the
deploy does not bump on top of it.

Running the Deploy workflow manually from a branch other than `master` never
bumps or pushes anything: it builds that branch as-is, which is what the manual
trigger was for.

## Deliberately not done

- **No 4-part `X.Y.Z-BUILD` version** (the Expensify/Kiroku shape). That fourth
  component exists to number builds, and TestFlight already does that here.
- **No bot account or automation PR.** Kiroku needs those because its `master` is
  protected. Kyuhachi's is not.
- **No bumping on the PR branch.** Two open PRs would compute the same next
  version and the second would merge stale. Bumping on `master` is serialized by
  the deploy concurrency group and cannot race.
- **`shared` and `functions` package versions stay independent.** They are
  internal package versions, not the app's.
