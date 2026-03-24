# ADR-006: Two-Repo Split (App Repo + Data Repo)

**Date:** 2026-03-24
**Status:** Accepted

## Context

The project has two distinct concerns with different ownership, cadence, and tooling:

1. **App + backend** — Expo app, Firebase Functions, Firestore rules, CI/CD; TypeScript throughout; changes on every feature sprint
2. **Data pipeline** — Python scraper for 88onsen.com, onsen ID assignment, catalog publishing to Firestore; changes when the official onsen list changes or scraping breaks; requires SQLite, OR-Tools, and geocoding tools that have no place in a Node/TypeScript repo

Combining them would mean:
- Python tooling (Poetry, pyproject.toml, venv) alongside Node tooling (npm, package.json)
- CI pipelines entangled across concerns with unrelated failure modes
- The data pipeline and its dependencies visible to contributors working only on the app

## Decision

Maintain two separate repositories:

**This repo (app repo):** Expo app, Firebase Functions, shared TypeScript types, Firestore/Storage rules, CI/CD workflows. Everything needed to build and deploy the app.

**Separate private data repo:** Python scraper (`scraper/`), Japanese hours/closure parsers (`parser/`), onsen ID assignment and mapping (`importer/`), Firestore catalog publisher (`publisher/`), stable ID mapping file (`data/mappings/onsen_id_map.json`), legacy trail planner code (`legacy/trail_planner/`).

The data repo writes to Firestore via a service account. The app repo has no knowledge of the data repo's internals. Communication between repos is one-way: data repo → Firestore → app.

## Consequences

- **Clear separation** — a developer working on the app never needs to run Python or understand the scraping pipeline
- **Independent deploy cadence** — catalog updates (data repo publishes to Firestore) are decoupled from app releases
- **`onsen_id_map.json` is the contract** — the data repo owns stable ID assignment; if this file is lost or corrupted, reconstruction requires cross-referencing Firestore with scraped data
- **No shared CI** — the repos have independent CI pipelines; a broken scraper does not block an app release
- **Admin operations use service account** — the data repo's publish script authenticates as a service account with write access to `/onsens` and `/challenge_types`; the app's Firestore rules deny all user writes to these collections
- **Trail optimization code is archived** — `_archive/` in this repo and `legacy/trail_planner/` in the data repo preserve the original expedition planning prototype; neither is executable from the main codebase
