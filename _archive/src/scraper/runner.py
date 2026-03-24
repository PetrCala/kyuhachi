"""Scraper orchestration: load IDs, scrape pages, update DB, save artifacts."""

import json
import os
from datetime import datetime, timezone

from loguru import logger

from src.db.conn import get_db
from src.db.models import Onsen
from src.paths import PATHS
from src.scraper.fetcher import fetch_detail_page, get_detail_url, FetchError
from src.scraper.parser import parse_detail_page


def scrape_all(url: str, *, force: bool = False) -> None:
    """Scrape all onsen detail pages and update the database.

    Args:
        url: Database URL.
        force: If True, re-scrape all onsens regardless of scraped_at status.
    """
    with get_db(url=url) as db:
        if force:
            onsens = db.query(Onsen).order_by(Onsen.id).all()
        else:
            onsens = (
                db.query(Onsen)
                .filter(Onsen.scraped_at.is_(None))
                .order_by(Onsen.id)
                .all()
            )

        total_in_db = db.query(Onsen).count()

    if not onsens:
        logger.info("No onsens to scrape. All up to date.")
        return

    total = len(onsens)
    mode = "force re-scrape" if force else "incremental"
    logger.info(
        f"Starting {mode} scrape: {total} onsens to process "
        f"(out of {total_in_db} total in DB)"
    )

    # Load existing artifact data for incremental backup
    artifact_data = _load_artifact_data()

    succeeded = 0
    failed = 0

    for i, onsen in enumerate(onsens, start=1):
        display = onsen.display_name
        logger.info(f"[{i}/{total}] Scraping id={onsen.id} ({display})...")

        try:
            html = fetch_detail_page(onsen.id)
            fields = parse_detail_page(html, onsen.id)

            # Update the database row
            _update_onsen(url, onsen.id, fields, html)

            # Save to artifact file incrementally
            artifact_data[str(onsen.id)] = {
                "onsen_id": onsen.id,
                "display_name": display,
                "url": get_detail_url(onsen.id),
                "extracted_fields": fields,
                "scraped_at": datetime.now(timezone.utc).isoformat(),
            }
            _save_artifact_data(artifact_data)

            succeeded += 1
            logger.info(
                f"[{i}/{total}] Done: {display} "
                f"({sum(1 for v in fields.values() if v is not None)} fields extracted)"
            )

        except FetchError as e:
            failed += 1
            logger.error(f"[{i}/{total}] FAILED: {display} -- {e}")
        except Exception as e:
            failed += 1
            logger.error(f"[{i}/{total}] UNEXPECTED ERROR for {display}: {e}")

    logger.info(
        f"\nScraping complete: {succeeded} succeeded, {failed} failed "
        f"(out of {total} attempted)"
    )


def _update_onsen(
    url: str,
    onsen_id: int,
    fields: dict[str, str | None],
    raw_html: str,
) -> None:
    """Update a single onsen row in the database with scraped data."""
    now = datetime.now(timezone.utc)

    with get_db(url=url) as db:
        onsen = db.query(Onsen).filter(Onsen.id == onsen_id).first()
        if onsen is None:
            logger.warning(f"Onsen {onsen_id} not found in DB, skipping update")
            return

        # Update all scraped fields
        onsen.prefecture = fields.get("prefecture")
        onsen.phone = fields.get("phone")
        onsen.business_hours = fields.get("business_hours")
        onsen.admission_fee = fields.get("admission_fee")
        onsen.spring_quality = fields.get("spring_quality")
        onsen.senjin_benefits = fields.get("senjin_benefits")
        onsen.access_info = fields.get("access_info")
        onsen.efficacy = fields.get("efficacy")
        onsen.website_url = fields.get("website_url")
        onsen.recommendation = fields.get("recommendation")
        onsen.covid_measures = fields.get("covid_measures")
        onsen.image_url = fields.get("image_url")
        onsen.detail_page_url = get_detail_url(onsen_id)
        onsen.raw_html = raw_html
        onsen.scraped_at = now

        # Update address from scraper if available (may be more detailed)
        scraped_address = fields.get("address")
        if scraped_address:
            onsen.address = scraped_address

        db.commit()


def _load_artifact_data() -> dict[str, dict[str, object]]:
    """Load existing artifact data from disk, or return empty dict."""
    path = PATHS.SCRAPED_DATA_FILE
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Could not load artifact file: {e}")
    return {}


def _save_artifact_data(data: dict[str, dict[str, object]]) -> None:
    """Save artifact data to disk (incremental backup)."""
    path = PATHS.SCRAPED_DATA_FILE
    os.makedirs(os.path.dirname(path), exist_ok=True)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)
