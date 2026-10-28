/**
 * myRide@BIT — EV Campus Shuttle Dashboard UI Controller
 * 
 * Manages the collapsible live telemetry widget, active EV shuttle cards,
 * real-time battery level gauges, circular route lap counters,
 * and the charging station backup fleet monitor.
 */

const DashboardUI = {
  busesRef: [],
  routeCacheRef: {},

  /**
   * Initialize Dashboard UI with fleet and route references
   */
  init(buses, routeCache) {
    this.busesRef = buses;
    this.routeCacheRef = routeCache;

    // Filter active running buses for primary transit cards
    const activeBuses = buses.filter(b => b.busStatus !== 'backup' && b.busStatus !== 'charging');
    this.renderBusCards(activeBuses);
    this.updateChargingStation(buses);
    this.bindControls();
  },

  /**
   * Render active shuttle bus cards inside the widget
   */
  renderBusCards(activeBuses) {
    const container = document.getElementById('bus-cards-list');
    if (!container) return;
    container.innerHTML = '';

    activeBuses.forEach(b => {
      const battColor = b.battery > 50 ? '#22c55e' : b.battery > 20 ? '#eab308' : '#ef4444';
      const statusText = b.busStatus === 'en_route_pickup' ? '🎒 On Pickup' 
                       : b.busStatus === 'returning_to_charge' ? '⚡ Low Battery' 
                       : '● Active';
      const statusColor = b.busStatus === 'en_route_pickup' ? '#3b82f6' 
                        : b.busStatus === 'returning_to_charge' ? '#ef4444' 
                        : '#22c55e';

      const card = document.createElement('div');
      card.className = 'bus-row-card';
      card.id = `card-${b.id}`;
      card.style.borderLeftColor = b.color;
      card.style.background = 'var(--bg-card, #1e1f26)';
      card.style.border = '1px solid var(--border-color, #363842)';
      card.style.borderRadius = '8px';
      card.style.padding = '8px 10px';
      card.style.marginBottom = '7px';
      card.style.color = 'var(--text-main, #f8fafc)';

      card.innerHTML = `
        <div class="bus-row-card-top" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span class="bus-row-title" style="font-weight:700; font-size:0.83rem; color:var(--text-main, #f8fafc);">
            ${b.name} <span style="font-size:0.75rem; color:var(--text-muted, #94a3b8); font-weight:normal;">(${b.routeName})</span>
          </span>
          <span class="bus-locate-link" style="font-size:0.72rem; color:var(--btn-purple, #6366f1); font-weight:700; cursor:pointer;" onclick="SimulationEngine.focusBus('${b.id}')">Locate</span>
        </div>

        <div class="bus-row-info" style="display:flex; justify-content:space-between; font-size:0.73rem; color:var(--text-muted, #94a3b8);">
          <span>Stop: <strong id="${b.id}-curr" style="color:var(--text-main, #f8fafc);">...</strong></span>
          <span>Next: <strong id="${b.id}-next" style="color:var(--text-main, #f8fafc);">...</strong></span>
        </div>

        <div class="bus-row-info" style="display:flex; justify-content:space-between; font-size:0.73rem; color:var(--text-muted, #94a3b8); margin-top:3px;">
          <span>ETA: <strong id="${b.id}-eta" style="color:#e67e22;">...</strong></span>
          <span>Lap: <strong id="${b.id}-lap" style="color:var(--text-main, #f8fafc);">${b.lapCount}</strong></span>
          <span>Seats: <strong style="color:#22c55e;">${b.seats}</strong></span>
        </div>

        <div class="bus-row-info" style="display:flex; justify-content:space-between; align-items:center; font-size:0.73rem; margin-top:3px;">
          <span>Status: <strong id="${b.id}-status" style="color:${statusColor}; font-weight:700;">${statusText}</strong></span>
          <span>Battery: <strong id="${b.id}-batt-txt" style="color:${battColor}; font-weight:800;">⚡ ${Math.round(b.battery)}%</strong></span>
        </div>

        <!-- Battery level horizontal gauge -->
        <div style="width:100%; height:4px; background:rgba(255,255,255,0.08); border-radius:2px; margin-top:5px; overflow:hidden;">
          <div id="${b.id}-batt-fill" style="height:100%; width:${Math.max(0, Math.min(100, Math.round(b.battery)))}%; background:${battColor}; transition:width 0.3s ease, background 0.3s ease;"></div>
        </div>

        <!-- Segment progress indicator -->
        <div class="bus-row-progress" style="width:100%; height:3px; background:rgba(255,255,255,0.06); border-radius:2px; margin-top:4px; overflow:hidden;">
          <div class="bus-row-progress-fill" id="${b.id}-fill" style="height:100%; width:0%; background:${b.color}; transition:width 0.2s linear;"></div>
        </div>
      `;

      container.appendChild(card);
    });
  },

  /**
   * Update active bus card telemetry every animation frame
   */
  updateBusCard(bus, currStop, nextStop, segProgress, simSpeed) {
    const busId = bus.id;
    $(`#${busId}-curr`).text(currStop);
    $(`#${busId}-next`).text(nextStop);
    $(`#hov-next-${busId}`).text(nextStop);
    $(`#${busId}-fill`).css('width', `${Math.round(segProgress * 100)}%`);

    const etaSec = Math.max(1, Math.round((1 - segProgress) * 75 / simSpeed));
    $(`#${busId}-eta`).text(`${etaSec}s`);
    $(`#${busId}-lap`).text(bus.lapCount);

    // Battery bar and percentage
    const roundedBatt = Math.max(0, Math.min(100, Math.round(bus.battery)));
    const battColor = bus.battery > 50 ? '#22c55e' : bus.battery > 20 ? '#eab308' : '#ef4444';
    
    $(`#${busId}-batt-txt`).text(`⚡ ${roundedBatt}%`).css('color', battColor);
    $(`#${busId}-batt-fill`).css({
      'width': `${roundedBatt}%`,
      'background': battColor
    });

    // Operational Status
    let statusText = '● Active';
    let statusColor = '#22c55e';
    if (bus.dwellTimer > 0) {
      statusText = bus.mode === 'pickup' ? '🎒 Boarding...' : '🏁 Dropping off...';
      statusColor = '#f59e0b';
    } else if (bus.activeMission) {
      if (bus.activeMission.phase === 'picked_up') {
        statusText = `🎒 Onboard → ${bus.activeMission.dropStop}`;
        statusColor = '#10b981';
      } else {
        statusText = `🎒 Pickup → ${bus.activeMission.pickupStop}`;
        statusColor = '#8b5cf6';
      }
    } else if (bus.busStatus === 'returning_to_charge') {
      statusText = '⚡ Low Battery';
      statusColor = '#ef4444';
    }

    $(`#${busId}-status`).text(statusText).css('color', statusColor);
  },

  /**
   * Update Charging Station backup fleet monitor
   */
  updateChargingStation(buses) {
    const listEl = document.getElementById('charging-bus-list');
    if (!listEl) return;

    const stationBuses = buses.filter(b => b.busStatus === 'backup' || b.busStatus === 'charging');
    if (stationBuses.length === 0) {
      listEl.innerHTML = '<span style="color:var(--text-muted, #94a3b8); font-size:0.7rem;">All EV shuttles deployed on campus routes</span>';
      return;
    }

    let html = '<div style="display:flex; flex-direction:column; gap:4px;">';
    stationBuses.forEach(b => {
      const battVal = Math.round(b.battery);
      const battColor = b.battery > 50 ? '#22c55e' : b.battery > 20 ? '#eab308' : '#ef4444';
      const isCharging = b.busStatus === 'charging';
      const badgeText = isCharging ? '[CHARGING]' : '[READY]';
      const badgeBg = isCharging ? 'rgba(234, 179, 8, 0.15)' : 'rgba(34, 197, 94, 0.15)';
      const badgeColor = isCharging ? '#eab308' : '#22c55e';

      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:2px 0; border-bottom:1px dashed rgba(255,255,255,0.05);">
          <span><strong>${b.fullName}</strong></span>
          <span style="color:${battColor}; font-weight:700;">⚡${battVal}%</span>
          <span style="font-size:0.65rem; padding:1px 6px; border-radius:4px; background:${badgeBg}; color:${badgeColor}; font-weight:bold; letter-spacing:0.3px;">
            ${badgeText}
          </span>
        </div>
      `;
    });
    html += '</div>';

    listEl.innerHTML = html;
  },

  /**
   * Telemetry FPS meter update
   */
  updateFps(fps) {
    $('#tele-fps').text(fps);
  },

  /**
   * Bind interactive widget control listeners
   */
  bindControls() {
    // 1. Toggle widget collapse / expand
    $('#widget-toggle').off('click').on('click', () => {
      $('#widget-content').slideToggle(200);
      const arrow = $('#widget-arrow');
      arrow.text(arrow.text() === '▼' ? '▲' : '▼');
    });

    // 2. Play / Pause simulation toggle
    $('#btn-sim-pause').off('click').on('click', function() {
      SimulationEngine.isPaused = !SimulationEngine.isPaused;
      $(this).text(SimulationEngine.isPaused ? '▶ Resume' : '⏸ Pause');
    });

    // 3. Quick recenter map button
    $('#btn-widget-center').off('click').on('click', () => {
      if (typeof MapEngine !== 'undefined' && MapEngine.centerCampus) {
        MapEngine.centerCampus();
      }
    });

    // 4. Speed multiplier selector
    $('#sim-speed-select').off('change').on('change', function() {
      SimulationEngine.simSpeed = parseFloat($(this).val()) || 1.0;
    });
  }
};
