/* ── AstroParks Parking Lot Calibration Tool ────────────────────────────── */
/* jshint esversion: 9 */
(function () {
  'use strict';

  // ── Space Definitions (matches dashboard layout) ──────────────────────────
  const SPACE_DEFS = [
    // TOP ROW (1–8)
    { id: 1,  section: 'TOP_ROW' },
    { id: 2,  section: 'TOP_ROW' },
    { id: 3,  section: 'TOP_ROW' },
    { id: 4,  section: 'TOP_ROW' },
    { id: 5,  section: 'TOP_ROW' },
    { id: 6,  section: 'TOP_ROW' },
    { id: 7,  section: 'TOP_ROW' },
    { id: 8,  section: 'TOP_ROW' },
    // ROW A (9–16)
    { id: 9,  section: 'ROW_A' },
    { id: 10, section: 'ROW_A' },
    { id: 11, section: 'ROW_A' },
    { id: 12, section: 'ROW_A' },
    { id: 13, section: 'ROW_A' },
    { id: 14, section: 'ROW_A' },
    { id: 15, section: 'ROW_A' },
    { id: 16, section: 'ROW_A' },
    // ROW B (17–24)
    { id: 17, section: 'ROW_B' },
    { id: 18, section: 'ROW_B' },
    { id: 19, section: 'ROW_B' },
    { id: 20, section: 'ROW_B' },
    { id: 21, section: 'ROW_B' },
    { id: 22, section: 'ROW_B' },
    { id: 23, section: 'ROW_B' },
    { id: 24, section: 'ROW_B' },
    // BOTTOM ROW (25–32)
    { id: 25, section: 'BOTTOM_ROW' },
    { id: 26, section: 'BOTTOM_ROW' },
    { id: 27, section: 'BOTTOM_ROW' },
    { id: 28, section: 'BOTTOM_ROW' },
    { id: 29, section: 'BOTTOM_ROW' },
    { id: 30, section: 'BOTTOM_ROW' },
    { id: 31, section: 'BOTTOM_ROW' },
    { id: 32, section: 'BOTTOM_ROW' },
    // LEFT SIDE (33–40)
    { id: 33, section: 'LEFT_SIDE' },
    { id: 34, section: 'LEFT_SIDE' },
    { id: 35, section: 'LEFT_SIDE' },
    { id: 36, section: 'LEFT_SIDE' },
    { id: 37, section: 'LEFT_SIDE' },
    { id: 38, section: 'LEFT_SIDE' },
    { id: 39, section: 'LEFT_SIDE' },
    { id: 40, section: 'LEFT_SIDE' },
    // RIGHT SIDE (41–48)
    { id: 41, section: 'RIGHT_SIDE' },
    { id: 42, section: 'RIGHT_SIDE' },
    { id: 43, section: 'RIGHT_SIDE' },
    { id: 44, section: 'RIGHT_SIDE' },
    { id: 45, section: 'RIGHT_SIDE' },
    { id: 46, section: 'RIGHT_SIDE' },
    { id: 47, section: 'RIGHT_SIDE' },
    { id: 48, section: 'RIGHT_SIDE' },
  ];

  const SECTION_META = {
    TOP_ROW:    { label: 'Top Row',    color: '#22d3ee' },
    ROW_A:      { label: 'Row A',      color: '#34d399' },
    ROW_B:      { label: 'Row B',      color: '#a855f7' },
    BOTTOM_ROW: { label: 'Bottom Row', color: '#f97316' },
    LEFT_SIDE:  { label: 'Left Side',  color: '#4f8ef7' },
    RIGHT_SIDE: { label: 'Right Side', color: '#fbbf24' },
  };

  // Ordered sections for the sidebar
  const SECTION_ORDER = ['TOP_ROW', 'ROW_A', 'ROW_B', 'BOTTOM_ROW', 'LEFT_SIDE', 'RIGHT_SIDE'];

  // ── Helpers ───────────────────────────────────────────────────────────────
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Ray-casting point-in-polygon test (polygon = [[x,y], ...])
  function pointInPolygon(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > py) !== (yj > py)) &&
                        (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // ── CalibrationTool ───────────────────────────────────────────────────────
  class CalibrationTool {
    constructor() {
      // DOM refs
      this.canvas        = document.getElementById('calibration-canvas');
      this.ctx           = this.canvas.getContext('2d');
      this.container     = document.getElementById('canvas-container');
      this.placeholder   = document.getElementById('canvas-placeholder');
      this.statusBar     = document.getElementById('status-bar');
      this.spaceListEl   = document.getElementById('space-list');
      this.spaceDetailsEl= document.getElementById('space-details');
      this.progressEl    = document.getElementById('cal-progress');

      // Image state
      this.image    = null;   // HTMLImageElement
      this.imgW     = 0;      // native image width
      this.imgH     = 0;      // native image height

      // Viewport (pan + zoom applied to image display)
      this.vpX      = 0;      // canvas X of image top-left
      this.vpY      = 0;      // canvas Y of image top-left
      this.vpScale  = 1;      // pixels per image pixel

      // Space data: Map<id, { ...def, label, polygon: [[nx,ny],...] | null }>
      this.spaceData = new Map();
      SPACE_DEFS.forEach(d => {
        this.spaceData.set(d.id, {
          ...d,
          label: `Space ${d.id}`,
          polygon: null,
        });
      });

      // Interaction state
      this.mode           = 'draw';  // 'draw' | 'select' | 'delete'
      this.selectedSpaceId= null;
      this.hoveredSpaceId = null;

      // Drawing state
      this.isDrawing    = false;
      this.drawPoints   = [];   // [[nx,ny], ...] points added so far
      this.mouseNorm    = null; // { nx, ny } current mouse in image coords

      // Pan state
      this.isPanning    = false;
      this.panStart     = null; // { x, y, vpX, vpY }

      // History stack for undo
      this.history      = [];

      // Camera
      this.cameraId     = 'camera_0';

      this._init();
    }

    _init() {
      this._bindEvents();
      this._renderSpaceList();
      this._setStatus('Load a parking lot image to begin calibration');
      this.canvas.style.display = 'none';

      // Resize observer keeps canvas sized to its container
      new ResizeObserver(() => this._onContainerResize()).observe(this.container);
    }

    // ── Resize / viewport ────────────────────────────────────────────────────
    _onContainerResize() {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w === 0 || h === 0) return;
      this.canvas.width  = w;
      this.canvas.height = h;
      this._render();
    }

    _fitImage() {
      if (!this.image) return;
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const scale = Math.min(cw / this.imgW, ch / this.imgH) * 0.97;
      this.vpScale = scale;
      this.vpX = (cw - this.imgW * scale) / 2;
      this.vpY = (ch - this.imgH * scale) / 2;
    }

    // ── Coordinate transforms ────────────────────────────────────────────────

    // Canvas pixel → normalised image coords (0–1)
    _canvasToNorm(cx, cy) {
      const nx = (cx - this.vpX) / (this.imgW * this.vpScale);
      const ny = (cy - this.vpY) / (this.imgH * this.vpScale);
      return { nx, ny };
    }

    // Normalised image coords → canvas pixel
    _normToCanvas(nx, ny) {
      return {
        cx: this.vpX + nx * this.imgW * this.vpScale,
        cy: this.vpY + ny * this.imgH * this.vpScale,
      };
    }

    // Pixel distance on canvas corresponding to d normalised units (approx)
    _normDistToCanvas(d) {
      return d * this.imgW * this.vpScale;
    }

    // Mouse event → canvas coords relative to canvas element
    _eventToCanvas(e) {
      const rect = this.canvas.getBoundingClientRect();
      return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
    }

    // ── Polygon helpers ───────────────────────────────────────────────────────

    // Return true if canvas point (cx,cy) is close enough to close the polygon
    _isNearFirst(cx, cy) {
      if (this.drawPoints.length < 3) return false;
      const first = this.drawPoints[0];
      const { cx: fx, cy: fy } = this._normToCanvas(first[0], first[1]);
      const dx = cx - fx, dy = cy - fy;
      return Math.sqrt(dx * dx + dy * dy) < 10;
    }

    // Which space (if any) contains a normalised point?
    _spaceAtNorm(nx, ny) {
      for (const [id, sp] of this.spaceData) {
        if (sp.polygon && pointInPolygon(nx, ny, sp.polygon)) return id;
      }
      return null;
    }

    // ── Drawing actions ───────────────────────────────────────────────────────

    _startDrawing(spaceId) {
      if (!this.image) { this._toast('Load an image first', 'error'); return; }
      this.selectedSpaceId = spaceId;
      this.isDrawing   = true;
      this.drawPoints  = [];
      this.mode        = 'draw';
      this._syncModeButtons();
      this._setStatus(`Drawing Space ${spaceId} — click to add vertices, double-click or Enter to finish`, 'drawing');
      this._renderSpaceList();
      this._renderDetails();
      this._render();
    }

    _addPoint(nx, ny) {
      this.drawPoints.push([nx, ny]);
      this._setStatus(
        `Space ${this.selectedSpaceId}: ${this.drawPoints.length} point(s) — double-click or Enter to finish`,
        'drawing'
      );
      this._renderDetails();
      this._render();
    }

    _finishPolygon() {
      if (!this.isDrawing) return;
      if (this.drawPoints.length < 3) {
        this._toast('Need at least 3 points to define a space', 'error');
        return;
      }
      this._pushHistory();
      const sp = this.spaceData.get(this.selectedSpaceId);
      sp.polygon = [...this.drawPoints];
      this.isDrawing  = false;
      this.drawPoints = [];
      this._setStatus(`Space ${this.selectedSpaceId} calibrated ✓`, 'success');
      this._renderSpaceList();
      this._renderDetails();
      this._render();
      this._updateProgress();
    }

    _cancelDrawing() {
      if (!this.isDrawing) return;
      this.isDrawing  = false;
      this.drawPoints = [];
      this._setStatus('Drawing cancelled');
      this._render();
    }

    _deleteSpacePolygon(spaceId) {
      const sp = this.spaceData.get(spaceId);
      if (!sp || !sp.polygon) return;
      this._pushHistory();
      sp.polygon = null;
      this._renderSpaceList();
      this._renderDetails();
      this._render();
      this._updateProgress();
      this._setStatus(`Space ${spaceId} polygon removed`);
    }

    // ── History ───────────────────────────────────────────────────────────────

    _pushHistory() {
      const snapshot = {};
      for (const [id, sp] of this.spaceData) {
        snapshot[id] = sp.polygon ? sp.polygon.map(p => [...p]) : null;
      }
      this.history.push(snapshot);
      if (this.history.length > 50) this.history.shift();
    }

    _undo() {
      if (this.history.length === 0) { this._toast('Nothing to undo'); return; }
      if (this.isDrawing) { this._cancelDrawing(); return; }
      const snapshot = this.history.pop();
      for (const [id, sp] of this.spaceData) {
        sp.polygon = snapshot[id];
      }
      this._renderSpaceList();
      this._renderDetails();
      this._render();
      this._updateProgress();
      this._setStatus('Undo applied');
    }

    // ── Mode management ───────────────────────────────────────────────────────

    setMode(mode) {
      if (this.isDrawing) this._cancelDrawing();
      this.mode = mode;
      this._syncModeButtons();
      const cursors = { draw: 'crosshair', select: 'default', delete: 'not-allowed' };
      this.canvas.style.cursor = cursors[mode] || 'crosshair';
      const msgs = {
        draw:   'Draw mode — select a space from the list and click to place polygon vertices',
        select: 'Select mode — click a polygon to select it',
        delete: 'Delete mode — click a polygon to remove it',
      };
      this._setStatus(msgs[mode]);
    }

    _syncModeButtons() {
      document.querySelectorAll('.btn-tool[data-mode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === this.mode);
      });
    }

    // ── Image loading ─────────────────────────────────────────────────────────

    _loadImageFile(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          this.image = img;
          this.imgW  = img.naturalWidth;
          this.imgH  = img.naturalHeight;
          // Show canvas, hide placeholder
          this.canvas.style.display = 'block';
          this.placeholder.style.display = 'none';
          this._onContainerResize();
          this._fitImage();
          this._render();
          this._setStatus(`Image loaded: ${this.imgW}×${this.imgH}px — select a space and start drawing`);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      // Reset input so the same file can be re-loaded
      e.target.value = '';
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    _render() {
      const ctx  = this.ctx;
      const cw   = this.canvas.width;
      const ch   = this.canvas.height;

      ctx.clearRect(0, 0, cw, ch);

      // Dark canvas background
      ctx.fillStyle = '#050d1a';
      ctx.fillRect(0, 0, cw, ch);

      if (!this.image) return;

      // Draw image
      ctx.drawImage(
        this.image,
        this.vpX, this.vpY,
        this.imgW * this.vpScale,
        this.imgH * this.vpScale
      );

      // Draw completed polygons
      for (const [id, sp] of this.spaceData) {
        if (!sp.polygon) continue;
        const color = SECTION_META[sp.section].color;
        const isSelected = id === this.selectedSpaceId;
        const isHovered  = id === this.hoveredSpaceId;

        const canvasPoly = sp.polygon.map(([nx, ny]) => {
          const { cx, cy } = this._normToCanvas(nx, ny);
          return [cx, cy];
        });

        // Fill
        ctx.beginPath();
        ctx.moveTo(canvasPoly[0][0], canvasPoly[0][1]);
        for (let i = 1; i < canvasPoly.length; i++) {
          ctx.lineTo(canvasPoly[i][0], canvasPoly[i][1]);
        }
        ctx.closePath();

        ctx.fillStyle = isSelected
          ? hexToRgba(color, 0.45)
          : isHovered
            ? hexToRgba(color, 0.35)
            : hexToRgba(color, 0.2);
        ctx.fill();

        // Stroke
        ctx.strokeStyle = color;
        ctx.lineWidth   = isSelected ? 2.5 : isHovered ? 2 : 1.5;
        ctx.setLineDash([]);
        ctx.stroke();

        // Vertex handles (when selected)
        if (isSelected) {
          ctx.fillStyle = color;
          for (const [px, py] of canvasPoly) {
            ctx.beginPath();
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Label
        this._drawSpaceLabel(ctx, canvasPoly, String(id), color, isSelected);
      }

      // Draw in-progress polygon
      if (this.isDrawing && this.drawPoints.length > 0) {
        const spColor = this.selectedSpaceId
          ? SECTION_META[this.spaceData.get(this.selectedSpaceId).section].color
          : '#ffffff';

        const canvasPts = this.drawPoints.map(([nx, ny]) => {
          const { cx, cy } = this._normToCanvas(nx, ny);
          return [cx, cy];
        });

        // Draw completed edges
        ctx.beginPath();
        ctx.moveTo(canvasPts[0][0], canvasPts[0][1]);
        for (let i = 1; i < canvasPts.length; i++) {
          ctx.lineTo(canvasPts[i][0], canvasPts[i][1]);
        }
        ctx.strokeStyle = spColor;
        ctx.lineWidth   = 2;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Line from last point to mouse
        if (this.mouseNorm && canvasPts.length > 0) {
          const { cx: mx, cy: my } = this._normToCanvas(this.mouseNorm.nx, this.mouseNorm.ny);
          const last = canvasPts[canvasPts.length - 1];
          ctx.beginPath();
          ctx.moveTo(last[0], last[1]);
          ctx.lineTo(mx, my);
          ctx.strokeStyle = hexToRgba(spColor, 0.5);
          ctx.lineWidth   = 1.5;
          ctx.setLineDash([3, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Vertex dots
        ctx.fillStyle = spColor;
        for (let i = 0; i < canvasPts.length; i++) {
          const [px, py] = canvasPts[i];
          ctx.beginPath();
          ctx.arc(px, py, i === 0 ? 6 : 4, 0, Math.PI * 2);
          ctx.fill();

          // Highlight first point as close target
          if (i === 0 && this.drawPoints.length >= 3) {
            ctx.beginPath();
            ctx.arc(px, py, 10, 0, Math.PI * 2);
            ctx.strokeStyle = hexToRgba(spColor, 0.5);
            ctx.lineWidth   = 1.5;
            ctx.stroke();
          }
        }
      }
    }

    _drawSpaceLabel(ctx, canvasPoly, text, color, isSelected) {
      // Centroid of the polygon
      let cx = 0, cy = 0;
      for (const [px, py] of canvasPoly) { cx += px; cy += py; }
      cx /= canvasPoly.length;
      cy /= canvasPoly.length;

      const fontSize = Math.max(10, Math.min(16, this.vpScale * 14));
      ctx.font      = `bold ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Background pill
      const metrics = ctx.measureText(text);
      const pw = metrics.width + 10;
      const ph = fontSize + 6;
      ctx.fillStyle = isSelected ? hexToRgba(color, 0.8) : 'rgba(5,13,26,0.75)';
      ctx.beginPath();
      ctx.roundRect(cx - pw / 2, cy - ph / 2, pw, ph, 4);
      ctx.fill();

      ctx.fillStyle = isSelected ? '#000' : color;
      ctx.fillText(text, cx, cy);
    }

    // ── UI helpers ────────────────────────────────────────────────────────────

    _renderSpaceList() {
      const el = this.spaceListEl;
      el.innerHTML = '';

      for (const section of SECTION_ORDER) {
        const meta = SECTION_META[section];

        // Section header
        const hdr = document.createElement('div');
        hdr.className = 'section-header';
        hdr.textContent = meta.label;
        el.appendChild(hdr);

        const spaces = SPACE_DEFS.filter(d => d.section === section);
        for (const def of spaces) {
          const sp  = this.spaceData.get(def.id);
          const row = document.createElement('div');
          row.className = 'space-item';
          if (sp.polygon)              row.classList.add('calibrated');
          if (def.id === this.selectedSpaceId) row.classList.add('selected');
          if (this.isDrawing && def.id === this.selectedSpaceId) {
            row.classList.add('active-drawing');
          }
          row.dataset.id = def.id;

          const dot = document.createElement('span');
          dot.className = `space-dot dot-${section}`;

          const num = document.createElement('span');
          num.className   = 'space-num';
          num.textContent = def.id;

          const lbl = document.createElement('span');
          lbl.className   = 'space-lbl';
          lbl.textContent = sp.polygon ? '✓ calibrated' : 'pending';

          row.append(dot, num, lbl);
          row.addEventListener('click', () => this._onSpaceListClick(def.id));
          el.appendChild(row);
        }
      }
    }

    _onSpaceListClick(spaceId) {
      if (this.isDrawing) {
        // Ask to cancel current drawing
        if (!confirm(`Cancel current drawing for Space ${this.selectedSpaceId} and switch to Space ${spaceId}?`)) return;
        this._cancelDrawing();
      }
      this.selectedSpaceId = spaceId;
      this._renderSpaceList();
      this._renderDetails();

      if (this.mode === 'draw') {
        this._startDrawing(spaceId);
      } else {
        this._render();
      }

      // Scroll selected item into view
      const selected = this.spaceListEl.querySelector('.space-item.selected');
      if (selected) selected.scrollIntoView({ block: 'nearest' });
    }

    _renderDetails() {
      const el = this.spaceDetailsEl;
      if (!this.selectedSpaceId) {
        el.innerHTML = '<p class="text-muted">No space selected.<br>Select a space from the list or click a polygon.</p>';
        return;
      }
      const sp = this.spaceData.get(this.selectedSpaceId);
      const meta = SECTION_META[sp.section];
      const status = this.isDrawing
        ? `<span class="detail-badge badge-drawing">Drawing… (${this.drawPoints.length} pts)</span>`
        : sp.polygon
          ? `<span class="detail-badge badge-calibrated">Calibrated (${sp.polygon.length} pts)</span>`
          : `<span class="detail-badge badge-pending">Pending</span>`;

      let pointsHtml = '';
      const pts = this.isDrawing ? this.drawPoints : (sp.polygon || []);
      if (pts.length > 0) {
        pointsHtml = `
          <div class="detail-row">
            <label>Vertices</label>
            <ul class="points-list">
              ${pts.map((p, i) => `<li>${i + 1}: (${p[0].toFixed(4)}, ${p[1].toFixed(4)})</li>`).join('')}
            </ul>
          </div>`;
      }

      el.innerHTML = `
        <div class="detail-row">
          <label>Space</label>
          <span class="detail-value">${sp.label}</span>
        </div>
        <div class="detail-row">
          <label>Section</label>
          <span class="detail-value" style="color:${meta.color}">${meta.label}</span>
        </div>
        <div class="detail-row">
          <label>Status</label>
          ${status}
        </div>
        ${pointsHtml}
        ${sp.polygon ? `<button class="btn-detail-delete" data-space="${sp.id}">Remove Polygon</button>` : ''}
      `;

      el.querySelector('.btn-detail-delete')
        ?.addEventListener('click', (e) => {
          this._deleteSpacePolygon(Number(e.currentTarget.dataset.space));
        });
    }

    _updateProgress() {
      let count = 0;
      for (const [, sp] of this.spaceData) { if (sp.polygon) count++; }
      this.progressEl.textContent = `${count} / ${this.spaceData.size}`;
    }

    _setStatus(msg, type = '') {
      this.statusBar.textContent = msg;
      this.statusBar.className   = 'cal-status' + (type ? ` status-${type}` : '');
    }

    _toast(msg, type = '') {
      const t = document.createElement('div');
      t.className = 'cal-toast' + (type ? ` toast-${type}` : '');
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 2500);
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    _bindEvents() {
      // File inputs
      document.getElementById('file-image')
        .addEventListener('change', (e) => this._loadImageFile(e));
      document.getElementById('file-import')
        .addEventListener('change', (e) => this._importJSON(e));

      // Header buttons
      document.getElementById('btn-load-image')
        .addEventListener('click', () => document.getElementById('file-image').click());
      document.getElementById('btn-load-image-center')
        .addEventListener('click', () => document.getElementById('file-image').click());
      document.getElementById('btn-save')
        .addEventListener('click', () => this._saveToServer());
      document.getElementById('btn-load-cfg')
        .addEventListener('click', () => this._loadFromServer());
      document.getElementById('btn-export')
        .addEventListener('click', () => this._exportJSON());
      document.getElementById('btn-import')
        .addEventListener('click', () => document.getElementById('file-import').click());

      // Toolbar buttons
      document.getElementById('btn-undo')
        .addEventListener('click', () => this._undo());
      document.getElementById('btn-clear-all')
        .addEventListener('click', () => this._clearAll());
      document.getElementById('btn-zoom-in')
        .addEventListener('click', () => this._zoom(1.25));
      document.getElementById('btn-zoom-out')
        .addEventListener('click', () => this._zoom(0.8));
      document.getElementById('btn-zoom-fit')
        .addEventListener('click', () => { this._fitImage(); this._render(); });

      // Mode buttons
      document.querySelectorAll('.btn-tool[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
      });

      // Camera select
      document.getElementById('camera-select')
        .addEventListener('change', (e) => { this.cameraId = e.target.value; });

      // Canvas
      this.canvas.addEventListener('click',       (e) => this._onCanvasClick(e));
      this.canvas.addEventListener('dblclick',    (e) => this._onCanvasDblClick(e));
      this.canvas.addEventListener('mousemove',   (e) => this._onMouseMove(e));
      this.canvas.addEventListener('mousedown',   (e) => this._onMouseDown(e));
      this.canvas.addEventListener('mouseup',     (e) => this._onMouseUp(e));
      this.canvas.addEventListener('wheel',       (e) => this._onWheel(e), { passive: false });
      this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this._cancelDrawing(); });
      this.canvas.addEventListener('mouseleave',  () => { this.mouseNorm = null; this._render(); });

      // Keyboard
      document.addEventListener('keydown', (e) => this._onKeyDown(e));
    }

    _onCanvasClick(e) {
      if (!this.image) return;
      if (e.button !== 0) return;
      const { cx, cy } = this._eventToCanvas(e);
      const { nx, ny } = this._canvasToNorm(cx, cy);

      if (this.mode === 'draw') {
        if (!this.selectedSpaceId) {
          this._toast('Select a parking space from the list first', 'error');
          return;
        }
        if (!this.isDrawing) {
          this._startDrawing(this.selectedSpaceId);
        }
        if (this._isNearFirst(cx, cy) && this.drawPoints.length >= 3) {
          this._finishPolygon();
        } else {
          this._addPoint(nx, ny);
        }
        return;
      }

      if (this.mode === 'select') {
        const id = this._spaceAtNorm(nx, ny);
        if (id) {
          this.selectedSpaceId = id;
          this._renderSpaceList();
          this._renderDetails();
          this._render();
          const item = this.spaceListEl.querySelector(`[data-id="${id}"]`);
          if (item) item.scrollIntoView({ block: 'nearest' });
        }
        return;
      }

      if (this.mode === 'delete') {
        const id = this._spaceAtNorm(nx, ny);
        if (id) this._deleteSpacePolygon(id);
        return;
      }
    }

    _onCanvasDblClick(e) {
      if (!this.image) return;
      if (this.mode === 'draw' && this.isDrawing) {
        // Remove the extra point added by the preceding single-click
        if (this.drawPoints.length > 3) this.drawPoints.pop();
        this._finishPolygon();
      }
    }

    _onMouseMove(e) {
      if (!this.image) return;
      const { cx, cy } = this._eventToCanvas(e);
      const { nx, ny } = this._canvasToNorm(cx, cy);
      this.mouseNorm = { nx, ny };

      // Hover detection in select/delete mode
      if (this.mode === 'select' || this.mode === 'delete') {
        const prev = this.hoveredSpaceId;
        this.hoveredSpaceId = this._spaceAtNorm(nx, ny);
        if (prev !== this.hoveredSpaceId) this._render();
      }

      // Panning
      if (this.isPanning && this.panStart) {
        this.vpX = this.panStart.vpX + (cx - this.panStart.x);
        this.vpY = this.panStart.vpY + (cy - this.panStart.y);
        this._render();
        return;
      }

      if (this.isDrawing) this._render();
    }

    _onMouseDown(e) {
      // Middle-click or alt+left drag = pan
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        this.isPanning = true;
        const { cx, cy } = this._eventToCanvas(e);
        this.panStart = { x: cx, y: cy, vpX: this.vpX, vpY: this.vpY };
        this.canvas.style.cursor = 'grabbing';
      }
    }

    _onMouseUp(e) {
      if (this.isPanning) {
        this.isPanning = false;
        this.panStart  = null;
        const cursors  = { draw: 'crosshair', select: 'default', delete: 'not-allowed' };
        this.canvas.style.cursor = cursors[this.mode] || 'crosshair';
      }
    }

    _onWheel(e) {
      if (!this.image) return;
      e.preventDefault();
      const { cx, cy } = this._eventToCanvas(e);
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      this._zoomAt(factor, cx, cy);
    }

    _zoom(factor) {
      const cx = this.canvas.width  / 2;
      const cy = this.canvas.height / 2;
      this._zoomAt(factor, cx, cy);
    }

    _zoomAt(factor, cx, cy) {
      const newScale = Math.max(0.1, Math.min(10, this.vpScale * factor));
      const scaleDelta = newScale - this.vpScale;
      this.vpX    -= (cx - this.vpX) * (scaleDelta / this.vpScale);
      this.vpY    -= (cy - this.vpY) * (scaleDelta / this.vpScale);
      this.vpScale = newScale;
      this._render();
    }

    _onKeyDown(e) {
      if (e.key === 'Escape') { this._cancelDrawing(); }
      if (e.key === 'Enter')  { this._finishPolygon(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement === document.body || document.activeElement === this.canvas) {
          if (this.selectedSpaceId) this._deleteSpacePolygon(this.selectedSpaceId);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        this._undo();
      }
    }

    // ── Data operations ───────────────────────────────────────────────────────

    _buildCalibrationData() {
      const spaces = [];
      for (const [id, sp] of this.spaceData) {
        if (!sp.polygon) continue;
        spaces.push({
          space_id:    id,
          space_label: sp.label,
          section:     sp.section,
          polygon:     sp.polygon,
        });
      }
      return {
        camera_id:  this.cameraId,
        label:      document.getElementById('camera-select').options[
                      document.getElementById('camera-select').selectedIndex
                    ].text,
        img_width:  this.imgW || null,
        img_height: this.imgH || null,
        spaces,
      };
    }

    _loadCalibrationData(data) {
      if (!data || !Array.isArray(data.spaces)) {
        this._toast('Invalid calibration data', 'error'); return;
      }
      this._pushHistory();
      // Reset all polygons
      for (const [, sp] of this.spaceData) sp.polygon = null;
      for (const s of data.spaces) {
        const sp = this.spaceData.get(s.space_id);
        if (sp && Array.isArray(s.polygon)) sp.polygon = s.polygon;
      }
      this._renderSpaceList();
      this._renderDetails();
      this._render();
      this._updateProgress();
    }

    _saveToServer() {
      const data = this._buildCalibrationData();
      if (data.spaces.length === 0) {
        this._toast('No calibration data to save', 'error'); return;
      }
      fetch('/api/calibration', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
        credentials: 'include',
      })
        .then(r => r.json())
        .then(res => {
          if (res.success) {
            this._toast('Calibration saved to server ✓', 'success');
            this._setStatus('Calibration saved successfully', 'success');
          } else {
            this._toast(res.error || 'Save failed', 'error');
          }
        })
        .catch(() => this._toast('Network error — save failed', 'error'));
    }

    _loadFromServer() {
      const cameraId = this.cameraId;
      fetch(`/api/calibration/${cameraId}`, { credentials: 'include' })
        .then(r => {
          if (r.status === 404) throw new Error('No calibration found for this camera');
          return r.json();
        })
        .then(data => {
          this._loadCalibrationData(data);
          this._toast(`Loaded calibration for ${cameraId} ✓`, 'success');
          this._setStatus(`Calibration loaded for ${cameraId}`);
        })
        .catch(err => this._toast(err.message, 'error'));
    }

    _exportJSON() {
      const data = this._buildCalibrationData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `calibration_${this.cameraId}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this._toast('Calibration exported ✓', 'success');
    }

    _importJSON(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          this._loadCalibrationData(data);
          if (data.camera_id) {
            this.cameraId = data.camera_id;
            const sel = document.getElementById('camera-select');
            for (const opt of sel.options) {
              if (opt.value === data.camera_id) { sel.value = data.camera_id; break; }
            }
          }
          this._toast('Calibration imported ✓', 'success');
        } catch {
          this._toast('Invalid JSON file', 'error');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    }

    _clearAll() {
      if (!confirm('Clear all polygon calibrations? This cannot be undone.')) return;
      this._pushHistory();
      this._cancelDrawing();
      for (const [, sp] of this.spaceData) sp.polygon = null;
      this._renderSpaceList();
      this._renderDetails();
      this._render();
      this._updateProgress();
      this._setStatus('All calibrations cleared');
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => new CalibrationTool());
})();
