"""CLI commands for trail optimization."""

from __future__ import annotations

import argparse
from datetime import date

from loguru import logger


def cmd_trail_optimize(args: argparse.Namespace) -> None:
    """Handle: kyushu trail optimize"""
    from src.config import get_database_config
    from src.trail.data_prep import load_onsens, get_eligible, print_summary
    from src.trail.optimizer import run_optimization

    config = get_database_config(
        env_override=getattr(args, "env", None),
        path_override=getattr(args, "database", None),
    )

    target = getattr(args, "target", 88)
    time_limit = getattr(args, "time_limit", 60)

    nodes = load_onsens(config.url)
    print_summary(nodes)

    eligible = get_eligible(nodes)
    ordered, total_dist = run_optimization(
        eligible, target_count=target, time_limit=time_limit
    )

    print(f"\nOptimized route: {len(ordered)} onsens, {total_dist:.1f} km")
    print(f"\nRoute order:")
    for i, o in enumerate(ordered, 1):
        mandatory = " [BEPPU]" if o.is_mandatory else ""
        print(f"  {i:3d}. {o.display_name} ({o.prefecture}){mandatory}")


def cmd_trail_plan(args: argparse.Namespace) -> None:
    """Handle: kyushu trail plan — full pipeline: optimize + schedule + output."""
    from src.config import get_database_config
    from src.trail.data_prep import load_onsens, get_eligible, print_summary
    from src.trail.optimizer import run_optimization
    from src.trail.scheduler import schedule_trail
    from src.trail.output import save_outputs, generate_markdown
    from src.trail.map_generator import generate_map
    from src.paths import PATHS
    import os

    config = get_database_config(
        env_override=getattr(args, "env", None),
        path_override=getattr(args, "database", None),
    )

    target = getattr(args, "target", 88)
    time_limit = getattr(args, "time_limit", 60)
    start_date_str = getattr(args, "start_date", "2026-09-30")
    end_date_str = getattr(args, "end_date", "2026-12-03")
    output_dir = getattr(args, "output", None) or os.path.join(PATHS.PROJECT_ROOT, "output")

    start_date = date.fromisoformat(start_date_str)
    end_date = date.fromisoformat(end_date_str)

    # Step 1: Load data
    nodes = load_onsens(config.url)
    print_summary(nodes)
    eligible = get_eligible(nodes)

    # Step 2: Optimize route
    ordered, total_dist = run_optimization(
        eligible, target_count=target, time_limit=time_limit
    )

    # Step 3: Schedule
    trail = schedule_trail(
        ordered, start_date=start_date, end_date=end_date,
    )

    # Populate skipped/excluded info
    visited_ids = {o.id for o in ordered}
    trail.skipped_onsens = [n for n in eligible if n.id not in visited_ids]
    trail.excluded_onsens = [n for n in nodes if n.is_excluded]

    # Step 4: Generate outputs
    paths = save_outputs(trail, output_dir, all_nodes=nodes)

    # Step 5: Generate map
    map_path = os.path.join(output_dir, "trail_map.html")
    generate_map(trail, all_nodes=nodes, output_path=map_path)
    paths["map"] = map_path

    # Print summary
    walking_days = sum(1 for d in trail.days if d.walking_km > 0)
    rest_days = (end_date - start_date).days + 1 - trail.total_days

    print(f"\n{'='*60}")
    print(f"Trail Plan Complete!")
    print(f"{'='*60}")
    print(f"Onsens:      {trail.total_onsens}")
    print(f"Distance:    {trail.total_distance_km:.1f} km")
    print(f"Days used:   {trail.total_days} ({walking_days} walking)")
    print(f"Rest days:   {rest_days}")
    print(f"Prefectures: {len(trail.prefectures_visited)}")
    print(f"")
    print(f"Output files:")
    for fmt, path in paths.items():
        print(f"  {fmt}: {path}")
    print(f"{'='*60}")


def cmd_trail_info(args: argparse.Namespace) -> None:
    """Handle: kyushu trail info — show data summary."""
    from src.config import get_database_config
    from src.trail.data_prep import load_onsens, print_summary

    config = get_database_config(
        env_override=getattr(args, "env", None),
        path_override=getattr(args, "database", None),
    )
    nodes = load_onsens(config.url)
    print_summary(nodes)


def add_trail_subparser(subparsers: argparse._SubParsersAction) -> None:
    """Add the 'trail' subcommand group to the CLI parser."""
    trail_parser = subparsers.add_parser("trail", help="Trail optimization")
    trail_sub = trail_parser.add_subparsers(dest="trail_command", help="Trail commands")

    # trail optimize
    opt_parser = trail_sub.add_parser("optimize", help="Optimize walking route")
    opt_parser.add_argument(
        "--target", type=int, default=88, help="Target number of onsens (default: 88)"
    )
    opt_parser.add_argument(
        "--time-limit", type=int, default=60, help="Solver time limit in seconds (default: 60)"
    )

    # trail plan (full pipeline)
    plan_parser = trail_sub.add_parser("plan", help="Full pipeline: optimize + schedule + output")
    plan_parser.add_argument(
        "--target", type=int, default=88, help="Target number of onsens (default: 88)"
    )
    plan_parser.add_argument(
        "--time-limit", type=int, default=60, help="Solver time limit in seconds (default: 60)"
    )
    plan_parser.add_argument(
        "--start-date", default="2026-09-30", help="Start date (YYYY-MM-DD, default: 2026-09-30)"
    )
    plan_parser.add_argument(
        "--end-date", default="2026-12-03", help="End date (YYYY-MM-DD, default: 2026-12-03)"
    )
    plan_parser.add_argument(
        "--output", default=None, help="Output directory (default: output/)"
    )

    # trail info
    trail_sub.add_parser("info", help="Show onsen data summary")
