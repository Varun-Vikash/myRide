/**
 * myRide@BIT — High-Precision EV Campus Shuttle Simulation Engine
 * 
 * Features:
 * - 60FPS physics loop with distance-based uniform velocity interpolation
 * - True circular closed loops (zero teleportation or skipping)
 * - Dynamic nearest-vehicle dispatch for student ride requests
 * - Dijkstra road navigation from current bus position -> pickup stop -> drop destination
 * - Boarding & dropping dwell stops with real-time status logging:
 *   'on_the_way' -> 'picked_up' -> 'completed'
 * - EV battery physics: depletion on travel, supercharger recovery (2%/s)
 * - Visual EV Supercharger Depot on map with live backup shuttles
 * - Animated mission trajectory lines and pulsating student pickup/drop pins
 */

const STOP_COORDINATES = {
  'Main Gate Station': { x: 1755, y: 481, junction: 1 },
  'Day Scholar Bus Stand': { x: 1539, y: 1265, junction: 11 },
  'Principal & Dean Office': { x: 1817, y: 1417, junction: 15 },
  'AS Main Block': { x: 1555, y: 1669, junction: 111 },
  'AS Academic RIBs': { x: 1842, y: 2001, junction: 27 },
  'Mechanical Engineering Block': { x: 1849, y: 2153, junction: 32 },
  'Fashion Tech Centre': { x: 1871, y: 2648, junction: 48 },
  'Main Store Complex': { x: 1862, y: 2476, junction: 42 },
  'Boys Hostel Station': { x: 2042, y: 2794, junction: 51 },
  'Boys Dining Mess': { x: 2271, y: 2779, junction: 62 },
  'Central Cafeteria': { x: 1615, y: 2800, junction: 84 },
  'Main Auditorium': { x: 1401, y: 2443, junction: 117 },
  'Central Library': { x: 1420, y: 2815, junction: 118 },
  'IB Academic Block': { x: 1219, y: 1675, junction: 142 },
  'Sports & Football Arena': { x: 904, y: 1696, junction: 144 },
  'Girls Hostel Complex': { x: 965, y: 2845, junction: 151 },
  'West Parking Bay': { x: 858, y: 2850, junction: 152 },
  'Campus Medical Centre': { x: 464, y: 2867, junction: 153 },
  'West Gate Terminal': { x: 173, y: 2870, junction: 157 }
};

const SimulationEngine = {
  busConfigs: {
    1: { id: "bus-a", color: "#EF4444", gradStart: "#EF4444", gradMid: "#F87171", gradEnd: "#DC2626", speedFactor: 1.0, speedKmh: 20, defaultSeats: "22/32" },
    2: { id: "bus-b", color: "#3B82F6", gradStart: "#3B82F6", gradMid: "#60A5FA", gradEnd: "#2563EB", speedFactor: 0.95, speedKmh: 18, defaultSeats: "18/32" },
    3: { id: "bus-c", color: "#10B981", gradStart: "#10B981", gradMid: "#34D399", gradEnd: "#059669", speedFactor: 1.05, speedKmh: 22, defaultSeats: "27/32" },
    4: { id: "bus-d", color: "#F59E0B", gradStart: "#F59E0B", gradMid: "#FBBF24", gradEnd: "#D97706", speedFactor: 1.0, speedKmh: 20, defaultSeats: "20/32" },
    5: { id: "bus-e", color: "#8B5CF6", gradStart: "#8B5CF6", gradMid: "#A78BFA", gradEnd: "#7C3AED", speedFactor: 1.02, speedKmh: 21, defaultSeats: "24/32" }
  },

  buses: [],
  routeCache: {},
  isPaused: false,
  simSpeed: 1.0,
  prevTime: performance.now(),
  frameCount: 0,
  fpsClock: performance.now(),
  taskPollInterval: null,
  batterySyncInterval: null,

  async init() {
    try {
      // 1. Fetch fleet state
      const fleet = await API.getFleetState();

      // 2. Fetch routes and precomputed paths
      const routes = await API.getRoutes();
      for (const r of routes) {
        this.routeCache[r.id] = await API.getRoutePath(r.id);
      }

      // 3. Initialize bus runtime structures
      this.initFleetStructures(fleet);

      // 4. Draw route path overlays and stop markers
      this.drawRouteOverlays();

      // Clean up any old depot elements if present
      const oldDepot = document.getElementById('ev-depot-pad');
      if (oldDepot) oldDepot.remove();

      // 6. Create DOM SVG markers for active buses
      this.createBusMarkers();

      // 7. Initialize Dashboard UI
      DashboardUI.init(this.buses, this.routeCache);

      // 8. Start background synchronization (task polling every 3s, battery sync every 30s)
      this.startBackgroundSync();

      // 9. Start requestAnimationFrame physics loop
      requestAnimationFrame(this.loop.bind(this));
    } catch (err) {
      console.error('[SIMULATION] Failed to initialize simulation engine:', err);
    }
  },

  initFleetStructures(fleet) {
    this.buses = fleet.map((item, idx) => {
      const cfg = this.busConfigs[item.id] || {
        id: `bus-${item.id}`,
        color: item.color || '#6366F1',
        gradStart: item.color || '#6366F1',
        gradMid: '#818CF8',
        gradEnd: '#4338CA',
        speedFactor: 1.0,
        speedKmh: 20,
        defaultSeats: '20/32'
      };

      const numOnly = (item.bus_no || '').replace('Bus #', '').replace('Bus ', '');
      const route = this.routeCache[item.route_id];
      const waypoints = (route && route.waypoints) ? route.waypoints : [];

      // Initial stagger on circuit
      let initialWpIndex = 0;
      if (waypoints.length > 0) {
        if (idx === 0) initialWpIndex = Math.floor(waypoints.length * 0.05);
        else if (idx === 1) initialWpIndex = Math.floor(waypoints.length * 0.40);
        else if (idx === 2) initialWpIndex = Math.floor(waypoints.length * 0.75);
      }

      const p0 = waypoints[initialWpIndex] || { x: 1755, y: 481 };

      return {
        id: cfg.id,
        dbId: item.id,
        routeId: item.route_id,
        name: `Bus ${numOnly}`,
        fullName: item.bus_no || `Bus #${numOnly}`,
        routeName: item.route_name || 'Campus Shuttle',
        color: cfg.color,
        gradStart: cfg.gradStart,
        gradMid: cfg.gradMid,
        gradEnd: cfg.gradEnd,
        speedFactor: cfg.speedFactor,
        speedKmh: cfg.speedKmh,
        seats: cfg.defaultSeats,
        capacity: item.capacity || 32,
        battery: typeof item.battery_level === 'number' ? item.battery_level : 100.0,
        busStatus: item.bus_status || 'active', // 'active', 'en_route_pickup', 'returning_to_charge', 'charging', 'backup'
        lapCount: item.lap_count || 0,
        deployTriggered: false,

        // High-Precision Navigation State:
        mode: 'patrol', // 'patrol' | 'pickup' | 'delivery' | 'returning' | 'charging'
        activeWaypoints: waypoints,
        wpIndex: initialWpIndex,
        wpFrac: 0.0,
        currX: p0.x,
        currY: p0.y,
        heading: 0,
        dwellTimer: 0.0,
        currentSpeedKmh: cfg.speedKmh,

        // Mission data:
        activeMission: null
      };
    });
  },

  drawRouteOverlays() {
    const svg = document.getElementById('route-svg');
    if (!svg) return;

    const scale = MapEngine.getScaleFactor();
    let linesHtml = '<g id="route-corridors">';
    const stopsLayer = document.querySelector('.stop-markers-layer') || document.querySelector('.shuttle-markers');

    // Clean up old stop dots so they re-render at the exact scale without floating outside the map
    if (stopsLayer) {
      stopsLayer.querySelectorAll('.bus-stop-dot').forEach(el => el.remove());
    }

    Object.values(this.routeCache).forEach(r => {
      if (!r.waypoints || !r.waypoints.length) return;
      // Filter out any perimeter waypoints beyond the physical campus graphic
      const validWaypoints = r.waypoints.filter(p => p.x <= 2350);
      const pts = validWaypoints.map(p => `${p.x * scale},${p.y * scale}`).join(' ');

      linesHtml += `
        <polyline class="route-polyline" points="${pts}" fill="none" stroke="${r.color}" stroke-width="12" stroke-opacity="0.16" stroke-linecap="round" stroke-linejoin="round" />
        <polyline class="route-polyline" points="${pts}" fill="none" stroke="${r.color}" stroke-width="4.5" stroke-opacity="0.85" stroke-linecap="round" stroke-linejoin="round" />
        <polyline class="route-polyline" points="${pts}" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="8 6" stroke-opacity="0.8" />
      `;

      // Render Stop Markers positioned cleanly at current scale
      if (stopsLayer) {
        r.stops.forEach(st => {
          const wp = validWaypoints.find(w => w.id === st.junction);
          if (wp && wp.x <= 2350) {
            const dot = document.createElement('div');
            dot.className = `bus-stop-dot stop-dot-${r.route_id}`;
            dot.style.left = `${(wp.x * scale) - 6.5}px`;
            dot.style.top = `${(wp.y * scale) - 6.5}px`;
            dot.style.backgroundColor = r.color;
            dot.title = `Stop: ${st.name} (${r.name})`;
            stopsLayer.appendChild(dot);
          }
        });
      }
    });

    linesHtml += '</g><g id="mission-corridor"></g>';
    svg.innerHTML = linesHtml;
  },

  createBusMarkers() {
    const layer = document.querySelector('.shuttle-markers');
    if (!layer) return;

    this.buses.forEach(b => {
      if (b.busStatus === 'backup' || b.busStatus === 'charging') return;
      this.mountBusMarker(b, layer);
    });
  },

  mountBusMarker(b, layer) {
    if (!layer) layer = document.querySelector('.shuttle-markers');
    if (!layer || document.getElementById(b.id)) return;

    const numOnly = b.name.replace('Bus ', '');
    const m = document.createElement('div');
    m.className = 'vehicle-marker';
    m.id = b.id;
    m.title = `${b.fullName} (${b.routeName})`;

    const battColor = b.battery > 50 ? '#22c55e' : b.battery > 20 ? '#eab308' : '#ef4444';

    m.innerHTML = `
      <div class="vehicle-sonar" style="border-color:${b.color}; background:${b.color}22;"></div>

      <div class="vehicle-rotator" id="rotator-${b.id}">
        <div class="vehicle-headlights"></div>

        <svg class="vehicle-svg" viewBox="0 0 34 68" width="34" height="68">
          <defs>
            <linearGradient id="grad-${b.id}" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="${b.gradStart}" />
              <stop offset="45%" stop-color="${b.gradMid}" />
              <stop offset="100%" stop-color="${b.gradEnd}" />
            </linearGradient>
          </defs>

          <!-- 4 Rubber Tires -->
          <rect x="0.5" y="10" width="3.5" height="10" rx="1.5" fill="#0f172a" />
          <rect x="30" y="10" width="3.5" height="10" rx="1.5" fill="#0f172a" />
          <rect x="0.5" y="48" width="3.5" height="10" rx="1.5" fill="#0f172a" />
          <rect x="30" y="48" width="3.5" height="10" rx="1.5" fill="#0f172a" />

          <!-- Main Aerodynamic Body Shell -->
          <rect x="3" y="2" width="28" height="64" rx="7" fill="url(#grad-${b.id})" stroke="#ffffff" stroke-width="1.3" />

          <!-- Front Panoramic Windshield -->
          <path d="M 6 13 Q 17 8 28 13 L 27 20 Q 17 16 7 20 Z" fill="#0f172a" opacity="0.92" />
          <path d="M 8 14 Q 13 11 19 12" stroke="rgba(255,255,255,0.5)" stroke-width="1.2" fill="none" stroke-linecap="round" />

          <!-- Passenger Windows -->
          <rect x="4.5" y="24" width="2.5" height="7" rx="1" fill="#0f172a" opacity="0.85" />
          <rect x="4.5" y="33" width="2.5" height="7" rx="1" fill="#0f172a" opacity="0.85" />
          <rect x="4.5" y="42" width="2.5" height="7" rx="1" fill="#0f172a" opacity="0.85" />
          <rect x="27" y="24" width="2.5" height="7" rx="1" fill="#0f172a" opacity="0.85" />
          <rect x="27" y="33" width="2.5" height="7" rx="1" fill="#0f172a" opacity="0.85" />
          <rect x="27" y="42" width="2.5" height="7" rx="1" fill="#0f172a" opacity="0.85" />

          <!-- Roof Climate Unit -->
          <rect x="9.5" y="26" width="15" height="23" rx="2.5" fill="#ffffff" opacity="0.25" stroke="#ffffff" stroke-width="0.6" />
          <line x1="12" y1="30" x2="22" y2="30" stroke="#ffffff" stroke-width="0.8" opacity="0.5" />
          <line x1="12" y1="34" x2="22" y2="34" stroke="#ffffff" stroke-width="0.8" opacity="0.5" />
          <line x1="12" y1="38" x2="22" y2="38" stroke="#ffffff" stroke-width="0.8" opacity="0.5" />

          <!-- Fleet Number -->
          <text x="17" y="22" text-anchor="middle" font-family="'Inter', sans-serif" font-weight="900" font-size="7.5px" fill="#ffffff">${numOnly}</text>

          <!-- Headlights -->
          <circle cx="6" cy="4" r="2.2" fill="#FEF08A" />
          <circle cx="28" cy="4" r="2.2" fill="#FEF08A" />

          <!-- Tail Lights -->
          <rect x="4.5" y="63" width="4" height="2" rx="0.8" fill="#EF4444" />
          <rect x="25.5" y="63" width="4" height="2" rx="0.8" fill="#EF4444" />
        </svg>
      </div>

      <!-- Upright Horizontal Status Badge -->
      <div class="vehicle-badge" id="badge-${b.id}" style="border-left: 3.5px solid ${b.color};">
        <span class="badge-status-dot" id="dot-${b.id}"></span>
        <span id="badge-name-${b.id}">${b.name}</span>
        <span class="badge-battery" id="badge-batt-${b.id}" style="color:${battColor}; font-weight:800;">⚡${Math.round(b.battery)}%</span>
        <span class="badge-task-text" id="badge-task-${b.id}" style="display:none; font-size:10px; padding:1px 6px; border-radius:10px; background:#8b5cf6; color:#fff;">🎒 ON MISSION</span>
      </div>

      <!-- Floating Hover Tooltip -->
      <div class="vehicle-card" id="card-${b.id}">
        <div class="card-head" style="background: linear-gradient(135deg, ${b.gradStart}, ${b.gradEnd});">
          <span class="card-title"><span>🚌</span> ${b.fullName}</span>
          <span class="card-speed" id="spd-${b.id}">${b.speedKmh} km/h</span>
        </div>
        <div class="card-body">
          <div class="card-row">
            <span class="row-label">Route</span>
            <span class="row-val" id="hov-route-${b.id}">${b.routeName}</span>
          </div>
          <div class="card-row">
            <span class="row-label">Next Stop</span>
            <span class="row-val highlight" id="hov-next-${b.id}">...</span>
          </div>
          <div class="card-row">
            <span class="row-label">Battery</span>
            <span class="row-val" id="hov-batt-${b.id}" style="color:${battColor}; font-weight:bold;">⚡ ${Math.round(b.battery)}%</span>
          </div>
          <div class="card-row">
            <span class="row-label">Mission</span>
            <span class="row-val" id="hov-mission-${b.id}">None (On Schedule)</span>
          </div>
          <div class="card-row">
            <span class="row-label">Status</span>
            <span class="row-val green" id="hov-status-${b.id}">● On Schedule</span>
          </div>
        </div>
      </div>
    `;

    m.onclick = () => this.focusBus(b.id);
    layer.appendChild(m);
  },

  focusBus(busId) {
    const b = this.buses.find(x => x.id === busId);
    if (!b) return;

    MapEngine.scrollToPoint(b.currX, b.currY, true);

    const marker = document.getElementById(busId);
    if (marker) {
      marker.classList.remove('vehicle-focused');
      void marker.offsetWidth;
      marker.classList.add('vehicle-focused');
      setTimeout(() => marker.classList.remove('vehicle-focused'), 1600);
    }
  },

  loop(currTime) {
    const dt = (currTime - this.prevTime) / 1000;
    this.prevTime = currTime;

    // Telemetry FPS Monitor
    this.frameCount++;
    if (currTime - this.fpsClock >= 1000) {
      const liveFps = Math.round((this.frameCount * 1000) / (currTime - this.fpsClock));
      const cleanFps = Math.min(liveFps, 60.0).toFixed(1);
      DashboardUI.updateFps(cleanFps);
      this.frameCount = 0;
      this.fpsClock = currTime;
    }

    if (!this.isPaused && dt > 0 && dt < 1.0) {
      const scale = MapEngine.getScaleFactor();
      const visualScale = Math.max(0.72, scale);

      this.buses.forEach(b => {
        // ── 1. Charging at Depot ──
        if (b.busStatus === 'charging') {
          b.battery = Math.min(100.0, b.battery + 2.0 * dt);
          if (b.battery >= 100.0) {
            b.busStatus = 'backup';
            b.deployTriggered = false;
            API.updateBusStatus(b.dbId, 'backup', 100.0).catch(console.warn);
          }
          return;
        }

        // ── 2. Parked Backup at Depot ──
        if (b.busStatus === 'backup') {
          if (b.battery < 100.0) b.battery = Math.min(100.0, b.battery + 2.0 * dt);
          return;
        }

        // ── 3. Active Vehicle Physics & Navigation ──
        this.stepBusPhysics(b, dt, scale, visualScale);
      });

      // Synchronize Mission Overlays and Charging HUD
      this.renderMissionOverlays(scale);
      DashboardUI.updateChargingStation(this.buses);
    }

    requestAnimationFrame(this.loop.bind(this));
  },

  stepBusPhysics(b, dt, scale, visualScale) {
    // ── Handle Dwell Time (Boarding / Dropping Off Passengers) ──
    if (b.dwellTimer > 0) {
      b.dwellTimer -= dt;
      b.currentSpeedKmh = 0;
      this.updateMarkerVisual(b, scale, visualScale);
      return;
    }

    b.currentSpeedKmh = b.speedKmh;

    const waypoints = b.activeWaypoints;
    if (!waypoints || waypoints.length < 2) return;

    // Distance step based on speed: ~38 pixels per second at 20 km/h (1.0x)
    const baseSpeedPx = 36 * b.speedFactor * this.simSpeed;
    let stepDist = baseSpeedPx * dt;

    // Battery Depletion proportional to distance traveled
    b.battery = Math.max(0.0, b.battery - (stepDist * 0.0018));

    if (b.battery < 20.0 && b.battery >= 15.0 && b.busStatus === 'active') {
      b.busStatus = 'returning_to_charge';
      API.updateBusStatus(b.dbId, 'returning_to_charge', b.battery).catch(console.warn);
    }

    if (b.battery < 15.0 && b.busStatus !== 'charging' && !b.deployTriggered) {
      b.deployTriggered = true;
      this.triggerBackupDeployment(b);
    }

    // Traverse Waypoint Segments
    while (stepDist > 0 && b.wpIndex < waypoints.length - 1) {
      const p1 = waypoints[b.wpIndex];
      const p2 = waypoints[b.wpIndex + 1];
      const segDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (segDist === 0) {
        b.wpIndex++;
        continue;
      }

      const distRemainingInSeg = segDist * (1.0 - b.wpFrac);

      if (stepDist < distRemainingInSeg) {
        b.wpFrac += stepDist / segDist;
        stepDist = 0;
      } else {
        stepDist -= distRemainingInSeg;
        b.wpIndex++;
        b.wpFrac = 0.0;
      }
    }

    // Check if reached end of active waypoint sequence
    if (b.wpIndex >= waypoints.length - 1) {
      this.handlePathCompletion(b);
      return;
    }

    // Interpolate current position
    const p1 = waypoints[b.wpIndex];
    const p2 = waypoints[Math.min(b.wpIndex + 1, waypoints.length - 1)];
    b.currX = p1.x + (p2.x - p1.x) * b.wpFrac;
    b.currY = p1.y + (p2.y - p1.y) * b.wpFrac;

    // Smooth heading angle interpolation
    const targetAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI) + 90;
    let angleDiff = (targetAngle - b.heading + 540) % 360 - 180;
    b.heading += angleDiff * Math.min(1.0, 14 * dt);

    // Update DOM marker position and cards
    this.updateMarkerVisual(b, scale, visualScale);
  },

  async handlePathCompletion(b) {
    if (b.mode === 'patrol') {
      // Completed 1 full circular lap!
      b.wpIndex = 0;
      b.wpFrac = 0.0;
      b.lapCount++;
      return;
    }

    if (b.mode === 'pickup') {
      // ── Reached Student Pickup Stop! ──
      b.dwellTimer = 2.8; // Boarding stop
      b.currentSpeedKmh = 0;

      const mission = b.activeMission;
      if (mission) {
        mission.phase = 'picked_up';
        b.taskPhase = 'picked_up';
        API.markPickedUp(mission.requestId).catch(console.warn);

        // Fetch navigation path from pickup stop to drop destination
        try {
          const nav = await API.getNavigation(null, null, mission.dropStop, mission.pickupStop);
          if (nav && nav.waypoints && nav.waypoints.length > 1) {
            b.mode = 'delivery';
            b.activeWaypoints = nav.waypoints;
            b.wpIndex = 0;
            b.wpFrac = 0.0;
            return;
          }
        } catch (e) {
          console.error('[SIMULATION] Failed to route to drop stop:', e);
        }
      }

      // Fallback: return to patrol
      this.resumePatrolRoute(b);
      return;
    }

    if (b.mode === 'delivery') {
      // ── Reached Student Drop Destination! ──
      b.dwellTimer = 2.8; // Dropping off
      b.currentSpeedKmh = 0;

      const mission = b.activeMission;
      if (mission) {
        mission.phase = 'completed';
        API.markDropped(mission.requestId).catch(console.warn);
      }

      b.activeMission = null;
      b.taskPhase = null;
      b.busStatus = 'active';

      // Resume regular circular route smoothly
      this.resumePatrolRoute(b);
      return;
    }

    if (b.mode === 'returning') {
      // Rejoined regular route!
      const r = this.routeCache[b.routeId];
      if (r && r.waypoints) {
        b.mode = 'patrol';
        b.activeWaypoints = r.waypoints;
        b.wpIndex = 0;
        b.wpFrac = 0.0;
      }
    }
  },

  resumePatrolRoute(b) {
    const r = this.routeCache[b.routeId];
    if (!r || !r.waypoints || !r.waypoints.length) return;

    // Find nearest waypoint on regular route from current location
    let bestIdx = 0;
    let minDist = Infinity;
    r.waypoints.forEach((wp, idx) => {
      const d = Math.hypot(wp.x - b.currX, wp.y - b.currY);
      if (d < minDist) {
        minDist = d;
        bestIdx = idx;
      }
    });

    b.mode = 'patrol';
    b.activeWaypoints = r.waypoints;
    b.wpIndex = bestIdx;
    b.wpFrac = 0.0;
  },

  updateMarkerVisual(b, scale, visualScale) {
    const marker = document.getElementById(b.id);
    if (!marker) return;

    marker.style.left = `${(b.currX * scale) - 17}px`;
    marker.style.top = `${(b.currY * scale) - 34}px`;
    marker.style.transform = `scale(${visualScale})`;

    const rotator = document.getElementById(`rotator-${b.id}`);
    if (rotator) {
      rotator.style.transform = `rotate(${b.heading}deg)`;
    }

    // Battery Color Coding
    const battColor = b.battery > 50 ? '#22c55e' : b.battery > 20 ? '#eab308' : '#ef4444';
    const badgeBatt = document.getElementById(`badge-batt-${b.id}`);
    if (badgeBatt) {
      badgeBatt.textContent = `⚡${Math.round(b.battery)}%`;
      badgeBatt.style.color = battColor;
    }

    // Task badge text on marker
    const badgeTask = document.getElementById(`badge-task-${b.id}`);
    const dot = document.getElementById(`dot-${b.id}`);

    if (b.activeMission) {
      badgeTask.style.display = 'inline-block';
      if (b.activeMission.phase === 'picked_up') {
        badgeTask.textContent = `🎒 ONBOARD → ${b.activeMission.dropStop}`;
        badgeTask.style.background = '#10b981';
      } else {
        badgeTask.textContent = `🎒 EN ROUTE → ${b.activeMission.pickupStop}`;
        badgeTask.style.background = '#8b5cf6';
      }
      if (dot) {
        dot.style.background = '#8b5cf6';
        dot.style.boxShadow = '0 0 8px #8b5cf6';
      }
    } else {
      badgeTask.style.display = 'none';
      if (dot) {
        const dotColor = b.busStatus === 'returning_to_charge' ? '#ef4444' : '#22c55e';
        dot.style.background = dotColor;
        dot.style.boxShadow = `0 0 6px ${dotColor}`;
      }
    }

    // Hover card telemetry
    $(`#spd-${b.id}`).text(`${Math.round(b.currentSpeedKmh * this.simSpeed)} km/h`);
    $(`#hov-batt-${b.id}`).text(`⚡ ${Math.round(b.battery)}%`).css('color', battColor);

    const hovMission = document.getElementById(`hov-mission-${b.id}`);
    if (hovMission) {
      if (b.activeMission) {
        const phaseStr = b.activeMission.phase === 'picked_up' ? 'En Route to Dropoff' : 'Heading to Pickup';
        hovMission.textContent = `${b.activeMission.studentName} (${phaseStr})`;
        hovMission.style.color = '#a78bfa';
      } else {
        hovMission.textContent = 'None (Regular Patrol)';
        hovMission.style.color = 'var(--text-muted, #94a3b8)';
      }
    }

    // Find nearest stop for HUD
    const r = this.routeCache[b.routeId];
    if (r && r.stops) {
      const sCount = r.stops.length;
      const approxStopIdx = Math.floor((b.wpIndex / Math.max(1, b.activeWaypoints.length)) * sCount) % sCount;
      const currStop = r.stops[approxStopIdx] || r.stops[0];
      const nextStop = r.stops[(approxStopIdx + 1) % sCount] || r.stops[0];
      $(`#hov-next-${b.id}`).text(b.activeMission ? (b.activeMission.phase === 'picked_up' ? b.activeMission.dropStop : b.activeMission.pickupStop) : nextStop.name);

      DashboardUI.updateBusCard(b, currStop.name, nextStop.name, (b.wpIndex / Math.max(1, b.activeWaypoints.length)), this.simSpeed);
    }
  },

  renderMissionOverlays(scale) {
    const container = document.getElementById('mission-corridor');
    const shuttleLayer = document.querySelector('.shuttle-markers');
    if (!container || !shuttleLayer) return;

    let polylines = '';
    const activeMissions = this.buses.filter(b => b.activeMission && b.activeWaypoints && b.activeWaypoints.length > 1);

    // Update or clear mission pins
    let missionPin = document.getElementById('mission-live-pin');

    if (activeMissions.length === 0) {
      container.innerHTML = '';
      if (missionPin) missionPin.remove();
      return;
    }

    const primaryBus = activeMissions[0];
    const mission = primaryBus.activeMission;

    // Draw active navigation polyline corridor (guarantee valid campus map coordinates)
    const validWaypoints = (primaryBus.activeWaypoints || []).filter(p => p.x <= 2350);
    if (validWaypoints.length < 2) {
      container.innerHTML = '';
      if (missionPin) missionPin.remove();
      return;
    }

    const pts = validWaypoints.map(p => `${p.x * scale},${p.y * scale}`).join(' ');
    const corridorColor = mission.phase === 'picked_up' ? '#10b981' : '#a855f7';

    polylines += `
      <polyline points="${pts}" fill="none" stroke="${corridorColor}" stroke-width="8" stroke-opacity="0.3" stroke-linecap="round" stroke-linejoin="round" />
      <polyline class="mission-polyline" points="${pts}" fill="none" stroke="${corridorColor}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
    `;
    container.innerHTML = polylines;

    // Render / update live student destination/pickup pin
    if (!missionPin) {
      missionPin = document.createElement('div');
      missionPin.className = 'mission-marker';
      missionPin.id = 'mission-live-pin';
      shuttleLayer.appendChild(missionPin);
    }

    const rawCoord = (mission.phase === 'picked_up') ? mission.dropCoord : mission.pickupCoord;
    const targetCoord = (rawCoord && rawCoord.x <= 2350) ? rawCoord : null;
    if (targetCoord) {
      missionPin.style.left = `${targetCoord.x * scale}px`;
      missionPin.style.top = `${targetCoord.y * scale}px`;

      const isDrop = mission.phase === 'picked_up';
      const label = isDrop ? `🎯 Destination: ${mission.dropStop}` : `🎒 Pickup: ${mission.studentName} (${mission.pickupStop})`;

      missionPin.innerHTML = `
        <div class="mission-bubble ${isDrop ? 'drop' : ''}">
          <span>${label}</span>
        </div>
        <div class="mission-bubble-pulse"></div>
      `;
    } else if (missionPin) {
      missionPin.remove();
    }
  },

  async triggerBackupDeployment(retiringBus) {
    try {
      const res = await API.deployBackup(retiringBus.dbId);
      if (res && res.success && res.deployed) {
        retiringBus.busStatus = 'charging';
        const retiringMarker = document.getElementById(retiringBus.id);
        if (retiringMarker) retiringMarker.style.display = 'none';

        const backupBus = this.buses.find(x => x.dbId === res.deployed.id);
        if (backupBus) {
          backupBus.busStatus = 'active';
          backupBus.routeId = retiringBus.routeId;
          backupBus.routeName = retiringBus.routeName;
          backupBus.currX = retiringBus.currX;
          backupBus.currY = retiringBus.currY;
          backupBus.wpIndex = retiringBus.wpIndex;
          backupBus.wpFrac = retiringBus.wpFrac;
          backupBus.activeWaypoints = retiringBus.activeWaypoints;
          backupBus.lapCount = 0;
          backupBus.deployTriggered = false;

          const existing = document.getElementById(backupBus.id);
          if (!existing) {
            this.mountBusMarker(backupBus);
          } else {
            existing.style.display = 'flex';
          }
        }

        DashboardUI.renderBusCards(this.buses.filter(b => b.busStatus !== 'backup' && b.busStatus !== 'charging'));
      }
    } catch (err) {
      console.error('[SIMULATION] Failed to deploy backup bus:', err);
      retiringBus.deployTriggered = false;
    }
  },

  startBackgroundSync() {
    // ── 1. Poll student pickup requests every 3 seconds ──
    this.taskPollInterval = setInterval(async () => {
      try {
        const pending = await API.getPendingDispatch();
        if (Array.isArray(pending) && pending.length > 0) {
          for (const req of pending) {
            // Check if already being handled by a bus
            const isHandled = this.buses.some(b => b.activeMission && b.activeMission.requestId === req.id);
            if (isHandled) continue;

            // Find designated or closest active bus
            let targetBus = this.buses.find(b => b.dbId === req.bus_id && b.busStatus !== 'charging' && b.busStatus !== 'backup');
            
            if (!targetBus) {
              // Find free active bus closest to pickup stop
              const freeBuses = this.buses.filter(b => !b.activeMission && (b.busStatus === 'active') && b.battery > 20);
              const pickupCoord = STOP_COORDINATES[req.pickup_stop] || { x: 1755, y: 481 };

              if (freeBuses.length > 0) {
                targetBus = freeBuses.sort((a, b) => {
                  const da = Math.hypot(a.currX - pickupCoord.x, a.currY - pickupCoord.y);
                  const db = Math.hypot(b.currX - pickupCoord.x, b.currY - pickupCoord.y);
                  return da - db;
                })[0];
              }
            }

            if (targetBus && !targetBus.activeMission) {
              await this.dispatchBusToMission(targetBus, req);
              break; // Handle one new mission per tick
            }
          }
        }
      } catch (err) {
        // Silent retry
      }
    }, 3000);

    // ── 2. Sync battery levels every 30 seconds ──
    this.batterySyncInterval = setInterval(() => {
      this.buses.forEach(b => {
        API.updateBattery(b.dbId, Math.round(b.battery * 10) / 10, b.lapCount).catch(() => {});
      });
    }, 30000);
  },

  async dispatchBusToMission(bus, req) {
    const pickupCoord = STOP_COORDINATES[req.pickup_stop] || { x: 1755, y: 481 };
    const dropCoord = STOP_COORDINATES[req.drop_stop] || { x: 1420, y: 2815 };

    try {
      // Calculate Dijkstra route from current bus position to pickup stop
      const nav = await API.getNavigation(Math.round(bus.currX), Math.round(bus.currY), req.pickup_stop);
      if (nav && nav.waypoints && nav.waypoints.length > 1) {
        bus.activeMission = {
          requestId: req.id,
          studentName: req.student_name || 'Student',
          pickupStop: req.pickup_stop,
          dropStop: req.drop_stop,
          pickupCoord: pickupCoord,
          dropCoord: dropCoord,
          phase: 'on_the_way'
        };

        bus.mode = 'pickup';
        bus.busStatus = 'en_route_pickup';
        bus.taskPhase = 'on_the_way';
        bus.activeWaypoints = nav.waypoints;
        bus.wpIndex = 0;
        bus.wpFrac = 0.0;
        bus.dwellTimer = 0.0;

        await API.markOnTheWay(req.id);
      }
    } catch (err) {
      console.error('[SIMULATION] Failed to dispatch bus to mission:', err);
    }
  }
};
