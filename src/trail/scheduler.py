"""Day-by-day scheduler for the walking trail.

Takes an ordered list of onsens from the optimizer and partitions them
into daily plans, considering walking distances and opening hours.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Optional

from loguru import logger

from src.trail.config import TrailConfig
from src.trail.models import OnsenNode, DayPlan, Segment, Trail
from src.trail.routing import haversine


def _time_add_hours(t: time, hours: float) -> time:
    """Add hours to a time, capping at 23:59."""
    total_minutes = t.hour * 60 + t.minute + int(hours * 60)
    total_minutes = min(total_minutes, 23 * 60 + 59)
    return time(total_minutes // 60, total_minutes % 60)


def _time_to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def _minutes_to_time(minutes: int) -> time:
    minutes = max(0, min(minutes, 23 * 60 + 59))
    return time(minutes // 60, minutes % 60)


def _check_open(node: OnsenNode, dt: datetime) -> tuple[bool, Optional[str]]:
    """Check if an onsen is open at a given datetime.

    Returns (is_open, warning_message).
    """
    # Check closed days
    if node.closed_days:
        closed = node.closed_days.is_closed_on(dt)
        if closed is True:
            return False, f"Closed on {dt.strftime('%A %Y-%m-%d')}"
        if closed is None:
            return True, f"Closure uncertain (irregular schedule)"

    # Check usage time
    if node.usage_time:
        if node.usage_time.is_closed:
            return False, "Permanently closed"
        if node.usage_time.unknown_or_non_time:
            return True, "Opening hours unknown"
        if node.usage_time.requires_reservation:
            return True, "Reservation required"
        if node.usage_time.windows:
            is_open = node.usage_time.is_open(dt, assume_unknown_closed=False)
            if not is_open:
                # Find next opening time
                earliest = node.usage_time.earliest_opening()
                if earliest and _time_to_minutes(earliest) > _time_to_minutes(
                    dt.time()
                ):
                    wait = _time_to_minutes(earliest) - _time_to_minutes(dt.time())
                    return (
                        False,
                        f"Opens at {earliest.strftime('%H:%M')} (wait {wait}min)",
                    )
                return False, f"Not open at {dt.strftime('%H:%M')}"

    return True, None


def schedule_trail(
    ordered_onsens: list[OnsenNode],
    config: TrailConfig,
    start_lat: Optional[float] = None,
    start_lon: Optional[float] = None,
) -> Trail:
    """Create a day-by-day schedule from an ordered list of onsens.

    Args:
        ordered_onsens: Onsens in visit order (from optimizer).
        config: Trail configuration.
        start_lat/lon: Starting coordinates (defaults to first onsen).

    Returns:
        Complete Trail with day-by-day plans.
    """
    if not ordered_onsens:
        return Trail()

    target_daily_km = config.target_daily_km
    max_daily_km = config.max_daily_km
    walking_speed = config.walking_speed_kmh
    visit_minutes = config.onsen_visit_minutes
    road_factor = config.haversine_road_factor
    start_date = config.start_date
    end_date = config.end_date

    trail = Trail(
        ordered_onsens=ordered_onsens,
        start_name=ordered_onsens[0].display_name,
        start_point=(ordered_onsens[0].lat, ordered_onsens[0].lon),
        end_name=ordered_onsens[-1].display_name,
        end_point=(ordered_onsens[-1].lat, ordered_onsens[-1].lon),
    )

    # Starting position
    current_lat = start_lat or ordered_onsens[0].lat
    current_lon = start_lon or ordered_onsens[0].lon
    current_name = "Start"

    onsen_idx = 0
    current_date = start_date
    max_days = (end_date - start_date).days + 1

    day_number = 0

    while onsen_idx < len(ordered_onsens) and day_number < max_days:
        day_number += 1
        current_date = start_date + timedelta(days=day_number - 1)

        day = DayPlan(day_number=day_number, date=current_date)
        day_km = 0.0
        current_time = config.daily_start_time

        # Check if next onsen is beyond max_daily_km (multi-day gap)
        if onsen_idx < len(ordered_onsens):
            next_onsen = ordered_onsens[onsen_idx]
            dist_to_next = (
                haversine(current_lat, current_lon, next_onsen.lat, next_onsen.lon)
                * road_factor
            )

            if dist_to_next > max_daily_km:
                # Walk toward the next onsen (transit day, no onsen visits)
                walk_km = min(target_daily_km, dist_to_next)
                fraction = walk_km / dist_to_next
                new_lat = current_lat + (next_onsen.lat - current_lat) * fraction
                new_lon = current_lon + (next_onsen.lon - current_lon) * fraction
                walk_hours = walk_km / walking_speed

                segment = Segment(
                    from_name=current_name,
                    from_lat=current_lat,
                    from_lon=current_lon,
                    to_name=f"Toward {next_onsen.name}",
                    to_lat=new_lat,
                    to_lon=new_lon,
                    distance_km=walk_km,
                    estimated_hours=walk_hours,
                )
                day.segments.append(segment)
                day.overnight_type = "tent"
                day.overnight_name = f"En route to {next_onsen.name}"

                current_lat = new_lat
                current_lon = new_lon
                current_name = f"Camp (toward {next_onsen.name})"

                trail.days.append(day)
                continue

        while onsen_idx < len(ordered_onsens):
            next_onsen = ordered_onsens[onsen_idx]

            # Calculate distance to next onsen
            dist = (
                haversine(current_lat, current_lon, next_onsen.lat, next_onsen.lon)
                * road_factor
            )
            walk_hours = dist / walking_speed

            # Check if we can reach it today
            if day_km + dist > max_daily_km:
                break

            # If we'd exceed target but have visited onsens today, consider stopping
            if day_km + dist > target_daily_km and day.onsens_visited:
                if dist > 10:
                    break

            # Calculate arrival time
            arrival_time = _time_add_hours(current_time, walk_hours)

            # Create walking segment
            segment = Segment(
                from_name=current_name,
                from_lat=current_lat,
                from_lon=current_lon,
                to_name=next_onsen.display_name,
                to_lat=next_onsen.lat,
                to_lon=next_onsen.lon,
                distance_km=dist,
                estimated_hours=walk_hours,
            )
            day.segments.append(segment)

            # Check if onsen is open
            arrival_dt = datetime.combine(current_date, arrival_time)
            is_open, warning = _check_open(next_onsen, arrival_dt)

            if warning:
                day.warnings.append(f"#{next_onsen.id} {next_onsen.name}: {warning}")

            if (
                not is_open
                and next_onsen.usage_time
                and next_onsen.usage_time.earliest_opening()
            ):
                # Wait for opening
                opens_at = next_onsen.usage_time.earliest_opening()
                if _time_to_minutes(opens_at) > _time_to_minutes(arrival_time):
                    wait_min = _time_to_minutes(opens_at) - _time_to_minutes(
                        arrival_time
                    )
                    if wait_min <= 120:  # Wait up to 2 hours
                        arrival_time = opens_at

            # Visit the onsen
            day.onsens_visited.append(next_onsen)
            day.visit_times.append(arrival_time)
            day_km += dist

            # Update position and time (add visit duration)
            current_lat = next_onsen.lat
            current_lon = next_onsen.lon
            current_name = next_onsen.display_name
            visit_hours = visit_minutes / 60
            current_time = _time_add_hours(arrival_time, visit_hours)

            onsen_idx += 1

        # Determine overnight type
        if day.onsens_visited:
            last_onsen = day.onsens_visited[-1]
            # If the last onsen is a ryokan/hotel type, consider staying there
            if any(kw in (last_onsen.name or "") for kw in ["旅館", "ホテル", "宿"]):
                day.overnight_type = "onsen"
                day.overnight_name = last_onsen.name
            else:
                day.overnight_type = "tent"
                day.overnight_name = f"Near {last_onsen.name}"

        trail.days.append(day)

    # Log summary
    total_km = trail.total_distance_km
    total_onsens = sum(len(d.onsens_visited) for d in trail.days)
    warning_count = sum(len(d.warnings) for d in trail.days)

    logger.info(
        f"Schedule: {trail.total_days} days, {total_onsens} onsens, "
        f"{total_km:.1f} km, {warning_count} warnings"
    )

    if onsen_idx < len(ordered_onsens):
        remaining = len(ordered_onsens) - onsen_idx
        logger.warning(
            f"{remaining} onsens could not be scheduled within the date range!"
        )

    return trail
