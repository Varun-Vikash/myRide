const MapEngine = {
  zoomLevel: 4,
  baseWidth: 3420,
  baseHeight: 3876,
  viewport: null,
  stage: null,
  tagCache: {},
  legendCache: {},
  _currentZoomRequestId: 0,
  pinBaseX: null,
  pinBaseY: null,

  async init() {
    this.viewport = document.querySelector('.bg-map');
    this.stage = document.getElementById('map-stage') || this.viewport;
    
    // Parse URL params (for shared pin links)
    const params = new URLSearchParams(window.location.search);
    const lvl = parseInt(params.get('level')) || 4;
    const isPinned = params.get('pin') === 'true';
    const hasCustomPos = params.has('left') && params.has('top');
    const customX = parseInt(params.get('left')) || 1750;
    const customY = parseInt(params.get('top')) || 1950;

    // Prefetch all zoom levels in background for instant, race-free zooming
    this.prefetchData();

    await this.setZoom(lvl);

    // Reliable Multi-Phase Centering (prevents left-corner browser clamping)
    const doCenter = () => {
      if (hasCustomPos) {
        this.scrollToPoint(customX, customY, false);
      } else {
        this.centerOnCampus(false);
      }
    };

    doCenter();
    requestAnimationFrame(doCenter);
    setTimeout(doCenter, 100);
    setTimeout(doCenter, 300);
    setTimeout(doCenter, 800);

    window.addEventListener('load', doCenter);
    window.addEventListener('resize', () => {
      // Re-center if map is zoomed out and smaller than screen
      const scale = this.getScaleFactor();
      const currentW = this.baseWidth * scale;
      if (currentW < window.innerWidth) {
        this.centerOnCampus(false);
      }
    });

    if (isPinned) {
      this.dropPin(customX, customY);
    }

    this.initTheme();
    this.bindMovements();
    this.bindControls();
    this.bindInstructionBox();
  },

  async prefetchData() {
    [1, 2, 3, 4].forEach(async (lvl) => {
      try {
        if (!this.tagCache[lvl]) {
          this.tagCache[lvl] = await API.getTags(lvl);
        }
        if (!this.legendCache[lvl]) {
          this.legendCache[lvl] = await API.getLegends(lvl);
        }
      } catch (err) {
        console.warn(`Prefetch error for level ${lvl}:`, err);
      }
    });
  },

  getScaleFactor() {
    let s = 1.0;
    let i = 4;
    while (i > this.zoomLevel) {
      s /= 1.5;
      i--;
    }
    return s;
  },

  // --- CENTER ON BITSATHY CAMPUS ---
  centerOnCampus(animate = true) {
    const scale = this.getScaleFactor();
    // Centroid of main academic buildings (SF Block, Central Library, Mech, AS blocks)
    const targetX = 1750 * scale;
    const targetY = 1950 * scale;

    const vpW = this.viewport.clientWidth || window.innerWidth;
    const vpH = this.viewport.clientHeight || window.innerHeight;

    const destX = Math.max(0, targetX - (vpW / 2));
    const destY = Math.max(0, targetY - (vpH / 2));

    if (animate) {
      this.viewport.scrollTo({
        left: destX,
        top: destY,
        behavior: 'smooth'
      });
    } else {
      this.viewport.scrollLeft = destX;
      this.viewport.scrollTop = destY;
    }
  },

  scrollToPoint(left, top, animate = true) {
    const scale = this.getScaleFactor();
    const vpW = this.viewport.clientWidth || window.innerWidth;
    const vpH = this.viewport.clientHeight || window.innerHeight;
    const destX = Math.max(0, (left * scale) - (vpW / 2));
    const destY = Math.max(0, (top * scale) - (vpH / 2));

    if (animate) {
      this.viewport.scrollTo({
        left: destX,
        top: destY,
        behavior: 'smooth'
      });
    } else {
      this.viewport.scrollLeft = destX;
      this.viewport.scrollTop = destY;
    }
  },

  // --- FLUID 2D DRAG-TO-PAN MOVEMENTS ---
  bindMovements() {
    const bgMap = this.viewport;
    let isDown = false;
    let startX = 0, startY = 0;
    let scrollLeft = 0, scrollTop = 0;
    let lastX = 0, lastY = 0, lastTime = 0;
    let velX = 0, velY = 0;
    let inertiaFrame = null;

    // Mouse drag on map
    bgMap.addEventListener('mousedown', (e) => {
      // Ignore if clicking UI buttons, input, tags, details, or shuttle widget
      if (e.button !== 0) return;
      if (e.target.closest('.search-bar, .zoom-buttons, .layer-button, .place-details, .get-down-btn, .instruct-box, .shuttle-widget, .tag, .legend, .url-box, button, input, select')) {
        return;
      }

      isDown = true;
      cancelAnimationFrame(inertiaFrame);
      bgMap.classList.add('grabbing');

      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      lastTime = performance.now();
      scrollLeft = bgMap.scrollLeft;
      scrollTop = bgMap.scrollTop;
      velX = 0;
      velY = 0;

      e.preventDefault(); // Prevents browser ghost image drag
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();

      const now = performance.now();
      const dt = Math.max(1, now - lastTime);
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      bgMap.scrollLeft = scrollLeft - dx;
      bgMap.scrollTop = scrollTop - dy;

      velX = (e.clientX - lastX) / dt;
      velY = (e.clientY - lastY) / dt;
      lastX = e.clientX;
      lastY = e.clientY;
      lastTime = now;
    });

    window.addEventListener('mouseup', () => {
      if (!isDown) return;
      isDown = false;
      bgMap.classList.remove('grabbing');

      // Smooth inertia glide
      if (Math.abs(velX) > 0.08 || Math.abs(velY) > 0.08) {
        const friction = 0.92;
        const glide = () => {
          if (Math.abs(velX) < 0.02 && Math.abs(velY) < 0.02) return;
          bgMap.scrollLeft -= velX * 16;
          bgMap.scrollTop -= velY * 16;
          velX *= friction;
          velY *= friction;
          inertiaFrame = requestAnimationFrame(glide);
        };
        inertiaFrame = requestAnimationFrame(glide);
      }
    });

    window.addEventListener('blur', () => {
      isDown = false;
      bgMap.classList.remove('grabbing');
    });

    // Mouse wheel zoom (Ctrl + wheel or Trackpad pinch)
    bgMap.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          this.zoomin();
        } else if (e.deltaY > 0) {
          this.zoomout();
        }
      }
    }, { passive: false });

    // Double-click to zoom in/out
    bgMap.addEventListener('dblclick', (e) => {
      if (e.target.closest('.search-bar, .zoom-buttons, .layer-button, .place-details, .shuttle-widget, .tag, .legend, button, input')) return;
      if (this.zoomLevel === 4) {
        this.setZoom(1);
      } else {
        this.zoomin();
      }
    });

    // Click map dismisses pin & url box
    bgMap.addEventListener('click', (e) => {
      if (!e.target.closest('#pin, #url-box, .tag, .legend, .shuttle-marker, .search-bar, .zoom-buttons, .layer-button, .place-details')) {
        $('#pin').hide();
        $('#url-box').hide();
      }
    });

    // Right-click / Long-press on map to drop a shareable pin
    bgMap.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.search-bar, .zoom-buttons, .layer-button, .place-details, .shuttle-widget, button, input')) return;
      e.preventDefault();
      const stage = document.getElementById('map-stage') || bgMap;
      const rect = stage.getBoundingClientRect();
      const X = e.clientX - rect.left;
      const Y = e.clientY - rect.top;
      this.dropPin(X, Y);
    });

    // Mobile Hammer.js Touch Support
    try {
      const hammertime = new Hammer(bgMap, { touchAction: "pan-x pan-y" });
      hammertime.on("doubletap", () => {
        if (this.zoomLevel === 4) {
          this.setZoom(1);
        } else {
          this.zoomin();
        }
      });

      hammertime.get('press').set({ time: 800 });
      hammertime.on("press", (e) => {
        const stage = document.getElementById('map-stage') || bgMap;
        const rect = stage.getBoundingClientRect();
        const X = e.center.x - rect.left;
        const Y = e.center.y - rect.top;
        this.dropPin(X, Y);
      });
    } catch (err) {
      console.warn("Hammer.js touch binding skipped:", err);
    }
  },

  dropPin(stageX, stageY) {
    const scale = this.getScaleFactor();
    this.pinBaseX = stageX / scale;
    this.pinBaseY = stageY / scale;

    const pin = $('#pin');
    const urlBox = $('#url-box');
    const urlInput = $('#pin-url');
    pin.css({
      left: `${stageX - 16}px`,
      top: `${stageY - 36}px`
    }).show();
    urlInput.val(`${window.location.origin}?pin=true&level=${this.zoomLevel}&left=${Math.round(stageX)}&top=${Math.round(stageY)}`);
    urlBox.css({
      left: `${stageX}px`,
      top: `${stageY + 4}px`,
      transform: 'translateX(-50%)'
    }).show();
    $('#btn-copy-pin').text('Copy');
  },

  updatePinScale() {
    const pin = $('#pin');
    if (!pin.is(':visible') || this.pinBaseX == null) return;
    const scale = this.getScaleFactor();
    const curX = this.pinBaseX * scale;
    const curY = this.pinBaseY * scale;
    pin.css({
      left: `${curX - 16}px`,
      top: `${curY - 36}px`
    });
    $('#url-box').css({
      left: `${curX}px`,
      top: `${curY + 4}px`
    });
  },

  // --- ZOOM CONTROLS (PRESERVES VIEWPORT CENTER) ---
  zoomin() {
    if (this.zoomLevel >= 4) return;
    const bgMap = this.viewport;
    const centerX = bgMap.scrollLeft + bgMap.clientWidth / 2;
    const centerY = bgMap.scrollTop + bgMap.clientHeight / 2;
    this.setZoom(this.zoomLevel + 1);
    bgMap.scrollLeft = (centerX * 1.5) - bgMap.clientWidth / 2;
    bgMap.scrollTop = (centerY * 1.5) - bgMap.clientHeight / 2;
  },

  zoomout() {
    if (this.zoomLevel <= 1) return;
    const bgMap = this.viewport;
    const centerX = bgMap.scrollLeft + bgMap.clientWidth / 2;
    const centerY = bgMap.scrollTop + bgMap.clientHeight / 2;
    this.setZoom(this.zoomLevel - 1);
    bgMap.scrollLeft = (centerX / 1.5) - bgMap.clientWidth / 2;
    bgMap.scrollTop = (centerY / 1.5) - bgMap.clientHeight / 2;
  },

  async setZoom(lvl) {
    if (lvl < 1 || lvl > 4) return;
    this.zoomLevel = lvl;
    const reqId = ++this._currentZoomRequestId;

    let w = this.baseWidth;
    let h = this.baseHeight;
    let i = 4;
    while (i > lvl) {
      w /= 1.5;
      h /= 1.5;
      i--;
    }

    const stage = document.getElementById('map-stage');
    if (stage) {
      stage.setAttribute('data-zoom', lvl);
      stage.style.width = `${w}px`;
      stage.style.height = `${h}px`;
    }

    document.querySelectorAll(".bg-map .the-map").forEach(img => {
      img.width = w;
      img.height = h;
      img.style.width = `${w}px`;
      img.style.height = `${h}px`;
    });

    const svg = document.getElementById('route-svg');
    if (svg) {
      svg.setAttribute('width', w);
      svg.setAttribute('height', h);
      svg.style.width = `${w}px`;
      svg.style.height = `${h}px`;
    }

    this.updatePinScale();

    await this.renderTags(lvl, reqId);
    await this.renderLegends(lvl, reqId);

    if (window.SimulationEngine) {
      SimulationEngine.drawRouteOverlays();
    }
  },

  async renderTags(num, reqId) {
    let data = this.tagCache[num];
    if (!data) {
      data = await API.getTags(num);
      this.tagCache[num] = data;
    }
    // Reject stale out-of-order renders
    if (reqId && reqId !== this._currentZoomRequestId) return;

    const element = document.querySelector(".tags");
    if (!element) return;
    
    const items = (data.tags || []);
    const html = [];
    for (let i = 0; i < items.length; i++) {
      const tag = items[i];
      html.push(`<div class='tag' onclick='SearchEngine.openPlaceDetails("${tag.id}")' id='${tag.id}' style='top: ${tag.top}; left: ${tag.left};'>${tag.name}</div>`);
    }
    element.innerHTML = html.join('');
  },

  async renderLegends(num, reqId) {
    let list = this.legendCache[num];
    if (!list) {
      list = await API.getLegends(num);
      this.legendCache[num] = list;
    }
    // Reject stale out-of-order renders
    if (reqId && reqId !== this._currentZoomRequestId) return;

    const element = document.querySelector(".legends");
    if (!element) return;

    const html = [];
    for (let i = 0; i < list.length; i++) {
      const legend = list[i];
      const cleanTitle = (legend.id || 'Amenity')
        .replace(/-icon(-\d+)?$/i, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      html.push(`<img src='${legend.link}' class='legend' id='${legend.id}' title='${cleanTitle}' style='top: ${legend.top}; left: ${legend.left};' alt='${cleanTitle}' loading='lazy'>`);
    }
    element.innerHTML = html.join('');
  },

  // --- MAP STYLE & THEME MANAGEMENT ---
  initTheme() {
    const savedStyle = localStorage.getItem('geobits-style') || localStorage.getItem('geobits-theme') || 'normal';
    this.setMapStyle(savedStyle);
  },

  setMapStyle(style) {
    const svgMap = $('#svg-map-img');
    const satMap = $('#sat-map-img');

    if (style === 'satellite') {
      svgMap.hide().removeClass('visible').addClass('invisible');
      satMap.show().removeClass('invisible').addClass('visible');
      $('.style-btn').removeClass('active');
      $('#style-btn-sat').addClass('active');
      localStorage.setItem('geobits-style', 'satellite');
      $('#btn-layer').attr('title', 'Switch to Normal Campus Map');
    } else if (style === 'dark') {
      satMap.hide().removeClass('visible').addClass('invisible');
      svgMap.show().removeClass('invisible').addClass('visible');
      svgMap.attr('src', '/assets/images/Map-dark.svg');
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('geobits-theme', 'dark');
      localStorage.setItem('geobits-style', 'dark');
      $('#theme-icon-moon').show();
      $('#theme-icon-sun').hide();
      $('.style-btn').removeClass('active');
      $('#style-btn-dark').addClass('active');
      $('#btn-layer').attr('title', 'Switch to Satellite Map');
    } else {
      // Normal Style Map (Default Light Vector Campus Map)
      satMap.hide().removeClass('visible').addClass('invisible');
      svgMap.show().removeClass('invisible').addClass('visible');
      svgMap.attr('src', '/assets/images/Map.svg');
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('geobits-theme', 'light');
      localStorage.setItem('geobits-style', 'normal');
      $('#theme-icon-moon').hide();
      $('#theme-icon-sun').show();
      $('.style-btn').removeClass('active');
      $('#style-btn-normal').addClass('active');
      $('#btn-layer').attr('title', 'Switch to Satellite Map');
    }
  },

  setTheme(theme) {
    this.setMapStyle(theme === 'dark' ? 'dark' : 'normal');
  },

  // --- BUTTONS & CONTROLS ---
  bindControls() {
    $('#btn-zoomin').click(() => this.zoomin());
    $('#btn-zoomout').click(() => this.zoomout());
    $('#btn-center').click(() => this.centerOnCampus(true));
    $('#btn-widget-center').click(() => this.centerOnCampus(true));

    // Map style pills (Normal / Satellite / Dark)
    $('#style-btn-normal').click(() => this.setMapStyle('normal'));
    $('#style-btn-sat').click(() => this.setMapStyle('satellite'));
    $('#style-btn-dark').click(() => this.setMapStyle('dark'));

    // Theme toggle button (Dark / Light)
    $('#btn-theme').click(() => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'normal' : 'dark';
      this.setMapStyle(next);
    });

    // Layer toggle (SVG / Satellite Map)
    $('#btn-layer').click(() => {
      const satMap = $('#sat-map-img');
      const isSat = satMap.is(':visible') && !satMap.hasClass('invisible');
      if (isSat) {
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        this.setMapStyle(theme === 'dark' ? 'dark' : 'normal');
      } else {
        this.setMapStyle('satellite');
      }
    });

    // Copy URL pin button
    $('#btn-copy-pin').click(() => {
      const input = document.getElementById('pin-url');
      if (input) {
        input.select();
        navigator.clipboard.writeText(input.value);
        $('#btn-copy-pin').text('Copied!');
        setTimeout(() => { $('#btn-copy-pin').text('Copy'); }, 2000);
      }
    });
  },

  bindInstructionBox() {
    $('#btn-close-instruct').click(() => {
      $('.instruct-box').stop().fadeOut(200);
    });

    // Auto-fade instruction modal after 8 seconds (exact myRide@BIT timing)
    setTimeout(() => {
      $('.instruct-box').fadeOut(1500);
    }, 8000);
  }
};
