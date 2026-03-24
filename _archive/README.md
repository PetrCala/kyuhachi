# Archive

This directory contains the original Python expedition planning prototype for the 九州八十八湯 trail walk (2026-09-30).

**Do not import from here.** It is reference material only.

## What's here

- `src/` — Python source: scraper, trail optimizer, scheduler, map generator
- `scripts/` — Standalone scripts (GPX map)
- `artifacts/` — Scraped data from 88onsen.com
- `data/` — SQLite database (`kyushu.dev.db`) and cached data
- `onsens.json` / `onsens.csv` — 144 onsens with name, area, address, lat/lng (seed data for the data repo)
- `pyproject.toml` / `poetry.lock` — Python dependencies

## What belongs in the separate data repo

The scraper, parser, importer, and publisher belong in the private data repo.
The `onsens.json` and SQLite database are the seed for the initial Firestore publish.
The `data/mappings/onsen_id_map.json` (not here yet — to be created in data repo) is the stable ID assignment file.
