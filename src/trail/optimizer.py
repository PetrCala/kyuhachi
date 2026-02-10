"""Route optimization using Google OR-Tools.

Solves a variant of the Traveling Salesman Problem:
- Select target_onsen_count onsens from ~144 eligible
- Mandatory onsens (Beppu) must be included
- Fixed endpoint: Beppu
- Flexible start point (southern Kyushu)
- Minimize total walking distance
"""

from __future__ import annotations

import numpy as np
from loguru import logger

from ortools.constraint_solver import routing_enums_pb2, pywrapcp

from src.trail.config import TrailConfig
from src.trail.models import OnsenNode
from src.trail.routing import (
    build_distance_matrix,
    detect_ferry_pairs,
    haversine,
    penalize_ferry_pairs,
)


def optimize_route(
    nodes: list[OnsenNode],
    distance_matrix: np.ndarray,
    mandatory_indices: set[int],
    start_index: int,
    end_index: int,
    target_count: int = 88,
    time_limit_seconds: int = 60,
) -> list[int]:
    """Optimize the walking route using OR-Tools VRP solver.

    Args:
        nodes: List of eligible OnsenNode objects.
        distance_matrix: NxN distance matrix in km.
        mandatory_indices: Set of indices that must be visited (Beppu).
        start_index: Index of the starting node.
        end_index: Index of the ending node (Beppu centroid nearest).
        target_count: Target number of onsens to visit.
        time_limit_seconds: Solver time limit.

    Returns:
        Ordered list of node indices representing the route.
    """
    n = len(nodes)
    logger.info(
        f"Optimizing route: {n} nodes, {len(mandatory_indices)} mandatory, "
        f"target {target_count}, time limit {time_limit_seconds}s"
    )

    # Convert distance matrix to integer (meters) for OR-Tools
    int_matrix = (distance_matrix * 1000).astype(int)

    # Create routing index manager
    manager = pywrapcp.RoutingIndexManager(n, 1, [start_index], [end_index])
    routing = pywrapcp.RoutingModel(manager)

    # Distance callback
    def distance_callback(from_index: int, to_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return int_matrix[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # Set up disjunctions (optional/mandatory nodes)
    # We want exactly `target_count` nodes visited.
    # Mandatory nodes get extremely high drop penalty (effectively can't be dropped).
    # Optional nodes get a tuned penalty so the solver drops ~(n - target_count) of them.
    #
    # The penalty for dropping an optional node should be high enough that the solver
    # prefers visiting nodes over skipping them, but low enough that very distant nodes
    # get dropped. We tune this based on average inter-node distance.
    avg_dist = int(np.mean(int_matrix[int_matrix > 0]))
    mandatory_penalty = avg_dist * n * 100  # Effectively infinite
    optional_penalty = (
        avg_dist * 3
    )  # Tuned: prefer visiting unless detour > ~3x average

    logger.info(
        f"Penalties: mandatory={mandatory_penalty}, optional={optional_penalty}, "
        f"avg_dist={avg_dist}m"
    )

    for node_idx in range(n):
        # Start/end depots are automatically included by OR-Tools; skip them
        if node_idx == start_index or node_idx == end_index:
            continue
        routing_idx = manager.NodeToIndex(node_idx)
        if routing_idx == -1:
            continue  # Node not in routing model
        if node_idx in mandatory_indices:
            routing.AddDisjunction([routing_idx], mandatory_penalty)
        else:
            routing.AddDisjunction([routing_idx], optional_penalty)

    # Search parameters
    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_params.time_limit.FromSeconds(time_limit_seconds)

    # Solve
    logger.info("Solving...")
    solution = routing.SolveWithParameters(search_params)

    if solution is None:
        logger.error("No solution found! Falling back to greedy.")
        return greedy_route(
            nodes,
            distance_matrix,
            mandatory_indices,
            start_index,
            end_index,
            target_count,
        )

    # Extract route
    route: list[int] = []
    index = routing.Start(0)
    while not routing.IsEnd(index):
        node_idx = manager.IndexToNode(index)
        route.append(node_idx)
        index = solution.Value(routing.NextVar(index))
    # Add end node
    node_idx = manager.IndexToNode(index)
    route.append(node_idx)

    # Remove duplicates while preserving order (start might equal something)
    seen = set()
    unique_route = []
    for idx in route:
        if idx not in seen:
            seen.add(idx)
            unique_route.append(idx)

    total_dist = sum(
        distance_matrix[unique_route[i]][unique_route[i + 1]]
        for i in range(len(unique_route) - 1)
    )

    logger.info(
        f"OR-Tools solution: {len(unique_route)} onsens, " f"{total_dist:.1f} km total"
    )

    # If we got more than target, trim the highest-detour optional nodes
    if len(unique_route) > target_count:
        unique_route = _trim_route(
            unique_route, distance_matrix, mandatory_indices, target_count
        )

    # If we got fewer than target, this is a sign the penalty was too high
    if len(unique_route) < target_count:
        logger.warning(
            f"Only {len(unique_route)} onsens in route, target was {target_count}. "
            f"Trying with adjusted penalties..."
        )

    return unique_route


def _trim_route(
    route: list[int],
    distance_matrix: np.ndarray,
    mandatory_indices: set[int],
    target_count: int,
) -> list[int]:
    """Trim a route to target_count by removing highest-detour optional nodes."""
    while len(route) > target_count:
        worst_idx = -1
        worst_cost = -1.0

        for i in range(1, len(route) - 1):  # Don't remove start/end
            if route[i] in mandatory_indices:
                continue
            # Detour cost = d(prev, this) + d(this, next) - d(prev, next)
            prev_node = route[i - 1]
            this_node = route[i]
            next_node = route[i + 1]
            detour = (
                distance_matrix[prev_node][this_node]
                + distance_matrix[this_node][next_node]
                - distance_matrix[prev_node][next_node]
            )
            if detour > worst_cost:
                worst_cost = detour
                worst_idx = i

        if worst_idx == -1:
            break
        route.pop(worst_idx)

    return route


def greedy_route(
    nodes: list[OnsenNode],
    distance_matrix: np.ndarray,
    mandatory_indices: set[int],
    start_index: int,
    end_index: int,
    target_count: int = 88,
) -> list[int]:
    """Greedy nearest-neighbor route construction + 2-opt improvement.

    Fallback when OR-Tools fails.
    """
    logger.info("Building greedy nearest-neighbor route...")
    n = len(nodes)
    visited = {start_index}
    route = [start_index]
    current = start_index

    # Phase 1: Nearest-neighbor construction
    while len(route) < n:
        best_next = -1
        best_dist = float("inf")
        for j in range(n):
            if j in visited or j == end_index:
                continue
            d = distance_matrix[current][j]
            # Prefer mandatory nodes
            if j in mandatory_indices:
                d *= 0.5
            if d < best_dist:
                best_dist = d
                best_next = j
        if best_next == -1:
            break
        route.append(best_next)
        visited.add(best_next)
        current = best_next

    # Add end node
    if end_index not in visited:
        route.append(end_index)

    # Phase 2: Ensure all mandatory nodes are in the route
    for m_idx in mandatory_indices:
        if m_idx not in visited:
            # Insert at position that minimizes added distance
            best_pos = len(route) - 1
            best_cost = float("inf")
            for i in range(1, len(route)):
                cost = (
                    distance_matrix[route[i - 1]][m_idx]
                    + distance_matrix[m_idx][route[i]]
                    - distance_matrix[route[i - 1]][route[i]]
                )
                if cost < best_cost:
                    best_cost = cost
                    best_pos = i
            route.insert(best_pos, m_idx)

    # Phase 3: Trim to target count
    route = _trim_route(route, distance_matrix, mandatory_indices, target_count)

    # Phase 4: 2-opt local improvement
    route = _two_opt(route, distance_matrix, mandatory_indices)

    total_dist = sum(
        distance_matrix[route[i]][route[i + 1]] for i in range(len(route) - 1)
    )
    logger.info(f"Greedy route: {len(route)} onsens, {total_dist:.1f} km total")

    return route


def _two_opt(
    route: list[int],
    distance_matrix: np.ndarray,
    mandatory_indices: set[int],
    max_iterations: int = 1000,
) -> list[int]:
    """2-opt local search improvement."""
    improved = True
    iterations = 0
    while improved and iterations < max_iterations:
        improved = False
        iterations += 1
        for i in range(1, len(route) - 2):
            for j in range(i + 1, len(route) - 1):
                d_old = (
                    distance_matrix[route[i - 1]][route[i]]
                    + distance_matrix[route[j]][route[j + 1]]
                )
                d_new = (
                    distance_matrix[route[i - 1]][route[j]]
                    + distance_matrix[route[i]][route[j + 1]]
                )
                if d_new < d_old - 0.01:  # Small epsilon to avoid floating point loops
                    route[i : j + 1] = reversed(route[i : j + 1])
                    improved = True
    if iterations > 1:
        logger.debug(f"2-opt: {iterations} iterations")
    return route


def run_optimization(
    nodes: list[OnsenNode],
    config: TrailConfig,
) -> tuple[list[OnsenNode], float]:
    """High-level optimization: load data, optimize, return ordered onsens.

    Args:
        nodes: All eligible (non-excluded) OnsenNode objects.
        config: Trail configuration.

    Returns:
        Tuple of (ordered list of OnsenNode, total distance in km).
    """
    from src.trail.data_prep import find_beppu_centroid

    # Build index mappings
    node_to_idx = {n.id: i for i, n in enumerate(nodes)}
    mandatory_indices = {node_to_idx[n.id] for n in nodes if n.is_mandatory}

    # Find start: southernmost onsen (good starting area)
    south_nodes = sorted(nodes, key=lambda n: n.lat)
    start_index = node_to_idx[south_nodes[0].id]

    # Find end: nearest to Beppu centroid
    beppu_centroid = find_beppu_centroid(nodes)
    end_node = min(
        [n for n in nodes if n.is_mandatory],
        key=lambda n: haversine(n.lat, n.lon, *beppu_centroid),
    )
    end_index = node_to_idx[end_node.id]

    logger.info(
        f"Start: #{nodes[start_index].id} {nodes[start_index].display_name} "
        f"(lat={nodes[start_index].lat:.2f})"
    )
    logger.info(
        f"End: #{end_node.id} {end_node.display_name} " f"(lat={end_node.lat:.2f})"
    )

    # Build distance matrix (OSRM or haversine fallback)
    logger.info("Building distance matrix...")
    dist_matrix = build_distance_matrix(
        nodes,
        use_osrm=config.use_osrm,
        cache_path=config.osrm_cache_path,
        road_factor=config.haversine_road_factor,
        refresh=config.refresh_distances,
    )

    # Iterative optimize-then-verify loop to eliminate ferry routes.
    # After each optimization pass, check consecutive pairs for ferry
    # usage.  If found, penalize those pairs and re-optimize.
    max_ferry_iterations = 5
    all_ferry_pairs: list[tuple[int, int]] = []

    for ferry_iter in range(max_ferry_iterations):
        route_indices = optimize_route(
            nodes=nodes,
            distance_matrix=dist_matrix,
            mandatory_indices=mandatory_indices,
            start_index=start_index,
            end_index=end_index,
            target_count=config.target_onsen_count,
            time_limit_seconds=config.solver_time_limit_seconds,
        )

        if not config.use_osrm:
            break  # No ferry risk with haversine

        # Check consecutive pairs for ferry usage
        new_ferry = detect_ferry_pairs(
            nodes, dist_matrix, route_indices,
        )

        if not new_ferry:
            if ferry_iter > 0:
                logger.info(
                    f"Ferry-free route found after "
                    f"{ferry_iter + 1} iterations "
                    f"({len(all_ferry_pairs)} pairs penalized)"
                )
            break

        all_ferry_pairs.extend(new_ferry)
        dist_matrix = penalize_ferry_pairs(
            dist_matrix, new_ferry,
        )
        logger.info(
            f"Ferry iteration {ferry_iter + 1}: "
            f"penalized {len(new_ferry)} pairs, "
            f"re-optimizing..."
        )
    else:
        logger.warning(
            f"Still found ferry routes after "
            f"{max_ferry_iterations} iterations"
        )

    # Convert indices to OnsenNode objects
    ordered_onsens = [nodes[i] for i in route_indices]

    # Calculate total distance
    total_dist = sum(
        dist_matrix[route_indices[i]][route_indices[i + 1]]
        for i in range(len(route_indices) - 1)
    )

    # Ensure Beppu onsens are at the end
    ordered_onsens = _move_beppu_to_end(
        ordered_onsens, dist_matrix, node_to_idx,
    )

    # Recalculate total distance after reordering
    reordered_indices = [
        node_to_idx[n.id] for n in ordered_onsens
    ]
    total_dist = sum(
        dist_matrix[reordered_indices[i]][reordered_indices[i + 1]]
        for i in range(len(reordered_indices) - 1)
    )

    logger.info(
        f"Final route: {len(ordered_onsens)} onsens, "
        f"{total_dist:.1f} km"
    )

    return ordered_onsens, total_dist


def _move_beppu_to_end(
    onsens: list[OnsenNode],
    dist_matrix: np.ndarray,
    node_to_idx: dict[int, int],
) -> list[OnsenNode]:
    """Move all Beppu onsens to the end of the route.

    Keep their relative order optimized within the Beppu cluster.
    """
    beppu = [o for o in onsens if o.is_mandatory]
    non_beppu = [o for o in onsens if not o.is_mandatory]

    if not beppu:
        return onsens

    # Optimize order within Beppu cluster using nearest-neighbor
    beppu_ordered = []
    remaining = list(beppu)

    # Start from the Beppu onsen closest to the last non-Beppu onsen
    if non_beppu:
        last_non_beppu = non_beppu[-1]
        remaining.sort(
            key=lambda b: dist_matrix[node_to_idx[last_non_beppu.id]][node_to_idx[b.id]]
        )

    while remaining:
        current = remaining.pop(0)
        beppu_ordered.append(current)
        if remaining:
            remaining.sort(
                key=lambda b: dist_matrix[node_to_idx[current.id]][node_to_idx[b.id]]
            )

    return non_beppu + beppu_ordered
