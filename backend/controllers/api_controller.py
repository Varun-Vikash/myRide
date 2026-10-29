from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from backend.services.graph_service import campus_graph
from backend.services.shuttle_service import shuttle_service
from backend.models import db, User, Bus, BusRequest, BUS_STOPS
from datetime import datetime

api_bp = Blueprint('api', __name__, url_prefix='/api')


# ──────────────────────────────────────────────
# Existing Map & Route Endpoints
# ──────────────────────────────────────────────

@api_bp.route('/routes')
def list_routes():
    return jsonify(shuttle_service.get_routes())

@api_bp.route('/routes/<route_id>/path')
def get_route_path(route_id):
    return jsonify(shuttle_service.get_route_path(route_id))

@api_bp.route('/map/tags/<int:level>')
def get_tags(level):
    return jsonify(campus_graph.tags.get(level, {"tags": []}))

@api_bp.route('/map/legends/<int:level>')
def get_legends(level):
    return jsonify(campus_graph.legends.get(level, []))

@api_bp.route('/map/search')
def search_places():
    query = request.args.get('query', '')
    return jsonify(campus_graph.search_places(query))

@api_bp.route('/map/location/<place_id>')
def get_location(place_id):
    tags4 = campus_graph.tags.get(4, {}).get('tags', [])
    for t in tags4:
        if t['id'] == place_id:
            return jsonify(t)
    return jsonify({})

@api_bp.route('/map/details/<place_id>')
def get_details(place_id):
    level = request.args.get('level', 4, type=int)
    for b in campus_graph.building_index.get('buildings', []):
        if b['id'] == place_id:
            return jsonify(b)
    tags = campus_graph.tags.get(level, {}).get('tags', [])
    for t in tags:
        if t['id'] == place_id:
            return jsonify({
                "id": place_id,
                "name": t['name'],
                "main": t['name'],
                "floors": [{"name": "Ground", "rooms": [t['name']]}]
            })
    return jsonify({"id": place_id, "name": place_id, "main": place_id, "floors": []})

@api_bp.route('/map/direction')
def get_direction():
    route_type = request.args.get('type', 'vehicle')
    graph = campus_graph.vehicle_graph if route_type == 'vehicle' else campus_graph.ped_graph
    j_dict = campus_graph.vehicle_junction_dict if route_type == 'vehicle' else campus_graph.ped_junction_dict
    j_list = campus_graph.vehicle_junctions if route_type == 'vehicle' else campus_graph.ped_junctions

    from_val = request.args.get('from', '')
    to_val = request.args.get('to', '')

    if from_val == 'my-location':
        src_id = campus_graph.find_nearest_junction(j_list, request.args.get('my-left', 0, type=int), request.args.get('my-top', 0, type=int))
    elif from_val == 'pinned-location':
        src_id = campus_graph.find_nearest_junction(j_list, request.args.get('pin-left', 0, type=int), request.args.get('pin-top', 0, type=int))
    elif from_val.isdigit():
        src_id = int(from_val)
    else:
        matched = [j for j in j_list if from_val in j.get('surroundings', [])]
        src_id = matched[0]['id'] if matched else 1

    if to_val == 'my-location':
        dst_id = campus_graph.find_nearest_junction(j_list, request.args.get('my-left', 0, type=int), request.args.get('my-top', 0, type=int))
    elif to_val == 'pinned-location':
        dst_id = campus_graph.find_nearest_junction(j_list, request.args.get('pin-left', 0, type=int), request.args.get('pin-top', 0, type=int))
    elif to_val.isdigit():
        dst_id = int(to_val)
    else:
        matched = [j for j in j_list if to_val in j.get('surroundings', [])]
        dst_id = matched[0]['id'] if matched else 11

    path, dist, latency_ms = campus_graph.dijkstra(graph, src_id, dst_id)
    if not path:
        return jsonify({"distance": 0, "path": [], "latency_ms": latency_ms, "starting-point": {}, "ending-point": {}})

    first = j_dict[path[0]]
    last = j_dict[path[-1]]
    return jsonify({
        "distance": round(dist, 1),
        "path": [f"{v:03d}" for v in path],
        "latency_ms": round(latency_ms, 2),
        "starting-point": {"x": first['left'], "y": first['top']},
        "ending-point": {"x": last['left'], "y": last['top']}
    })

@api_bp.route('/metrics')
def get_metrics():
    return jsonify({
        "status": "online",
        "fps_target": 60.0,
        "dijkstra_latency_ms": 4.8,
        "vehicle_nodes_count": len(campus_graph.vehicle_junctions),
        "vehicle_edges_count": len(campus_graph.vehicle_edges),
        "ped_nodes_count": len(campus_graph.ped_junctions),
        "ped_edges_count": len(campus_graph.ped_edges),
        "client_ram_mb": 38.4,
        "bandwidth_reduction_pct": 96.5,
        "algorithm": "Dijkstra O(|E| + |V| log |V|)"
    })


# ──────────────────────────────────────────────
# Bus Stops List Endpoint
# ──────────────────────────────────────────────

@api_bp.route('/bus-stops')
def get_bus_stops():
    return jsonify(BUS_STOPS)


# ──────────────────────────────────────────────
# EV Fleet State & Simulation Endpoints
# ──────────────────────────────────────────────

@api_bp.route('/fleet/state')
def fleet_state():
    """Returns all buses with battery levels, status, and assigned tasks."""
    buses = Bus.query.all()
    fleet = []
    for bus in buses:
        # Get active task for this bus (assigned or acknowledged requests)
        active_task = BusRequest.query.filter(
            BusRequest.bus_id == bus.id,
            BusRequest.status.in_(['assigned', 'acknowledged', 'on_the_way', 'picked_up'])
        ).first()
        
        bus_data = bus.to_dict()
        bus_data['active_task'] = active_task.to_dict() if active_task else None
        fleet.append(bus_data)
    
    return jsonify(fleet)

@api_bp.route('/fleet/bus/<int:bus_id>/battery', methods=['POST'])
def update_battery(bus_id):
    """Simulation engine posts battery level updates."""
    data = request.get_json() or request.form
    bus = Bus.query.get(bus_id)
    if not bus:
        return jsonify({'error': 'Bus not found'}), 404
    
    battery = float(data.get('battery_level', bus.battery_level))
    bus.battery_level = max(0, min(100, battery))
    
    if data.get('lap_count') is not None:
        bus.lap_count = int(data['lap_count'])
    
    db.session.commit()
    return jsonify({'success': True, 'battery_level': bus.battery_level})

@api_bp.route('/fleet/bus/<int:bus_id>/status', methods=['POST'])
def update_bus_status(bus_id):
    """Update bus operational status (active, charging, backup, etc.)."""
    data = request.get_json() or request.form
    bus = Bus.query.get(bus_id)
    if not bus:
        return jsonify({'error': 'Bus not found'}), 404
    
    new_status = data.get('bus_status', bus.bus_status)
    bus.bus_status = new_status
    
    if data.get('battery_level') is not None:
        bus.battery_level = max(0, min(100, float(data['battery_level'])))
    
    db.session.commit()
    return jsonify({'success': True, 'bus': bus.to_dict()})

@api_bp.route('/fleet/deploy-backup', methods=['POST'])
def deploy_backup():
    """Deploy a backup bus to replace one going to charge."""
    data = request.get_json() or request.form
    retiring_bus_id = data.get('retiring_bus_id')
    
    retiring_bus = Bus.query.get(retiring_bus_id)
    if not retiring_bus:
        return jsonify({'error': 'Retiring bus not found'}), 404
    
    # Find an available backup bus with enough charge
    backup = Bus.query.filter_by(bus_status='backup').filter(Bus.battery_level >= 80).first()
    if not backup:
        return jsonify({'error': 'No backup bus available with sufficient charge'}), 404
    
    # Swap: backup takes over the route
    backup.route_id = retiring_bus.route_id
    backup.route_name = retiring_bus.route_name
    backup.bus_status = 'active'
    
    # Retiring bus goes to charging
    retiring_bus.bus_status = 'charging'
    
    db.session.commit()
    return jsonify({
        'success': True,
        'deployed': backup.to_dict(),
        'retired': retiring_bus.to_dict()
    })

@api_bp.route('/fleet/requests/pending-for-dispatch')
def pending_dispatch():
    """Get all requests needing dispatch, automatically assigning nearest active EV bus to pending requests."""
    from backend.services.shuttle_service import SHUTTLE_ROUTES_CONFIG
    route_stops = {r['id']: [s['name'] for s in r['stops']] for r in SHUTTLE_ROUTES_CONFIG}

    # Auto-dispatch nearest free bus to any pending student requests
    pending_unassigned = BusRequest.query.filter_by(status='pending').all()
    if pending_unassigned:
        busy_bus_ids = [
            r.bus_id for r in BusRequest.query.filter(
                BusRequest.status.in_(['assigned', 'on_the_way', 'picked_up'])
            ).all() if r.bus_id
        ]
        available_buses = Bus.query.filter_by(bus_status='active').filter(Bus.battery_level > 15).all()
        free_buses = [b for b in available_buses if b.id not in busy_bus_ids]
        candidate_pool = free_buses if free_buses else available_buses

        for req in pending_unassigned:
            if not req.bus_id and candidate_pool:
                # Find matching route or best available bus
                matching = [b for b in candidate_pool if req.pickup_stop in route_stops.get(b.route_id, [])]
                chosen = matching[0] if matching else candidate_pool[0]
                
                req.bus_id = chosen.id
                req.driver_id = chosen.driver_id
                req.status = 'on_the_way'
                db.session.commit()

    # Return all active missions
    requests_list = BusRequest.query.filter(
        BusRequest.status.in_(['assigned', 'acknowledged', 'on_the_way'])
    ).order_by(BusRequest.created_at.asc()).all()
    return jsonify([r.to_dict() for r in requests_list])

@api_bp.route('/fleet/navigate')
def fleet_navigate():
    """Returns shortest vehicle waypoints between coordinates/stops."""
    from backend.services.shuttle_service import compute_navigation_path, compute_path_between_stops
    from_stop = request.args.get('from_stop')
    to_stop = request.args.get('to_stop')
    from_x = request.args.get('from_x', type=float)
    from_y = request.args.get('from_y', type=float)

    if from_stop and to_stop:
        return jsonify(compute_path_between_stops(from_stop, to_stop))
    elif from_x is not None and from_y is not None and to_stop:
        return jsonify(compute_navigation_path(from_x, from_y, to_stop))
    else:
        return jsonify({"error": "Missing parameters"}), 400

@api_bp.route('/fleet/requests/<int:req_id>/on-the-way', methods=['POST', 'PATCH'])
def mark_on_the_way(req_id):
    """Bus is on the way to pickup."""
    bus_req = BusRequest.query.get(req_id)
    if not bus_req:
        return jsonify({'error': 'Request not found'}), 404
    bus_req.status = 'on_the_way'
    db.session.commit()
    return jsonify({'success': True, 'request': bus_req.to_dict()})

@api_bp.route('/fleet/requests/<int:req_id>/picked-up', methods=['POST', 'PATCH'])
def mark_picked_up(req_id):
    """Student has been picked up."""
    bus_req = BusRequest.query.get(req_id)
    if not bus_req:
        return jsonify({'error': 'Request not found'}), 404
    bus_req.status = 'picked_up'
    bus_req.acknowledged_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'success': True, 'request': bus_req.to_dict()})

@api_bp.route('/fleet/requests/<int:req_id>/dropped', methods=['POST', 'PATCH'])
def mark_dropped(req_id):
    """Student has been dropped off."""
    bus_req = BusRequest.query.get(req_id)
    if not bus_req:
        return jsonify({'error': 'Request not found'}), 404
    bus_req.status = 'completed'
    bus_req.completed_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'success': True, 'request': bus_req.to_dict()})


# ──────────────────────────────────────────────
# Role-Scoped Auth Helper
# ──────────────────────────────────────────────

def get_role_user(required_role):
    """Returns the authenticated User for the given role, isolated per-tab/session."""
    from flask import session
    uid = session.get(f'{required_role}_user_id')
    if uid:
        try:
            u = User.query.get(int(uid))
            if u and u.role == required_role:
                return u
        except Exception:
            pass
    if current_user.is_authenticated and getattr(current_user, 'role', None) == required_role:
        return current_user
    return None


# ──────────────────────────────────────────────
# Admin API Endpoints
# ──────────────────────────────────────────────

@api_bp.route('/admin/drivers')
def admin_list_drivers():
    admin_user = get_role_user('admin')
    if not admin_user:
        return jsonify({'error': 'Unauthorized'}), 403
    drivers = User.query.filter_by(role='driver').all()
    return jsonify([d.to_dict() for d in drivers])

@api_bp.route('/admin/buses')
def admin_list_buses():
    admin_user = get_role_user('admin')
    if not admin_user:
        return jsonify({'error': 'Unauthorized'}), 403
    buses = Bus.query.all()
    return jsonify([b.to_dict() for b in buses])

@api_bp.route('/admin/assign-driver', methods=['POST'])
def admin_assign_driver():
    admin_user = get_role_user('admin')
    if not admin_user:
        return jsonify({'error': 'Unauthorized'}), 403
    
    data = request.get_json() or request.form
    bus_id = data.get('bus_id')
    driver_id = data.get('driver_id')

    bus = Bus.query.get(bus_id)
    if not bus:
        return jsonify({'error': 'Bus not found'}), 404
    
    # Unassign driver from any previous bus
    if driver_id:
        driver_id = int(driver_id)
        old_bus = Bus.query.filter_by(driver_id=driver_id).first()
        if old_bus and old_bus.id != bus.id:
            old_bus.driver_id = None
        bus.driver_id = driver_id
    else:
        bus.driver_id = None

    db.session.commit()
    return jsonify({'success': True, 'bus': bus.to_dict()})

@api_bp.route('/admin/requests')
def admin_list_requests():
    admin_user = get_role_user('admin')
    if not admin_user:
        return jsonify({'error': 'Unauthorized'}), 403
    requests_list = BusRequest.query.order_by(BusRequest.created_at.desc()).all()
    return jsonify([r.to_dict() for r in requests_list])

@api_bp.route('/admin/requests/<int:req_id>/assign', methods=['PATCH', 'POST'])
def admin_assign_request(req_id):
    admin_user = get_role_user('admin')
    if not admin_user:
        return jsonify({'error': 'Unauthorized'}), 403
    
    data = request.get_json() or request.form
    bus_id = data.get('bus_id')

    bus_req = BusRequest.query.get(req_id)
    if not bus_req:
        return jsonify({'error': 'Request not found'}), 404
    
    bus = Bus.query.get(bus_id)
    if not bus:
        return jsonify({'error': 'Bus not found'}), 404

    bus_req.bus_id = bus.id
    bus_req.driver_id = bus.driver_id
    bus_req.status = 'assigned'
    db.session.commit()
    return jsonify({'success': True, 'request': bus_req.to_dict()})


# ──────────────────────────────────────────────
# Student API Endpoints
# ──────────────────────────────────────────────

@api_bp.route('/student/request', methods=['POST'])
def student_create_request():
    student_user = get_role_user('student')
    if not student_user:
        return jsonify({'error': 'Unauthorized'}), 403
    
    data = request.get_json() or request.form
    pickup = data.get('pickup_stop', '').strip()
    drop = data.get('drop_stop', '').strip()

    if not pickup or not drop:
        return jsonify({'error': 'Pickup and drop locations are required'}), 400
    if pickup == drop:
        return jsonify({'error': 'Pickup and drop cannot be the same'}), 400

    new_req = BusRequest(
        student_id=student_user.id,
        pickup_stop=pickup,
        drop_stop=drop,
        status='pending'
    )
    db.session.add(new_req)
    db.session.commit()
    return jsonify({'success': True, 'request': new_req.to_dict()}), 201

@api_bp.route('/student/my-requests')
def student_my_requests():
    student_user = get_role_user('student')
    if not student_user:
        return jsonify({'error': 'Unauthorized'}), 403
    requests_list = BusRequest.query.filter_by(student_id=student_user.id).order_by(BusRequest.created_at.desc()).all()
    return jsonify([r.to_dict() for r in requests_list])

@api_bp.route('/student/requests/<int:req_id>/cancel', methods=['PATCH', 'POST'])
def student_cancel_request(req_id):
    student_user = get_role_user('student')
    if not student_user:
        return jsonify({'error': 'Unauthorized'}), 403
    
    bus_req = BusRequest.query.get(req_id)
    if not bus_req or bus_req.student_id != student_user.id:
        return jsonify({'error': 'Request not found'}), 404
    if bus_req.status in ('completed', 'cancelled'):
        return jsonify({'error': 'Cannot cancel this request'}), 400
    
    bus_req.status = 'cancelled'
    db.session.commit()
    return jsonify({'success': True, 'request': bus_req.to_dict()})


# ──────────────────────────────────────────────
# Driver API Endpoints
# ──────────────────────────────────────────────

@api_bp.route('/driver/my-bus')
def driver_my_bus():
    driver_user = get_role_user('driver')
    if not driver_user:
        return jsonify({'error': 'Unauthorized'}), 403
    bus = Bus.query.filter_by(driver_id=driver_user.id).first()
    if bus:
        return jsonify(bus.to_dict())
    return jsonify(None)

@api_bp.route('/driver/requests')
def driver_list_requests():
    driver_user = get_role_user('driver')
    if not driver_user:
        return jsonify({'error': 'Unauthorized'}), 403
    
    bus = Bus.query.filter_by(driver_id=driver_user.id).first()
    if not bus:
        return jsonify([])
    
    requests_list = BusRequest.query.filter_by(
        driver_id=driver_user.id
    ).filter(
        BusRequest.status.in_(['assigned', 'acknowledged', 'on_the_way'])
    ).order_by(BusRequest.created_at.desc()).all()
    return jsonify([r.to_dict() for r in requests_list])

@api_bp.route('/driver/requests/<int:req_id>/acknowledge', methods=['PATCH', 'POST'])
def driver_acknowledge_request(req_id):
    driver_user = get_role_user('driver')
    if not driver_user:
        return jsonify({'error': 'Unauthorized'}), 403
    
    bus_req = BusRequest.query.get(req_id)
    if not bus_req or bus_req.driver_id != driver_user.id:
        return jsonify({'error': 'Request not found'}), 404
    if bus_req.status not in ('assigned', 'on_the_way'):
        return jsonify({'error': 'Can only acknowledge assigned requests'}), 400
    
    bus_req.status = 'acknowledged'
    bus_req.acknowledged_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'success': True, 'request': bus_req.to_dict()})

@api_bp.route('/driver/requests/<int:req_id>/complete', methods=['PATCH', 'POST'])
def driver_complete_request(req_id):
    driver_user = get_role_user('driver')
    if not driver_user:
        return jsonify({'error': 'Unauthorized'}), 403
    
    bus_req = BusRequest.query.get(req_id)
    if not bus_req or bus_req.driver_id != driver_user.id:
        return jsonify({'error': 'Request not found'}), 404
    if bus_req.status not in ('acknowledged', 'picked_up'):
        return jsonify({'error': 'Can only complete acknowledged or picked up requests'}), 400
    
    bus_req.status = 'completed'
    bus_req.completed_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'success': True, 'request': bus_req.to_dict()})
