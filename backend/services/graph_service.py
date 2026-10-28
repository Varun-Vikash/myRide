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

        # Filter ghost/out-of-bounds eastern perimeter vehicle nodes that lack drawn road geometry on Map-dark.svg
        out_of_bounds_vehicle_nodes = {65, 66, 71, 72, 73, 74, 75, 78, 79, 80}
        raw_v_junctions = extract_ruby_json(os.path.join(LIB_ASSETS_DIR, 'vehicle_junction_points.rb')) or []
        self.vehicle_junctions = [j for j in raw_v_junctions if j.get('id') not in out_of_bounds_vehicle_nodes and j.get('left', 0) <= 2300]
        
        raw_v_edges = extract_ruby_json(os.path.join(LIB_ASSETS_DIR, 'vehicle_edges.rb')) or []
        self.vehicle_edges = [e for e in raw_v_edges if e[0] not in out_of_bounds_vehicle_nodes and e[1] not in out_of_bounds_vehicle_nodes]

        self.ped_junctions = extract_ruby_json(os.path.join(LIB_ASSETS_DIR, 'junction_points.rb')) or []
        self.ped_edges = extract_ruby_json(os.path.join(LIB_ASSETS_DIR, 'edges.rb')) or []

        self.vehicle_junction_dict = {j['id']: j for j in self.vehicle_junctions}
        self.ped_junction_dict = {j['id']: j for j in self.ped_junctions}

        self.vehicle_graph = self._build_adj(self.vehicle_edges)
        self.ped_graph = self._build_adj(self.ped_edges)

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
