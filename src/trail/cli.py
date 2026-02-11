"""CLI commands for trail optimization."""

from __future__ import annotations

import argparse
from datetime import date

from loguru import logger


def _build_trail_config(args: argparse.Namespace):
    """Build a TrailConfig from CLI arguments."""
    from src.trail.config import TrailConfig

    kwargs = {}
    if getattr(args, "target", None) is not None:
        kwargs["target_onsen_count"] = args.target
    if getattr(args, "time_limit", None) is not None:
        kwargs["solver_time_limit_seconds"] = args.time_limit
    if getattr(args, "start_date", None) is not None:
        kwargs["start_date"] = date.fromisoformat(args.start_date)
    if getattr(args, "end_date", None) is not None:
        kwargs["end_date"] = date.fromisoformat(args.end_date)
    if getattr(args, "output", None) is not None:
        kwargs["output_dir"] = args.output
    if getattr(args, "no_osrm", False):
        kwargs["use_osrm"] = False
    if getattr(args, "refresh_distances", False):
        kwargs["refresh_distances"] = True

    return TrailConfig(**kwargs)


def cmd_trail_optimize(args: argparse.Namespace) -> None:
    """Handle: kyushu trail optimize"""
    from src.config import get_database_config
    from src.trail.data_prep import load_onsens, get_eligible, print_summary
    from src.trail.optimizer import run_optimization

    db_config = get_database_config(
        env_override=getattr(args, "env", None),
        path_override=getattr(args, "database", None),
    )
    trail_config = _build_trail_config(args)

    nodes = load_onsens(db_config.url, config=trail_config)
    print_summary(nodes)

    eligible = get_eligible(nodes)
    ordered, total_dist = run_optimization(eligible, config=trail_config)

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
    from src.trail.output import save_outputs
    from src.trail.map_generator import generate_map
    import os

    db_config = get_database_config(
        env_override=getattr(args, "env", None),
        path_override=getattr(args, "database", None),
    )
    trail_config = _build_trail_config(args)

    # Step 1: Load data
    nodes = load_onsens(db_config.url, config=trail_config)
    print_summary(nodes)
    eligible = get_eligible(nodes)

    # Step 2: Optimize route
    ordered, total_dist = run_optimization(eligible, config=trail_config)

    # Step 3: Schedule
    trail = schedule_trail(ordered, config=trail_config)

    # Populate skipped/excluded info
    visited_ids = {o.id for o in ordered}
    trail.skipped_onsens = [n for n in eligible if n.id not in visited_ids]
    trail.excluded_onsens = [n for n in nodes if n.is_excluded]

    # Step 3b: Fetch route geometries for map
    if trail_config.use_osrm:
        from src.trail.routing import fetch_route_geometries

        all_segments = [seg for day in trail.days for seg in day.segments]
        fetch_route_geometries(
            all_segments,
            cache_path=trail_config.osrm_geometry_cache_path,
            refresh=trail_config.refresh_distances,
        )

    # Step 4: Generate outputs
    output_dir = trail_config.output_dir
    paths = save_outputs(trail, output_dir, all_nodes=nodes, config=trail_config)

    # Step 5: Generate map
    map_path = os.path.join(output_dir, "trail_map.html")
    generate_map(
        trail,
        all_nodes=nodes,
        output_path=map_path,
        clock_markers=getattr(args, "clock_markers", False),
    )
    paths["map"] = map_path

    # Print summary
    walking_days = sum(1 for d in trail.days if d.walking_km > 0)
    rest_days = trail_config.total_days_available - trail.total_days

    print(f"\n{'='*60}")
    print(f"Trail Plan Complete!")
    print(f"{'='*60}")
    print(
        f"Onsens:      {trail.total_onsens} ({trail_config.buffer_count} buffer above 88)"
    )
    print(f"Distance:    {trail.total_distance_km:.1f} km")
    print(f"Days used:   {trail.total_days} ({walking_days} walking)")
    print(f"Rest days:   {rest_days}")
    print(f"Prefectures: {len(trail.prefectures_visited)}")
    print(
        f"Routing:     {'OSRM walking' if trail_config.use_osrm else 'haversine estimate'}"
    )
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


def _add_common_args(parser: argparse.ArgumentParser) -> None:
    """Add arguments shared by optimize and plan subcommands."""
    parser.add_argument(
        "--target", type=int, default=100, help="Target number of onsens (default: 100)"
    )
    parser.add_argument(
        "--time-limit",
        type=int,
        default=60,
        help="Solver time limit in seconds (default: 60)",
    )
    parser.add_argument(
        "--no-osrm", action="store_true", help="Use haversine distances instead of OSRM"
    )
    parser.add_argument(
        "--refresh-distances", action="store_true", help="Force re-fetch OSRM distances"
    )


def add_trail_subparser(subparsers: argparse._SubParsersAction) -> None:
    """Add the 'trail' subcommand group to the CLI parser."""
    trail_parser = subparsers.add_parser("trail", help="Trail optimization")
    trail_sub = trail_parser.add_subparsers(dest="trail_command", help="Trail commands")

    # trail optimize
    opt_parser = trail_sub.add_parser("optimize", help="Optimize walking route")
    _add_common_args(opt_parser)

    # trail plan (full pipeline)
    plan_parser = trail_sub.add_parser(
        "plan", help="Full pipeline: optimize + schedule + output"
    )
    _add_common_args(plan_parser)
    plan_parser.add_argument(
        "--start-date",
        default="2026-09-30",
        help="Start date (YYYY-MM-DD, default: 2026-09-30)",
    )
    plan_parser.add_argument(
        "--end-date",
        default="2026-12-03",
        help="End date (YYYY-MM-DD, default: 2026-12-03)",
    )
    plan_parser.add_argument(
        "--output", default=None,
        help="Output directory (default: output/)",
    )
    plan_parser.add_argument(
        "--clock-markers", action="store_true",
        help="Use 24h clock icons showing open hours",
    )

    # trail info
    trail_sub.add_parser("info", help="Show onsen data summary")
