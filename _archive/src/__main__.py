"""CLI entry point for the Kyushu Onsen project.

Usage:
    poetry run kyushu db init          # Create database and tables
    poetry run kyushu db reset         # Drop and recreate all tables
    poetry run kyushu db seed          # Seed from onsens.json
    poetry run kyushu db stats         # Show database statistics
    poetry run kyushu scrape           # Scrape all un-scraped onsens
    poetry run kyushu scrape --force   # Re-scrape all onsens
"""

import argparse
import os
import sys

from loguru import logger

from src.config import get_database_config
from src.paths import PATHS


def _setup_logging(verbose: bool = False) -> None:
    """Configure loguru logging."""
    logger.remove()  # Remove default handler
    level = "DEBUG" if verbose else "INFO"
    logger.add(
        sys.stderr,
        level=level,
        format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | {message}",
    )


def _ensure_dirs() -> None:
    """Ensure required directories exist."""
    os.makedirs(PATHS.DB_DIR, exist_ok=True)
    os.makedirs(PATHS.ARTIFACTS_SCRAPING_DIR, exist_ok=True)


def cmd_db_init(args: argparse.Namespace) -> None:
    """Handle: kyushu db init"""
    from src.db.manage import init_db

    config = get_database_config(
        env_override=getattr(args, "env", None),
        path_override=getattr(args, "database", None),
    )
    logger.info(f"Initializing database ({config.get_display_name()})...")
    init_db(config.url)


def cmd_db_reset(args: argparse.Namespace) -> None:
    """Handle: kyushu db reset"""
    from src.db.manage import reset_db

    config = get_database_config(
        env_override=getattr(args, "env", None),
        path_override=getattr(args, "database", None),
    )
    logger.warning(f"Resetting database ({config.get_display_name()})...")
    reset_db(config.url, confirm=getattr(args, "yes", False))


def cmd_db_seed(args: argparse.Namespace) -> None:
    """Handle: kyushu db seed"""
    from src.db.manage import init_db, seed_from_json

    config = get_database_config(
        env_override=getattr(args, "env", None),
        path_override=getattr(args, "database", None),
    )
    # Ensure tables exist before seeding
    init_db(config.url)
    logger.info(f"Seeding database ({config.get_display_name()}) from onsens.json...")
    seed_from_json(config.url)


def cmd_db_stats(args: argparse.Namespace) -> None:
    """Handle: kyushu db stats"""
    from src.db.manage import get_stats

    config = get_database_config(
        env_override=getattr(args, "env", None),
        path_override=getattr(args, "database", None),
    )
    get_stats(config.url)


def cmd_scrape(args: argparse.Namespace) -> None:
    """Handle: kyushu scrape"""
    from src.scraper.runner import scrape_all

    config = get_database_config(
        env_override=getattr(args, "env", None),
        path_override=getattr(args, "database", None),
    )
    force = getattr(args, "force", False)
    logger.info(
        f"Starting scraper ({config.get_display_name()}, "
        f"{'force' if force else 'incremental'} mode)..."
    )
    scrape_all(config.url, force=force)


def build_parser() -> argparse.ArgumentParser:
    """Build the CLI argument parser."""
    parser = argparse.ArgumentParser(
        prog="kyushu",
        description="九州八十八湯めぐり -- Kyushu Onsen Scraper & Database",
    )
    parser.add_argument(
        "--env",
        choices=["dev", "prod"],
        help="Database environment (default: dev)",
    )
    parser.add_argument(
        "--database",
        help="Explicit path to SQLite database file",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable verbose (DEBUG) logging",
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # --- db subcommand group ---
    db_parser = subparsers.add_parser("db", help="Database management")
    db_sub = db_parser.add_subparsers(dest="db_command", help="Database commands")

    db_sub.add_parser("init", help="Create database tables")

    reset_parser = db_sub.add_parser("reset", help="Drop and recreate all tables")
    reset_parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="Skip confirmation prompt",
    )

    db_sub.add_parser("seed", help="Seed database from onsens.json")
    db_sub.add_parser("stats", help="Show database statistics")

    # --- scrape command ---
    scrape_parser = subparsers.add_parser("scrape", help="Scrape onsen detail pages")
    scrape_parser.add_argument(
        "--force",
        action="store_true",
        help="Re-scrape all onsens, even already-scraped ones",
    )

    # --- trail subcommand group ---
    from src.trail.cli import add_trail_subparser

    add_trail_subparser(subparsers)

    return parser


def main() -> None:
    """Main CLI entry point."""
    parser = build_parser()
    args = parser.parse_args()

    _setup_logging(verbose=getattr(args, "verbose", False))
    _ensure_dirs()

    if args.command == "db":
        if args.db_command == "init":
            cmd_db_init(args)
        elif args.db_command == "reset":
            cmd_db_reset(args)
        elif args.db_command == "seed":
            cmd_db_seed(args)
        elif args.db_command == "stats":
            cmd_db_stats(args)
        else:
            parser.parse_args(["db", "--help"])
    elif args.command == "scrape":
        cmd_scrape(args)
    elif args.command == "trail":
        from src.trail.cli import (
            cmd_trail_optimize,
            cmd_trail_plan,
            cmd_trail_info,
        )

        if args.trail_command == "optimize":
            cmd_trail_optimize(args)
        elif args.trail_command == "plan":
            cmd_trail_plan(args)
        elif args.trail_command == "info":
            cmd_trail_info(args)
        else:
            parser.parse_args(["trail", "--help"])
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
