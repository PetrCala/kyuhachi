"""Output generation for the trail plan.

Generates markdown itinerary, JSON, and CSV formats.
"""

from __future__ import annotations

import csv
import json
import io
from collections import Counter

from loguru import logger

from src.trail.config import TrailConfig
from src.trail.models import Trail, OnsenNode


def generate_markdown(
    trail: Trail,
    all_nodes: list[OnsenNode] | None = None,
    config: TrailConfig | None = None,
) -> str:
    """Generate a complete markdown itinerary."""
    lines: list[str] = []

    # Header
    lines.append("# Kyushu 88 Onsen Walking Trail")
    lines.append("")
    if trail.days:
        start = trail.days[0].date
        end = trail.days[-1].date
        lines.append(f"**{start.strftime('%B %d, %Y')} — {end.strftime('%B %d, %Y')}**")
    lines.append("")

    # Summary
    walking_days = sum(1 for d in trail.days if d.walking_km > 0)
    transit_days = sum(
        1 for d in trail.days if d.walking_km > 0 and not d.onsens_visited
    )
    onsen_days = sum(1 for d in trail.days if d.onsens_visited)
    if config:
        rest_days = config.total_days_available - trail.total_days
    else:
        rest_days = 65 - trail.total_days
    warning_count = sum(len(d.warnings) for d in trail.days)

    pref_counts = Counter(o.prefecture for o in trail.ordered_onsens if o.prefecture)

    lines.append("## Summary")
    lines.append("")
    lines.append(f"| Metric | Value |")
    lines.append(f"|--------|-------|")
    lines.append(f"| Total distance | **{trail.total_distance_km:.1f} km** |")
    lines.append(f"| Onsens visited | **{trail.total_onsens}** |")
    lines.append(
        f"| Walking days | {walking_days} ({onsen_days} with onsens, {transit_days} transit) |"
    )
    lines.append(f"| Rest days available | {rest_days} |")
    avg_km = trail.total_distance_km / max(1, walking_days)
    lines.append(f"| Average km/walking day | {avg_km:.1f} km |")
    max_km = max((d.walking_km for d in trail.days), default=0)
    lines.append(f"| Longest day | {max_km:.1f} km |")
    lines.append(
        f"| Prefectures | {len(pref_counts)} ({', '.join(f'{p} ({c})' for p, c in pref_counts.most_common())}) |"
    )
    lines.append(f"| Schedule warnings | {warning_count} |")
    lines.append(f"| Start | {trail.start_name} |")
    lines.append(f"| End | {trail.end_name} |")
    lines.append("")

    # Day-by-day itinerary
    lines.append("## Day-by-Day Itinerary")
    lines.append("")

    onsen_counter = 0
    for day in trail.days:
        weekday = day.date.strftime("%A")
        lines.append(
            f"### Day {day.day_number} — {day.date.strftime('%b %d')} ({weekday})"
        )
        lines.append("")
        lines.append(
            f"**Distance:** {day.walking_km:.1f} km | **Onsens:** {len(day.onsens_visited)}"
        )

        if day.onsens_visited:
            lines.append("")
            lines.append(f"| # | Time | Onsen | Prefecture | Distance |")
            lines.append(f"|---|------|-------|------------|----------|")
            for i, onsen in enumerate(day.onsens_visited):
                onsen_counter += 1
                t = day.visit_times[i]
                time_str = t.strftime("%H:%M") if t else "—"
                dist_str = (
                    f"{day.segments[i].distance_km:.1f} km"
                    if i < len(day.segments)
                    else "—"
                )
                lines.append(
                    f"| {onsen_counter} | {time_str} | {onsen.display_name} | {onsen.prefecture} | {dist_str} |"
                )
        elif day.segments:
            # Transit day
            lines.append("")
            lines.append(f"*Transit day — walking toward next onsen cluster*")
        else:
            lines.append("")
            lines.append(f"*Rest day*")

        if day.warnings:
            lines.append("")
            for w in day.warnings:
                lines.append(f"- :warning: {w}")

        lines.append(f"")
        lines.append(f"**Overnight:** {day.overnight_type} ({day.overnight_name})")
        lines.append("")
        lines.append("---")
        lines.append("")

    # Skipped onsens
    if trail.skipped_onsens:
        lines.append("## Skipped Onsens")
        lines.append("")
        for o in trail.skipped_onsens:
            lines.append(f"- {o.display_name} ({o.prefecture})")
        lines.append("")

    # Excluded onsens
    if trail.excluded_onsens:
        lines.append("## Excluded Onsens")
        lines.append("")
        for o in trail.excluded_onsens:
            lines.append(f"- {o.display_name}: {o.exclude_reason}")
        lines.append("")

    return "\n".join(lines)


def generate_json(trail: Trail) -> str:
    """Generate JSON representation of the trail."""
    data = {
        "trail": {
            "total_km": round(trail.total_distance_km, 1),
            "total_onsens": trail.total_onsens,
            "total_days": trail.total_days,
            "start": trail.start_name,
            "end": trail.end_name,
            "prefectures": list(trail.prefectures_visited),
        },
        "daily_plans": [],
    }

    onsen_counter = 0
    for day in trail.days:
        day_data = {
            "day": day.day_number,
            "date": day.date.isoformat(),
            "weekday": day.date.strftime("%A"),
            "walking_km": round(day.walking_km, 1),
            "onsens_count": len(day.onsens_visited),
            "overnight_type": day.overnight_type,
            "overnight_name": day.overnight_name,
            "warnings": day.warnings,
            "onsens": [],
        }
        for i, onsen in enumerate(day.onsens_visited):
            onsen_counter += 1
            t = day.visit_times[i]
            day_data["onsens"].append(
                {
                    "number": onsen_counter,
                    "id": onsen.id,
                    "name": onsen.display_name,
                    "prefecture": onsen.prefecture,
                    "lat": onsen.lat,
                    "lon": onsen.lon,
                    "visit_time": t.strftime("%H:%M") if t else None,
                    "distance_km": (
                        round(day.segments[i].distance_km, 1)
                        if i < len(day.segments)
                        else None
                    ),
                }
            )
        data["daily_plans"].append(day_data)

    return json.dumps(data, ensure_ascii=False, indent=2)


def generate_csv(trail: Trail) -> str:
    """Generate CSV summary of the trail."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "day",
            "date",
            "weekday",
            "km",
            "onsens_count",
            "onsen_names",
            "overnight_type",
            "warnings_count",
        ]
    )

    for day in trail.days:
        names = "|".join(o.name for o in day.onsens_visited)
        writer.writerow(
            [
                day.day_number,
                day.date.isoformat(),
                day.date.strftime("%A"),
                f"{day.walking_km:.1f}",
                len(day.onsens_visited),
                names or "Transit",
                day.overnight_type,
                len(day.warnings),
            ]
        )

    return output.getvalue()


def save_outputs(
    trail: Trail,
    output_dir: str,
    all_nodes: list[OnsenNode] | None = None,
    config: TrailConfig | None = None,
) -> dict[str, str]:
    """Save all output formats to disk.

    Returns dict of {format: filepath}.
    """
    import os

    os.makedirs(output_dir, exist_ok=True)

    paths = {}

    md_path = os.path.join(output_dir, "trail_itinerary.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(generate_markdown(trail, all_nodes, config=config))
    paths["markdown"] = md_path
    logger.info(f"Saved markdown itinerary to {md_path}")

    json_path = os.path.join(output_dir, "trail_data.json")
    with open(json_path, "w", encoding="utf-8") as f:
        f.write(generate_json(trail))
    paths["json"] = json_path
    logger.info(f"Saved JSON data to {json_path}")

    csv_path = os.path.join(output_dir, "trail_summary.csv")
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write(generate_csv(trail))
    paths["csv"] = csv_path
    logger.info(f"Saved CSV summary to {csv_path}")

    return paths
