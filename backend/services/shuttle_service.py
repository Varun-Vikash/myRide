from backend.services.graph_service import campus_graph

SHUTTLE_ROUTES_CONFIG = [
    {
        "id": "route-a",
        "name": "Route A (Main Campus Loop)",
        "bus_no": "Bus #101",
        "color": "#EF4444",
        "capacity": 32,
        "default_seats": 22,
        "speed_kmh": 20,
        "stops": [
            {"id": "main-gate", "junction": 1, "name": "Main Gate Station"},
            {"id": "bus", "junction": 11, "name": "Day Scholar Bus Stand"},
            {"id": "as-main-left", "junction": 111, "name": "AS Main Block"},
            {"id": "main-store", "junction": 42, "name": "Main Store Complex"},
            {"id": "boys-hostels", "junction": 51, "name": "Boys Hostel Station"},
            {"id": "boys-mess", "junction": 62, "name": "Boys Dining Mess"},
            {"id": "girls-hostels", "junction": 151, "name": "Girls Hostel Complex"},
            {"id": "west-gate", "junction": 157, "name": "West Gate Terminal"}
        ]
    },
    {
        "id": "route-b",
        "name": "Route B (Hostel Shuttle)",
        "bus_no": "Bus #202",
        "color": "#3B82F6",
        "capacity": 32,
        "default_seats": 18,
        "speed_kmh": 18,
        "stops": [
            {"id": "main-gate", "junction": 1, "name": "Main Gate Station"},
            {"id": "fashion-centre", "junction": 48, "name": "Fashion Tech Centre"},
            {"id": "boys-hostels", "junction": 51, "name": "Boys Hostel Station"},
            {"id": "cafeteria", "junction": 84, "name": "Central Cafeteria"},
            {"id": "library", "junction": 118, "name": "Central Library"},
            {"id": "girls-hostels", "junction": 151, "name": "Girls Hostel Complex"},
            {"id": "west-parking", "junction": 152, "name": "West Parking Bay"},
            {"id": "medical-centre", "junction": 153, "name": "Campus Medical Centre"},
            {"id": "west-gate", "junction": 157, "name": "West Gate Terminal"}
        ]
    },
    {
        "id": "route-c",
        "name": "Route C (Academic Express)",
        "bus_no": "Bus #303",
        "color": "#10B981",
        "capacity": 32,
        "default_seats": 27,
        "speed_kmh": 22,
        "stops": [
            {"id": "bus", "junction": 11, "name": "Day Scholar Bus Stand"},
            {"id": "principal-office", "junction": 15, "name": "Principal & Dean Office"},
            {"id": "as-rib-1", "junction": 27, "name": "AS Academic RIBs"},
            {"id": "mechanic-front", "junction": 32, "name": "Mechanical Engineering Block"},
            {"id": "main-auditorium", "junction": 117, "name": "Main Auditorium"},
            {"id": "ib-block-1", "junction": 142, "name": "IB Academic Block"},
            {"id": "football-ground", "junction": 144, "name": "Sports & Football Arena"}
        ]
    }
]

class ShuttleService:
    def __init__(self):
        self.routes = SHUTTLE_ROUTES_CONFIG
        self._cached_paths = {}
        self._precompute_routes()

    def _precompute_routes(self):
        for route in self.routes:
            route_id = route['id']
            stops = route['stops']
            waypoints = []
            total_dist = 0
            stop_indices = []

            # Compute route between all consecutive stops including return to start
            for i in range(len(stops)):
                u = stops[i]['junction']
                v = stops[(i + 1) % len(stops)]['junction']
                path, dist, _ = campus_graph.dijkstra(campus_graph.vehicle_graph, u, v)
                if path:
                    total_dist += dist
                    stop_indices.append(len(waypoints))
                    for node_id in path[:-1]:
                        j = campus_graph.vehicle_junction_dict[node_id]
                        waypoints.append({"id": node_id, "x": j['left'], "y": j['top']})

            # Append the closing waypoint exactly matching the first
            first_j = campus_graph.vehicle_junction_dict[stops[0]['junction']]
            waypoints.append({"id": stops[0]['junction'], "x": first_j['left'], "y": first_j['top']})

            self._cached_paths[route_id] = {
                "route_id": route_id,
                "name": route['name'],
                "bus_no": route['bus_no'],
                "color": route['color'],
                "capacity": route['capacity'],
                "seats": f"{route['default_seats']}/{route['capacity']}",
                "speed_kmh": route['speed_kmh'],
                "total_distance": round(total_dist, 1),
                "waypoints": waypoints,
                "stops": stops,
                "stop_indices": stop_indices
            }

    def get_routes(self):
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "bus_no": r["bus_no"],
                "color": r["color"],
                "stops_count": len(r["stops"]),
                "capacity": r["capacity"],
                "speed_kmh": r["speed_kmh"]
            }
            for r in self.routes
        ]

    def get_route_path(self, route_id):
        return self._cached_paths.get(route_id, self._cached_paths["route-a"])


STOP_JUNCTION_MAP = {
    'Main Gate Station': 1,
    'Day Scholar Bus Stand': 11,
    'Principal & Dean Office': 15,
    'AS Main Block': 111,
    'AS Academic RIBs': 27,
    'Mechanical Engineering Block': 32,
    'Fashion Tech Centre': 48,
    'Main Store Complex': 42,
    'Boys Hostel Station': 51,
    'Boys Dining Mess': 62,
    'Central Cafeteria': 84,
    'Main Auditorium': 117,
    'Central Library': 118,
    'IB Academic Block': 142,
    'Sports & Football Arena': 144,
    'Girls Hostel Complex': 151,
    'West Parking Bay': 152,
    'Campus Medical Centre': 153,
    'West Gate Terminal': 157
}


def compute_navigation_path(from_x, from_y, to_stop_name):
    """Computes shortest vehicle path from coordinates (from_x, from_y) to named campus stop."""
    src_j = campus_graph.find_nearest_junction(campus_graph.vehicle_junctions, from_x, from_y)
    dst_j = STOP_JUNCTION_MAP.get(to_stop_name, 1)
    path, dist, _ = campus_graph.dijkstra(campus_graph.vehicle_graph, src_j, dst_j)
    if not path:
        return {"waypoints": [], "distance": 0, "src_junction": src_j, "dst_junction": dst_j}
    
    waypoints = [
        {"id": nid, "x": campus_graph.vehicle_junction_dict[nid]['left'], "y": campus_graph.vehicle_junction_dict[nid]['top']}
        for nid in path
    ]
    return {
        "waypoints": waypoints,
        "distance": round(dist, 1),
        "src_junction": src_j,
        "dst_junction": dst_j,
        "destination_stop": to_stop_name
    }


def compute_path_between_stops(from_stop_name, to_stop_name):
    """Computes shortest vehicle path between two named campus stops."""
    src_j = STOP_JUNCTION_MAP.get(from_stop_name, 1)
    dst_j = STOP_JUNCTION_MAP.get(to_stop_name, 11)
    path, dist, _ = campus_graph.dijkstra(campus_graph.vehicle_graph, src_j, dst_j)
    if not path:
        return {"waypoints": [], "distance": 0, "src_junction": src_j, "dst_junction": dst_j}
    
    waypoints = [
        {"id": nid, "x": campus_graph.vehicle_junction_dict[nid]['left'], "y": campus_graph.vehicle_junction_dict[nid]['top']}
        for nid in path
    ]
    return {
        "waypoints": waypoints,
        "distance": round(dist, 1),
        "src_junction": src_j,
        "dst_junction": dst_j,
        "from_stop": from_stop_name,
        "to_stop": to_stop_name
    }


shuttle_service = ShuttleService()
