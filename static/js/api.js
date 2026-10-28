const API = {
  async getRoutes() {
    const res = await fetch('/api/routes');
    return await res.json();
  },

  async getRoutePath(routeId) {
    const res = await fetch(`/api/routes/${routeId}/path`);
    return await res.json();
  },

  async getTags(level) {
    const res = await fetch(`/api/map/tags/${level}`);
    return await res.json();
  },

  async getLegends(level) {
    const res = await fetch(`/api/map/legends/${level}`);
    return await res.json();
  },

  async search(query) {
    const res = await fetch(`/api/map/search?query=${encodeURIComponent(query)}`);
    return await res.json();
  },

  async getLocation(id) {
    const res = await fetch(`/api/map/location/${id}`);
    return await res.json();
  },

  async getDetails(id, level = 4) {
    const res = await fetch(`/api/map/details/${id}?level=${level}`);
    return await res.json();
  },

  async getMetrics() {
    const res = await fetch('/api/metrics');
    return await res.json();
  },

  // ── EV Fleet Simulation API ──

  async getFleetState() {
    const res = await fetch('/api/fleet/state');
    return await res.json();
  },

  async updateBattery(busDbId, batteryLevel, lapCount) {
    const res = await fetch(`/api/fleet/bus/${busDbId}/battery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ battery_level: batteryLevel, lap_count: lapCount })
    });
    return await res.json();
  },

  async updateBusStatus(busDbId, busStatus, batteryLevel) {
    const res = await fetch(`/api/fleet/bus/${busDbId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bus_status: busStatus, battery_level: batteryLevel })
    });
    return await res.json();
  },

  async deployBackup(retiringBusId) {
    const res = await fetch('/api/fleet/deploy-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ retiring_bus_id: retiringBusId })
    });
    return await res.json();
  },

  async getPendingDispatch() {
    const res = await fetch('/api/fleet/requests/pending-for-dispatch');
    return await res.json();
  },

  async markOnTheWay(reqId) {
    const res = await fetch(`/api/fleet/requests/${reqId}/on-the-way`, { method: 'POST' });
    return await res.json();
  },

  async markPickedUp(reqId) {
    const res = await fetch(`/api/fleet/requests/${reqId}/picked-up`, { method: 'POST' });
    return await res.json();
  },

  async getNavigation(fromX, fromY, toStop, fromStop) {
    let url = '/api/fleet/navigate?';
    if (fromStop && toStop) {
      url += `from_stop=${encodeURIComponent(fromStop)}&to_stop=${encodeURIComponent(toStop)}`;
    } else {
      url += `from_x=${fromX}&from_y=${fromY}&to_stop=${encodeURIComponent(toStop)}`;
    }
    const res = await fetch(url);
    return await res.json();
  },

  async markDropped(reqId) {
    const res = await fetch(`/api/fleet/requests/${reqId}/dropped`, { method: 'POST' });
    return await res.json();
  }
};
