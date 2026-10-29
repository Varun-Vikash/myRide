import os
import re
import json
import heapq
import math
import time
from backend.config import LIB_ASSETS_DIR

def extract_ruby_json(filepath):
    if not os.path.exists(filepath):
        return None
    with open(filepath, 'r', encoding='utf-8') as f:
        c = f.read()
    c = re.sub(r'=begin.*?=end', '', c, flags=re.DOTALL)
    m = re.search(r'[\[\{]', c)
    if not m:
        return None
    start = m.start()
    end_char = '}' if c[start] == '{' else ']'
    end = c.rfind(end_char)
    s = c[start:end+1]
    s = re.sub(r'ActionController::Base\.helpers\.image_path\(([\'"])(.*?)\1\)', r'"/assets/images/\2"', s)
    s = re.sub(r':([a-zA-Z0-9_]+)\s*=>', r'"\1":', s)
    s = re.sub(r'(?<=[{,\s])([a-zA-Z0-9_]+):', r'"\1":', s)
    def fix_w(match):
        words = match.group(1).split()
        return json.dumps(words)
    s = re.sub(r'%w\[(.*?)\]', fix_w, s)
    s = re.sub(r',\s*([\]\}])', r'\1', s)
    return json.loads(s)

class CampusGraphService:
    def __init__(self):
        self.tags = {}
        self.legends = {}
        for lvl in [1, 2, 3, 4]:
            self.tags[lvl] = extract_ruby_json(os.path.join(LIB_ASSETS_DIR, f'zoom_level_{lvl}.rb')) or {"tags": []}
            self.legends[lvl] = extract_ruby_json(os.path.join(LIB_ASSETS_DIR, f'legends_{lvl}.rb')) or []

        self.building_index = extract_ruby_json(os.path.join(LIB_ASSETS_DIR, 'index.rb')) or {"buildings": []}

        # Mathematically calibrate coordinates across all zoom levels
        self._calibrate_coordinates()

        # Filter ghost/out-of-bounds nodes & non-road shortcut edges
        out_of_bounds_vehicle_nodes = {65, 66, 71, 72, 73, 74, 75, 78, 79, 80, 12, 13, 63}
        raw_v_junctions = extract_ruby_json(os.path.join(LIB_ASSETS_DIR, 'vehicle_junction_points.rb')) or []
        self.vehicle_junctions = [
            j for j in raw_v_junctions 
            if j.get('id') not in out_of_bounds_vehicle_nodes and j.get('left', 0) <= 2300
        ]
        self.vehicle_junction_dict = {j['id']: j for j in self.vehicle_junctions}

        # Remove ghost edges that lack physical roads (cuts across fields/buildings or dead ends)
        ghost_edge_pairs = [{11, 12}, {12, 144}, {12, 13}, {63, 62}]
        raw_v_edges = extract_ruby_json(os.path.join(LIB_ASSETS_DIR, 'vehicle_edges.rb')) or []
        self.vehicle_edges = []
        for e in raw_v_edges:
            u, v = e[0], e[1]
            if u in out_of_bounds_vehicle_nodes or v in out_of_bounds_vehicle_nodes:
                continue
            if set(e[:2]) in ghost_edge_pairs:
                continue
            if u in self.vehicle_junction_dict and v in self.vehicle_junction_dict:
                ju = self.vehicle_junction_dict[u]
                jv = self.vehicle_junction_dict[v]
                real_w = math.hypot(ju['left'] - jv['left'], ju['top'] - jv['top'])
                self.vehicle_edges.append((u, v, real_w))

        self.ped_junctions = extract_ruby_json(os.path.join(LIB_ASSETS_DIR, 'junction_points.rb')) or []
        self.ped_edges = extract_ruby_json(os.path.join(LIB_ASSETS_DIR, 'edges.rb')) or []
        self.ped_junction_dict = {j['id']: j for j in self.ped_junctions}

        self.vehicle_graph = self._build_adj(self.vehicle_edges)
        self.ped_graph = self._build_adj(self.ped_edges)

    def _calibrate_coordinates(self):
        """
        Mathematically calibrates tags and legends for zoom levels 1, 2, and 3
        relative to the canonical 3420 x 3876 master canvas (Level 4, scale 1.0).
        At zoom level L in {1, 2, 3, 4}, scale = 1.0 / (1.5 ** (4 - L)).
        Positions are strictly projected:
            left = round(base_left * scale) px
            top  = round(base_top * scale) px
        This eliminates hand-coded drift, icon swapping, and random dispersal.
        """
        t4_list = self.tags.get(4, {}).get('tags', [])
        t4_map = {t['id']: t for t in t4_list}

        l4_list = self.legends.get(4, [])
        l4_map = {item['id']: item for item in l4_list}
        l4_map_lower = {item['id'].lower(): item for item in l4_list}

        legend_aliases = {
            'football-ground': 'football-icon',
            'cricket-ground': 'cricket-icon',
            'hostel-icon-1': 'Narmadha-icon',
            'hostel-icon-2': 'Ganga-icon',
            'hostel-icon-3': 'emerald-icon',
            'hostel-icon-4': 'sapphire-icon',
        }

        for lvl in [1, 2, 3]:
            scale = 1.0 / (1.5 ** (4 - lvl))

            # Calibrate building tags
            raw_tags = self.tags.get(lvl, {}).get('tags', [])
            calibrated_tags = []
            for t in raw_tags:
                tid = t.get('id')
                if tid in t4_map:
                    base_x = float(str(t4_map[tid]['left']).replace('px', ''))
                    base_y = float(str(t4_map[tid]['top']).replace('px', ''))
                    calibrated_tags.append({
                        "id": tid,
                        "name": t.get('name', t4_map[tid].get('name', '')),
                        "left": f"{round(base_x * scale)}px",
                        "top": f"{round(base_y * scale)}px"
                    })
                else:
                    calibrated_tags.append(t)
            self.tags[lvl] = {"tags": calibrated_tags}

            # Calibrate legend amenity icons
            raw_legends = self.legends.get(lvl, [])
            if lvl == 1 and not raw_legends:
                # Key landmark amenities for campus overview
                raw_legends = [
                    {'id': 'library-icon-1'},
                    {'id': 'food-icon-3'},
                    {'id': 'medical-icon'},
                    {'id': 'atm-icon-1'},
                    {'id': 'football-icon'}
                ]

            calibrated_legends = []
            for item in raw_legends:
                lid = item.get('id', '')
                canonical_id = legend_aliases.get(lid, lid)
                canon = l4_map.get(canonical_id) or l4_map_lower.get(canonical_id.lower())
                if canon:
                    base_x = float(str(canon['left']).replace('px', ''))
                    base_y = float(str(canon['top']).replace('px', ''))
                    calibrated_legends.append({
                        "id": lid,
                        "link": canon.get('link', item.get('link')),
                        "left": f"{round(base_x * scale)}px",
                        "top": f"{round(base_y * scale)}px"
                    })
                else:
                    calibrated_legends.append(item)
            self.legends[lvl] = calibrated_legends

    def _build_adj(self, edge_list):
        adj = {}
        for u, v, w in edge_list:
            adj.setdefault(u, []).append((v, w))
            adj.setdefault(v, []).append((u, w))
        return adj

    def dijkstra(self, graph, src, dst):
        t0 = time.perf_counter()
        dist = {src: 0}
        prev = {}
        pq = [(0, src)]
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist.get(u, float('inf')):
                continue
            if u == dst:
                break
            for v, w in graph.get(u, []):
                if d + w < dist.get(v, float('inf')):
                    dist[v] = d + w
                    prev[v] = u
                    heapq.heappush(pq, (d + w, v))

        latency_ms = (time.perf_counter() - t0) * 1000

        if dst not in dist:
            return None, float('inf'), latency_ms

        path = []
        curr = dst
        while curr is not None:
            path.append(curr)
            curr = prev.get(curr)
        path.reverse()
        return path, dist[dst], latency_ms

    def find_nearest_junction(self, junctions, left, top):
        min_dist = float('inf')
        best_id = None
        for j in junctions:
            d = math.hypot(j['left'] - left, j['top'] - top)
            if d < min_dist:
                min_dist = d
                best_id = j['id']
        return best_id

    def search_places(self, query):
        q = query.lower().replace(' ', '')
        if not q:
            return []
        results = []
        for b in self.building_index.get('buildings', []):
            for t in b.get('terms', []):
                if q in t.lower().replace(' ', ''):
                    results.append({"id": b['id'], "name": b['name'], "match": t, "floor": "Department Block", "type": "Building"})
            for f_idx, floor in enumerate(b.get('floors', [])):
                for r in floor.get('rooms', []):
                    if q in r.lower().replace(' ', ''):
                        results.append({"id": b['id'], "name": b['name'], "match": r, "floor": floor['name'], "type": "Room / Lab"})

        tags4 = self.tags.get(4, {}).get('tags', [])
        for tag in tags4:
            if q in tag.get('name', '').lower().replace(' ', ''):
                results.append({"id": tag['id'], "name": tag['name'], "match": tag['name'], "floor": "Campus Landmark", "type": "Landmark"})

        results.sort(key=lambda x: x['match'].lower().replace(' ', '').find(q))
        return results[:25]

# Singleton instance
campus_graph = CampusGraphService()
