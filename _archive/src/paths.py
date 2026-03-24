"""Centralized path constants for the project."""

import os


_APP_ROOT = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_APP_ROOT)


class PATHS:
    """All filesystem paths used by the project."""

    APP_ROOT = _APP_ROOT
    PROJECT_ROOT = _PROJECT_ROOT

    # Directories
    DATA_DIR = os.path.join(PROJECT_ROOT, "data")
    DB_DIR = os.path.join(DATA_DIR, "db")
    ARTIFACTS_DIR = os.path.join(PROJECT_ROOT, "artifacts")
    ARTIFACTS_SCRAPING_DIR = os.path.join(ARTIFACTS_DIR, "scraping")

    # Database files
    DB_PATH_DEV = os.path.join(DB_DIR, "kyushu.dev.db")
    DB_PATH_PROD = os.path.join(DB_DIR, "kyushu.prod.db")

    # Seed data
    ONSENS_JSON = os.path.join(PROJECT_ROOT, "onsens.json")

    # Scraping artifacts
    SCRAPED_DATA_FILE = os.path.join(ARTIFACTS_SCRAPING_DIR, "scraped_data.json")
