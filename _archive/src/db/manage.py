"""Database management: initialization, reset, seeding, and statistics."""

import json
import os

from loguru import logger
from sqlalchemy import func, inspect

from src.db.models import Base, Onsen
from src.db.conn import get_db, get_engine
from src.paths import PATHS


def init_db(url: str) -> None:
    """Create all tables defined in the models.

    Safe to call multiple times -- only creates tables that don't exist yet.
    """
    engine = get_engine(url)
    Base.metadata.create_all(engine)

    # Verify tables were created
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    logger.info(f"Database initialized. Tables: {tables}")


def reset_db(url: str, *, confirm: bool = False) -> None:
    """Drop and recreate all tables.

    Args:
        url: Database URL.
        confirm: If False, prompts for confirmation interactively.
    """
    if not confirm:
        response = input("This will DELETE all data. Type 'yes' to confirm: ")
        if response.strip().lower() != "yes":
            logger.info("Reset cancelled.")
            return

    engine = get_engine(url)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    logger.info("Database reset complete. All tables recreated.")


def seed_from_json(url: str) -> None:
    """Populate the onsens table from onsens.json (map seed data).

    This inserts basic data (id, onsen_area_name, facility_name, address,
    latitude, longitude) for all onsens. Existing rows are updated with
    the seed data (upsert behavior).
    """
    json_path = PATHS.ONSENS_JSON

    if not os.path.exists(json_path):
        logger.error(f"Seed file not found: {json_path}")
        raise FileNotFoundError(f"Seed file not found: {json_path}")

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    logger.info(f"Loading {len(data)} onsens from {json_path}")

    inserted = 0
    updated = 0

    with get_db(url=url) as db:
        for entry in data:
            onsen_id = int(entry["id"])
            existing = db.query(Onsen).filter(Onsen.id == onsen_id).first()

            if existing:
                # Update seed fields only (don't overwrite scraped data)
                existing.onsen_area_name = entry["onsenchi"]
                existing.facility_name = entry["shisetsu"]
                existing.address = entry["address"]
                existing.latitude = entry["lat"]
                existing.longitude = entry["lng"]
                updated += 1
            else:
                onsen = Onsen(
                    id=onsen_id,
                    onsen_area_name=entry["onsenchi"],
                    facility_name=entry["shisetsu"],
                    address=entry["address"],
                    latitude=entry["lat"],
                    longitude=entry["lng"],
                )
                db.add(onsen)
                inserted += 1

        db.commit()

    logger.info(f"Seed complete: {inserted} inserted, {updated} updated")


def get_stats(url: str) -> dict[str, int]:
    """Get database statistics and print them.

    Returns:
        Dictionary with stat name -> count.
    """
    with get_db(url=url) as db:
        total = db.query(func.count(Onsen.id)).scalar() or 0
        scraped = (
            db.query(func.count(Onsen.id)).filter(Onsen.scraped_at.isnot(None)).scalar()
            or 0
        )
        unscraped = total - scraped

        # Count by prefecture
        prefectures = (
            db.query(Onsen.prefecture, func.count(Onsen.id))
            .filter(Onsen.prefecture.isnot(None))
            .group_by(Onsen.prefecture)
            .all()
        )

    stats = {
        "total_onsens": total,
        "scraped": scraped,
        "unscraped": unscraped,
    }

    print(f"\n  Database Statistics")
    print(f"  {'─' * 35}")
    print(f"  Total onsens:   {total}")
    print(f"  Scraped:        {scraped}")
    print(f"  Not yet scraped: {unscraped}")

    if prefectures:
        print(f"\n  By Prefecture:")
        for pref, count in sorted(prefectures, key=lambda x: x[1], reverse=True):
            print(f"    {pref}: {count}")
            stats[f"prefecture_{pref}"] = count

    print()
    return stats
