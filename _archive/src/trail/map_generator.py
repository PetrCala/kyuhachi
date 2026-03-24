"""Interactive map generation using Folium."""

from __future__ import annotations

import folium
from loguru import logger

from src.trail.models import Trail, OnsenNode


# Color palette for daily route segments
DAY_COLORS = [
    "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
    "#42d4f4", "#f032e6", "#bfef45", "#fabed4", "#469990",
    "#dcbeff", "#9A6324", "#800000", "#aaffc3", "#808000",
    "#ffd8b1", "#000075", "#a9a9a9",
]


def generate_map(
    trail: Trail,
    all_nodes: list[OnsenNode] | None = None,
    output_path: str = "output/trail_map.html",
    clock_markers: bool = False,
) -> str:
    """Generate an interactive Folium map of the trail.

    Args:
        trail: The complete trail plan.
        all_nodes: All onsen nodes (to show skipped ones too).
        output_path: Path to save the HTML file.

    Returns:
        Path to the saved HTML file.
    """
    # Center on Kyushu
    center_lat = 32.5
    center_lon = 131.0
    if trail.ordered_onsens:
        center_lat = sum(o.lat for o in trail.ordered_onsens) / len(trail.ordered_onsens)
        center_lon = sum(o.lon for o in trail.ordered_onsens) / len(trail.ordered_onsens)

    m = folium.Map(location=[center_lat, center_lon], zoom_start=8, tiles="OpenStreetMap")

    # Feature groups for layer control
    route_group = folium.FeatureGroup(name="Route", show=True)
    visited_group = folium.FeatureGroup(name="Visited Onsens", show=True)
    skipped_group = folium.FeatureGroup(name="Skipped Onsens", show=False)
    excluded_group = folium.FeatureGroup(name="Excluded Onsens", show=False)

    # Add visited onsens as markers
    visited_ids = {o.id for o in trail.ordered_onsens}
    onsen_counter = 0

    for day in trail.days:
        for i, onsen in enumerate(day.onsens_visited):
            onsen_counter += 1
            t = day.visit_times[i] if i < len(day.visit_times) else None
            time_str = t.strftime("%H:%M") if t else "—"

            popup_html = (
                f"<b>#{onsen_counter} {onsen.display_name}</b><br>"
                f"Prefecture: {onsen.prefecture}<br>"
                f"Day {day.day_number} ({day.date.strftime('%b %d')})<br>"
                f"Arrival: {time_str}<br>"
            )
            if onsen.raw_business_hours:
                hours_preview = onsen.raw_business_hours.split("\n")[0][:50]
                popup_html += f"Hours: {hours_preview}<br>"

            marker_added = False
            if clock_markers:
                from src.trail.clock_icon import make_clock_icon

                icon = make_clock_icon(
                    onsen.usage_time, variant="visited"
                )
                if icon is not None:
                    folium.Marker(
                        location=[onsen.lat, onsen.lon],
                        popup=folium.Popup(
                            popup_html, max_width=300
                        ),
                        tooltip=(
                            f"#{onsen_counter} {onsen.name}"
                        ),
                        icon=icon,
                    ).add_to(visited_group)
                    marker_added = True

            if not marker_added:
                folium.CircleMarker(
                    location=[onsen.lat, onsen.lon],
                    radius=8,
                    popup=folium.Popup(
                        popup_html, max_width=300
                    ),
                    tooltip=(
                        f"#{onsen_counter} {onsen.name}"
                    ),
                    color="green",
                    fill=True,
                    fill_color="green",
                    fill_opacity=0.7,
                ).add_to(visited_group)

    # Add route polylines (one per segment, colored by day)
    for day in trail.days:
        if not day.segments:
            continue

        color = DAY_COLORS[(day.day_number - 1) % len(DAY_COLORS)]
        for seg in day.segments:
            if seg.geometry:
                # Real walking route from OSRM
                coords = seg.geometry
            else:
                # Straight line fallback
                coords = [[seg.from_lat, seg.from_lon], [seg.to_lat, seg.to_lon]]

            folium.PolyLine(
                coords,
                color=color,
                weight=3,
                opacity=0.8,
                tooltip=f"Day {day.day_number}: {seg.distance_km:.1f}km",
            ).add_to(route_group)

    # Add skipped/excluded onsens if all_nodes provided
    if all_nodes:
        excluded_ids = {o.id for o in (trail.excluded_onsens or [])}
        for node in all_nodes:
            if node.id in visited_ids:
                continue
            if node.is_excluded:
                folium.CircleMarker(
                    location=[node.lat, node.lon],
                    radius=5,
                    popup=f"<b>{node.display_name}</b><br>EXCLUDED: {node.exclude_reason}",
                    tooltip=f"Excluded: {node.name}",
                    color="red",
                    fill=True,
                    fill_color="red",
                    fill_opacity=0.5,
                ).add_to(excluded_group)
            else:
                skipped_popup = (
                    f"<b>{node.display_name}</b><br>"
                    f"{node.prefecture}<br>Not visited"
                )
                skip_added = False
                if clock_markers:
                    from src.trail.clock_icon import (
                        make_clock_icon,
                    )

                    icon = make_clock_icon(
                        node.usage_time, variant="skipped"
                    )
                    if icon is not None:
                        folium.Marker(
                            location=[node.lat, node.lon],
                            popup=skipped_popup,
                            tooltip=(
                                f"Skipped: {node.name}"
                            ),
                            icon=icon,
                        ).add_to(skipped_group)
                        skip_added = True

                if not skip_added:
                    folium.CircleMarker(
                        location=[node.lat, node.lon],
                        radius=5,
                        popup=skipped_popup,
                        tooltip=(
                            f"Skipped: {node.name}"
                        ),
                        color="gray",
                        fill=True,
                        fill_color="gray",
                        fill_opacity=0.4,
                    ).add_to(skipped_group)

    # Start and end markers
    if trail.ordered_onsens:
        start = trail.ordered_onsens[0]
        end = trail.ordered_onsens[-1]

        folium.Marker(
            location=[start.lat, start.lon],
            popup=f"<b>START: {start.display_name}</b>",
            tooltip="START",
            icon=folium.Icon(color="blue", icon="play", prefix="fa"),
        ).add_to(m)

        folium.Marker(
            location=[end.lat, end.lon],
            popup=f"<b>FINISH: {end.display_name}</b>",
            tooltip="FINISH",
            icon=folium.Icon(color="red", icon="flag-checkered", prefix="fa"),
        ).add_to(m)

    # Add all feature groups
    route_group.add_to(m)
    visited_group.add_to(m)
    skipped_group.add_to(m)
    excluded_group.add_to(m)

    # Layer control
    folium.LayerControl().add_to(m)

    # Save
    import os
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    m.save(output_path)
    logger.info(f"Saved interactive map to {output_path}")

    return output_path
