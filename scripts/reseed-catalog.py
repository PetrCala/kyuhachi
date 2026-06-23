#!/usr/bin/env python3
"""
One-off CLEAN-SLATE catalog reseed.

Fully replaces every onsen document with complete data from the richest archive
artifact (the full scrape that the v1 seed dropped), and wipes throwaway
user-generated state so nothing incompatible is left behind. Pre-launch only:
all challenge/visit data is disposable.

What it does (with --commit):
  1. ONSENS — overwrites all /onsens/{kyuhachiId} docs with the COMPLETE document
     built from _archive/data/db/kyushu.dev.db (full overwrite, not a merge), and
     deletes any onsen doc whose id isn't in the new set.
  2. CHALLENGES + VISITS — deletes every /users/*/challenges/* doc and all of their
     /visits/* docs, and resets each affected user's defaultChallengeId to null.
  3. catalog_meta/current — rewritten to match (version 1, counts, publishedAt now).

kyuhachiIds are PRESERVED (locked stable IDs, mapped in scripts/onsen-id-map.json).
businessHours.schedule is left null (source has no per-weekday data; app shows raw).

Auth: gcloud Application Default Credentials access token (project owner → admin
access, bypasses security rules). Run `gcloud auth application-default login` if 401.

Usage:
  python3 scripts/reseed-catalog.py            # dry-run (default): prints the full plan, writes nothing
  python3 scripts/reseed-catalog.py --commit   # executes the replace + wipe
"""
import argparse
import json
import os
import sqlite3
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timezone

PROJECT = "kyuhachi-fddcc"
# Document resource path as it appears in REST `name` fields and commit-write names
# (no https prefix). BASE is the same path as a callable URL.
DOCPATH = f"projects/{PROJECT}/databases/(default)/documents"
BASE = f"https://firestore.googleapis.com/v1/{DOCPATH}"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "_archive/data/db/kyushu.dev.db")
IDMAP = os.path.join(ROOT, "scripts/onsen-id-map.json")
CATALOG_VERSION = 1


def access_token():
    return subprocess.check_output(
        ["gcloud", "auth", "application-default", "print-access-token"], text=True
    ).strip()


def api(method, url, token, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        print(f"\n  HTTP {e.code} on {method} {url}\n  body: {e.read().decode()[:1500]}")
        raise


def list_docs(rel_path, token):
    """List all documents in a collection, following pagination. [] if empty."""
    out, page = [], ""
    while True:
        url = f"{BASE}/{rel_path}?pageSize=300{page}"
        try:
            data = api("GET", url, token)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return []
            raise
        out += data.get("documents", [])
        nxt = data.get("nextPageToken")
        if not nxt:
            return out
        page = f"&pageToken={nxt}"


def s(v):
    v = (v or "").strip()
    return {"stringValue": v} if v else {"nullValue": None}


def full_onsen_doc(row, now_iso):
    raw_hours = (row["business_hours"] or "").strip()
    business_hours = (
        {"mapValue": {"fields": {"raw": {"stringValue": raw_hours}, "schedule": {"nullValue": None}}}}
        if raw_hours else {"nullValue": None}
    )
    return {
        "name": s(row["facility_name"]),
        "areaName": s(row["onsen_area_name"]),
        "address": s(row["address"]),
        "prefecture": s(row["prefecture"]),
        "lat": {"doubleValue": row["latitude"]},
        "lng": {"doubleValue": row["longitude"]},
        "phone": s(row["phone"]),
        "businessHours": business_hours,
        "admissionFee": s(row["admission_fee"]),
        "springQuality": s(row["spring_quality"]),
        "websiteUrl": s(row["website_url"]),
        "imageUrl": s(row["image_url"]),
        "isActive": {"booleanValue": True},
        "catalogVersion": {"integerValue": str(CATALOG_VERSION)},
        "createdAt": {"timestampValue": now_iso},
        "updatedAt": {"timestampValue": now_iso},
    }


def commit(writes, token, label):
    BATCH = 450
    for i in range(0, len(writes), BATCH):
        chunk = writes[i:i + BATCH]
        res = api("POST", BASE + ":commit", token, {"writes": chunk})
        print(f"  {label}: committed {len(chunk)} ({len(res.get('writeResults', []))} results)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true", help="execute the replace + wipe")
    args = ap.parse_args()

    token = access_token()
    idmap = json.load(open(IDMAP))
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

    # 1. Build the new full onsen docs.
    new_ids, onsen_writes, missing = set(), [], []
    for upstream_id, kid in idmap.items():
        row = db.execute("SELECT * FROM onsens WHERE id=?", (int(upstream_id),)).fetchone()
        if row is None:
            missing.append(upstream_id)
            continue
        new_ids.add(kid)
        onsen_writes.append({"update": {"name": f"{DOCPATH}/onsens/{kid}", "fields": full_onsen_doc(row, now_iso)}})

    # 2. Orphan onsen docs (exist in Firestore but not in the new set).
    existing = [d["name"].split("/")[-1] for d in list_docs("onsens", token)]
    orphans = [oid for oid in existing if oid not in new_ids]

    # 3. Challenges + visits to delete, users to reset.
    users = [u["name"].split("/")[-1] for u in list_docs("users", token)]
    challenge_deletes, visit_deletes, users_with_challenges = [], [], []
    for uid in users:
        challenges = list_docs(f"users/{uid}/challenges", token)
        if challenges:
            users_with_challenges.append(uid)
        for ch in challenges:
            cid = ch["name"].split("/")[-1]
            for v in list_docs(f"users/{uid}/challenges/{cid}/visits", token):
                visit_deletes.append({"delete": v["name"]})
            challenge_deletes.append({"delete": ch["name"]})

    # ── Report ───────────────────────────────────────────────────────────────
    print(f"Clean-slate catalog reseed — {'COMMIT' if args.commit else 'DRY-RUN'}")
    print(f"  project                : {PROJECT}")
    print("  source DB              : _archive/data/db/kyushu.dev.db")
    print(f"  onsen docs overwritten : {len(onsen_writes)}")
    print(f"  orphan onsens deleted  : {len(orphans)}  {orphans if orphans else ''}")
    if missing:
        print(f"  WARNING no DB row for  : {missing}")
    print(f"  users found            : {len(users)}")
    print(f"  challenges deleted     : {len(challenge_deletes)} (across {len(users_with_challenges)} users)")
    print(f"  visits deleted         : {len(visit_deletes)}")
    print(f"  defaultChallengeId reset on: {len(users_with_challenges)} users")
    if onsen_writes:
        sample = {k: (next(iter(v.values())) if next(iter(v)) != "mapValue"
                      else {kk: list(vv.values())[0] for kk, vv in v["mapValue"]["fields"].items()})
                  for k, v in onsen_writes[0]["update"]["fields"].items()}
        print("\n  sample onsen doc (full overwrite):")
        print("   ", json.dumps(sample, ensure_ascii=False)[:400])

    if not args.commit:
        print("\nDry-run only — nothing written. Re-run with --commit to execute.")
        return

    # ── Execute ──────────────────────────────────────────────────────────────
    print("\nExecuting…")
    commit(onsen_writes, token, "onsens")
    if orphans:
        commit([{"delete": f"{DOCPATH}/onsens/{oid}"} for oid in orphans], token, "orphans")
    if visit_deletes:
        commit(visit_deletes, token, "visits")
    if challenge_deletes:
        commit(challenge_deletes, token, "challenges")
    for uid in users_with_challenges:
        api("PATCH", f"{BASE}/users/{uid}?updateMask.fieldPaths=defaultChallengeId", token,
            {"fields": {"defaultChallengeId": {"nullValue": None}}})
    if users_with_challenges:
        print(f"  reset defaultChallengeId on {len(users_with_challenges)} users")
    api("PATCH", f"{BASE}/catalog_meta/current", token, {"fields": {
        "version": {"integerValue": str(CATALOG_VERSION)},
        "totalCount": {"integerValue": str(len(onsen_writes))},
        "activeCount": {"integerValue": str(len(onsen_writes))},
        "publishedAt": {"timestampValue": now_iso},
    }})
    print("  rewrote catalog_meta/current")
    print("\nDone.")


if __name__ == "__main__":
    main()
