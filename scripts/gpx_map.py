"""Plot a GPX route onto an interactive Folium map with all onsen points."""

from __future__ import annotations

import xml.etree.ElementTree as ET

import folium

from src.trail.data_prep import load_onsens


GPX_NS = "{http://www.topografix.com/GPX/1/1}"


def parse_gpx(path: str) -> list[tuple[float, float]]:
    """Parse a GPX file and return track points as [(lat, lon), ...]."""
    tree = ET.parse(path)
    root = tree.getroot()
    points: list[tuple[float, float]] = []
    for trkpt in root.iter(f"{GPX_NS}trkpt"):
        lat = float(trkpt.attrib["lat"])
        lon = float(trkpt.attrib["lon"])
        points.append((lat, lon))
    return points


def generate_gpx_map(
    gpx_path: str = "local/route/Kyuhachi-3.gpx",
    output_path: str = "output/gpx_map.html",
) -> str:
    # Parse GPX track
    track_points = parse_gpx(gpx_path)
    print(f"Loaded {len(track_points)} track points from GPX")

    # Load all onsens from DB
    all_nodes = load_onsens()
    print(f"Loaded {len(all_nodes)} onsens from database")

    # Center map on the track midpoint
    mid = len(track_points) // 2
    center_lat, center_lon = track_points[mid]

    m = folium.Map(location=[center_lat, center_lon], zoom_start=9, tiles="OpenStreetMap")

    # Feature groups for layer control
    route_group = folium.FeatureGroup(name="GPX Route", show=True)
    onsen_group = folium.FeatureGroup(name="Onsens", show=True)
    excluded_group = folium.FeatureGroup(name="Excluded Onsens", show=False)

    # Plot the GPX route
    folium.PolyLine(
        track_points,
        color="#4363d8",
        weight=3,
        opacity=0.85,
        tooltip="Kyuhachi Route",
    ).add_to(route_group)

    # Start/end markers
    start = track_points[0]
    end = track_points[-1]
    folium.Marker(
        location=start,
        popup="<b>START</b>",
        tooltip="START",
        icon=folium.Icon(color="blue", icon="play", prefix="fa"),
    ).add_to(route_group)
    folium.Marker(
        location=end,
        popup="<b>FINISH</b>",
        tooltip="FINISH",
        icon=folium.Icon(color="red", icon="flag-checkered", prefix="fa"),
    ).add_to(route_group)

    # Plot all onsens
    for node in all_nodes:
        popup_html = (
            f"<b>{node.display_name}</b><br>"
            f"ID: {node.id}<br>"
            f"Prefecture: {node.prefecture}<br>"
            f"Address: {node.address}<br>"
        )
        if node.raw_business_hours:
            hours_preview = node.raw_business_hours.split("\n")[0][:80]
            popup_html += f"Hours: {hours_preview}<br>"
        if node.is_mandatory:
            popup_html += "<b>Mandatory (Beppu)</b><br>"

        if node.is_excluded:
            popup_html += f"<b>Excluded: {node.exclude_reason}</b><br>"
            folium.CircleMarker(
                location=[node.lat, node.lon],
                radius=5,
                popup=folium.Popup(popup_html, max_width=300),
                tooltip=f"Excluded: {node.display_name}",
                color="red",
                fill=True,
                fill_color="red",
                fill_opacity=0.5,
            ).add_to(excluded_group)
        else:
            color = "orange" if node.is_mandatory else "green"
            folium.CircleMarker(
                location=[node.lat, node.lon],
                radius=7,
                popup=folium.Popup(popup_html, max_width=300),
                tooltip=node.display_name,
                color=color,
                fill=True,
                fill_color=color,
                fill_opacity=0.7,
            ).add_to(onsen_group)

    # Add groups and layer control
    route_group.add_to(m)
    onsen_group.add_to(m)
    excluded_group.add_to(m)
    folium.LayerControl().add_to(m)

    # Save
    import os
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    m.save(output_path)
    print(f"Saved map to {output_path}")
    return output_path


if __name__ == "__main__":
    generate_gpx_map()
