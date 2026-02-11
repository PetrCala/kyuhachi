"""SVG clock icon generator for onsen map markers.

Generates small 24h clock SVGs where open-hours windows appear as
filled arc wedges.  Midnight is at the top (12-o'clock position),
hours proceed clockwise: 06:00→3-o'clock, 12:00→6-o'clock, 18:00→9-o'clock.
"""

from __future__ import annotations

import math
from datetime import time
from typing import Optional

from src.trail.parsers.usage_time import TimeWindow, UsageTimeParsed

# Clock dimensions (px)
CLOCK_SIZE = 22
_CX = CLOCK_SIZE / 2
_CY = CLOCK_SIZE / 2
_R = CLOCK_SIZE / 2 - 1  # 1px inset for border stroke
_MINUTES_PER_DAY = 1440

# Color presets
VISITED_COLORS = {
    "arc": "#2d8a4e",
    "border": "#1a6b35",
    "face": "#e8f5e9",
    "tick": "#999999",
}

SKIPPED_COLORS = {
    "arc": "#888888",
    "border": "#666666",
    "face": "#f0f0f0",
    "tick": "#999999",
}


def _time_to_angle(t: time) -> float:
    """Convert a time to degrees on 24h clock (0°=midnight/top, clockwise)."""
    minutes = t.hour * 60 + t.minute
    return (minutes / _MINUTES_PER_DAY) * 360.0


def _arc_path(start_deg: float, end_deg: float) -> str:
    """Generate SVG path for a filled arc wedge from center."""
    sweep = (end_deg - start_deg) % 360
    if sweep == 0:
        sweep = 360  # full circle

    if sweep >= 359.99:
        # Full circle — two semicircle arcs to avoid SVG degenerate case
        return (
            f"M {_CX},{_CY - _R} "
            f"A {_R},{_R} 0 1 1 {_CX},{_CY + _R} "
            f"A {_R},{_R} 0 1 1 {_CX},{_CY - _R} Z"
        )

    large_arc = 1 if sweep > 180 else 0

    start_rad = math.radians(start_deg)
    end_rad = math.radians(start_deg + sweep)

    sx = _CX + _R * math.sin(start_rad)
    sy = _CY - _R * math.cos(start_rad)
    ex = _CX + _R * math.sin(end_rad)
    ey = _CY - _R * math.cos(end_rad)

    return (
        f"M {_CX:.1f},{_CY:.1f} "
        f"L {sx:.1f},{sy:.1f} "
        f"A {_R:.1f},{_R:.1f} 0 {large_arc} 1 {ex:.1f},{ey:.1f} "
        f"Z"
    )


def _tick_marks(color: str) -> str:
    """Generate SVG lines for 0h/6h/12h/18h tick marks."""
    tick_len = 2
    lines = []
    for hour in (0, 6, 12, 18):
        angle_rad = math.radians((hour / 24) * 360)
        ox = _CX + _R * math.sin(angle_rad)
        oy = _CY - _R * math.cos(angle_rad)
        ix = _CX + (_R - tick_len) * math.sin(angle_rad)
        iy = _CY - (_R - tick_len) * math.cos(angle_rad)
        lines.append(
            f'<line x1="{ix:.1f}" y1="{iy:.1f}" '
            f'x2="{ox:.1f}" y2="{oy:.1f}" '
            f'stroke="{color}" stroke-width="1"/>'
        )
    return "\n".join(lines)


def _window_to_arc_angles(window: TimeWindow) -> list[tuple[float, float]]:
    """Convert a TimeWindow to (start_deg, end_deg) angle pairs.

    For windows wrapping past midnight (end_next_day), the arc sweeps
    clockwise past 0° which is geometrically correct on the circular dial.
    """
    start_deg = _time_to_angle(window.start_time)

    if window.end_time is None:
        # Unknown end — show a 2-hour hint wedge (30°)
        return [(start_deg, start_deg + 30.0)]

    end_deg = _time_to_angle(window.end_time)
    # end_next_day or end <= start: arc sweeps past midnight.
    # _arc_path handles this via (end - start) % 360.
    return [(start_deg, end_deg)]


def generate_clock_svg(
    usage_time: Optional[UsageTimeParsed],
    variant: str = "visited",
) -> Optional[str]:
    """Generate an SVG clock icon for an onsen's business hours.

    Returns None if the onsen has no parseable time windows
    (caller should fall back to a plain CircleMarker).
    """
    if usage_time is None:
        return None
    if usage_time.is_closed or usage_time.unknown_or_non_time:
        return None
    if not usage_time.windows:
        return None

    colors = VISITED_COLORS if variant == "visited" else SKIPPED_COLORS

    # Collect arc angles from all windows (ignoring day-of-week scoping
    # for the static map — shows the general hours pattern)
    all_arcs: list[tuple[float, float]] = []
    for window in usage_time.windows:
        all_arcs.extend(_window_to_arc_angles(window))

    if not all_arcs:
        return None

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{CLOCK_SIZE}" height="{CLOCK_SIZE}" '
        f'viewBox="0 0 {CLOCK_SIZE} {CLOCK_SIZE}">',
        # Face background
        f'<circle cx="{_CX}" cy="{_CY}" r="{_R}" '
        f'fill="{colors["face"]}" stroke="{colors["border"]}" stroke-width="1"/>',
    ]

    # Arc wedges
    for start_deg, end_deg in all_arcs:
        path_d = _arc_path(start_deg, end_deg)
        parts.append(f'<path d="{path_d}" fill="{colors["arc"]}" opacity="0.8"/>')

    # Tick marks
    parts.append(_tick_marks(colors["tick"]))

    # Center dot
    parts.append(f'<circle cx="{_CX}" cy="{_CY}" r="1" fill="{colors["border"]}"/>')

    parts.append("</svg>")
    return "".join(parts)


def make_clock_icon(
    usage_time: Optional[UsageTimeParsed],
    variant: str = "visited",
) -> Optional["folium.DivIcon"]:
    """Create a folium DivIcon with the clock SVG, or None for fallback."""
    import folium

    svg = generate_clock_svg(usage_time, variant=variant)
    if svg is None:
        return None

    half = CLOCK_SIZE // 2
    return folium.DivIcon(
        html=svg,
        icon_size=(CLOCK_SIZE, CLOCK_SIZE),
        icon_anchor=(half, half),
        class_name="clock-marker",
    )
