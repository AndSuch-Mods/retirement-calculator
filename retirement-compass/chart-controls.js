(function (root) {
  'use strict';

  const Model = root.HouseholdModel;
  if (!Model) return;

  const $ = (id) => document.getElementById(id);
  const compactMoney = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1
  });

  let zoom = 1;
  let chartObserver = null;
  let bodyObserver = null;
  let resizeObserver = null;
  let decorateQueued = false;

  function readForm() {
    const data = {};
    document.querySelectorAll('input[id], select[id]').forEach((el) => {
      if (el.id === 'projectionYearSlider' || el.id === 'projectionChartZoom') return;
      data[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return data;
  }

  function niceMax(value) {
    if (!(value > 0)) return 1;
    const exponent = Math.floor(Math.log10(value));
    const base = 10 ** exponent;
    const normalized = value / base;
    return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * base;
  }

  function installStyles() {
    if ($('projectionChartControlStyle')) return;
    const style = document.createElement('style');
    style.id = 'projectionChartControlStyle';
    style.textContent = `
      .chart-shell{position:relative;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-gutter:stable}
      #projectionChart{min-width:0!important;max-width:none!important;transition:width 120ms ease}
      .sticky-y-axis{position:sticky;left:0;top:0;width:72px;height:0;z-index:8;pointer-events:none}
      .sticky-y-axis-inner{position:absolute;left:0;top:0;width:72px;height:350px;background:linear-gradient(90deg,#0f1512 0%,#0f1512 72%,rgba(15,21,18,.86) 84%,rgba(15,21,18,0) 100%);border-right:1px solid rgba(53,72,64,.35)}
      .sticky-y-label{position:absolute;right:10px;transform:translateY(-50%);color:#9eada6;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
      .year-scrubber-top{justify-content:flex-start!important;align-items:flex-end!important;flex-wrap:wrap}
      .year-scrubber-balance{text-align:left!important}
      .year-scrubber-balance strong,#projectionSelectedYear{font-variant-numeric:tabular-nums}
      .chart-zoom-controls{margin-left:auto;display:grid;grid-template-columns:auto minmax(110px,170px) auto;gap:8px;align-items:center}
      .chart-zoom-label{color:var(--muted);font-size:.7rem;white-space:nowrap}
      .chart-zoom-range{width:100%;accent-color:var(--brand);cursor:pointer}
      .chart-fit-button{border:1px solid var(--line-strong);border-radius:999px;background:var(--surface);color:var(--ink);padding:6px 10px;font:inherit;font-size:.72rem;font-weight:700;cursor:pointer}
      .chart-fit-button:hover{border-color:var(--brand);color:var(--brand-strong)}
      .chart-zoom-value{min-width:38px;color:var(--muted);font-size:.7rem;text-align:right;font-variant-numeric:tabular-nums}
      @media(max-width:720px){
        .sticky-y-axis-inner{height:300px}
        .chart-zoom-controls{width:100%;margin-left:0;grid-template-columns:auto minmax(0,1fr) auto}
        .year-scrubber-top{align-items:flex-start!important}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureStickyAxis() {
    const shell = document.querySelector('.chart-shell');
    if (!shell || $('projectionStickyYAxis')) return;

    const axis = document.createElement('div');
    axis.id = 'projectionStickyYAxis';
    axis.className = 'sticky-y-axis';
    axis.setAttribute('aria-hidden', 'true');
    axis.innerHTML = '<div class="sticky-y-axis-inner"></div>';
    shell.insertBefore(axis, shell.firstChild);
  }

  function ensureZoomControls() {
    const top = document.querySelector('.year-scrubber-top');
    if (!top || $('projectionChartZoom')) return;

    const controls = document.createElement('div');
    controls.className = 'chart-zoom-controls';
    controls.innerHTML = `
      <button type="button" class="chart-fit-button" id="projectionChartFit">Fit</button>
      <label class="chart-zoom-label" for="projectionChartZoom">Zoom</label>
      <input id="projectionChartZoom" class="chart-zoom-range" type="range" min="1" max="2.5" step="0.1" value="1" aria-label="Chart zoom">
      <span class="chart-zoom-value" id="projectionChartZoomValue">100%</span>`;
    top.appendChild(controls);

    $('projectionChartFit').addEventListener('click', () => {
      zoom = 1;
      $('projectionChartZoom').value = '1';
      $('projectionChartZoomValue').textContent = '100%';
      applyZoom(true);
    });

    $('projectionChartZoom').addEventListener('input', (event) => {
      zoom = Number(event.target.value) || 1;
      $('projectionChartZoomValue').textContent = `${Math.round(zoom * 100)}%`;
      applyZoom(true);
    });
  }

  function updateStickyAxis() {
    const inner = document.querySelector('#projectionStickyYAxis .sticky-y-axis-inner');
    if (!inner) return;

    const result = Model.analyze(readForm());
    if (!result || result.errors?.length || !Array.isArray(result.timeline) || !result.timeline.length) return;

    const target = result.requiredNestEggNominal || 0;
    const maxValue = niceMax(Math.max(
      ...result.timeline.map((point) => Number(point.nominalBalance) || 0),
      target,
      1
    ) * 1.05);

    const labels = [];
    for (let index = 0; index <= 4; index += 1) {
      const value = maxValue * (1 - index / 4);
      const yViewBox = 28 + (284 * index / 4);
      const top = yViewBox / 360 * 100;
      labels.push(`<span class="sticky-y-label" style="top:${top}%">${compactMoney.format(value)}</span>`);
    }
    inner.innerHTML = labels.join('');
  }

  function hideScrollingYAxisLabels() {
    const svg = $('projectionChart');
    if (!svg) return;
    Array.from(svg.children).forEach((child) => {
      if (child.tagName?.toLowerCase() === 'text' && child.getAttribute('text-anchor') === 'end') {
        child.style.visibility = 'hidden';
      }
    });
  }

  function separateEventLabels() {
    const svg = $('projectionChart');
    if (!svg) return;

    const lanes = {
      'You retire': 44,
      'Spouse retires': 60,
      'Your SS': 286,
      'Spouse SS': 302
    };

    svg.querySelectorAll('text').forEach((text) => {
      const y = lanes[text.textContent];
      if (y == null) return;
      if (text.getAttribute('y') !== String(y)) text.setAttribute('y', String(y));
      text.setAttribute('font-weight', '700');
    });
  }

  function moveSelectedLabelLeft() {
    const group = $('projectionYearMarker');
    if (!group) return;
    const dot = group.querySelector('circle');
    const text = group.querySelector('text');
    if (!dot || !text) return;

    const cx = Number(dot.getAttribute('cx')) || 0;
    const labelX = Math.max(cx - 10, 86);
    text.setAttribute('x', String(labelX));
    text.setAttribute('text-anchor', 'end');
  }

  function applyZoom(center) {
    const shell = document.querySelector('.chart-shell');
    const svg = $('projectionChart');
    if (!shell || !svg) return;

    const available = Math.max(shell.clientWidth, 1);
    const width = Math.max(available, Math.round(available * zoom));
    svg.style.width = `${width}px`;
    svg.style.minWidth = '0';

    if (zoom <= 1.001) shell.scrollLeft = 0;
    if (center) requestAnimationFrame(() => centerSelectedYear());
  }

  function centerSelectedYear() {
    const shell = document.querySelector('.chart-shell');
    const svg = $('projectionChart');
    const slider = $('projectionYearSlider');
    if (!shell || !svg || !slider || zoom <= 1.001) return;

    const min = Number(slider.min);
    const max = Number(slider.max);
    const value = Number(slider.value);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(value)) return;

    const ratio = Math.min(Math.max((value - min) / (max - min), 0), 1);
    const svgWidth = svg.getBoundingClientRect().width;
    const plotLeft = 72;
    const plotRight = 28;
    const selectedX = plotLeft + ratio * Math.max(svgWidth - plotLeft - plotRight, 1);
    const maxScroll = Math.max(svg.scrollWidth - shell.clientWidth, 0);
    const desired = Math.min(Math.max(selectedX - shell.clientWidth / 2, 0), maxScroll);
    shell.scrollLeft = desired;
  }

  function decorateChart() {
    decorateQueued = false;
    ensureStickyAxis();
    ensureZoomControls();
    updateStickyAxis();
    hideScrollingYAxisLabels();
    separateEventLabels();
    moveSelectedLabelLeft();
    applyZoom(false);
  }

  function queueDecorate() {
    if (decorateQueued) return;
    decorateQueued = true;
    requestAnimationFrame(() => requestAnimationFrame(decorateChart));
  }

  function watchChart() {
    const svg = $('projectionChart');
    if (!svg || chartObserver) return;
    chartObserver = new MutationObserver(queueDecorate);
    chartObserver.observe(svg, { childList: true, subtree: true });
  }

  function watchForScrubber() {
    if ($('projectionYearScrubber')) {
      ensureZoomControls();
      return;
    }
    if (bodyObserver) return;
    bodyObserver = new MutationObserver(() => {
      if ($('projectionYearScrubber')) {
        ensureZoomControls();
        queueDecorate();
        bodyObserver.disconnect();
        bodyObserver = null;
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  function watchResize() {
    const shell = document.querySelector('.chart-shell');
    if (!shell || resizeObserver || typeof ResizeObserver === 'undefined') return;
    resizeObserver = new ResizeObserver(() => {
      applyZoom(false);
      queueDecorate();
    });
    resizeObserver.observe(shell);
  }

  function init() {
    installStyles();
    ensureStickyAxis();
    watchChart();
    watchForScrubber();
    watchResize();
    queueDecorate();

    document.addEventListener('input', (event) => {
      if (event.target?.id === 'projectionYearSlider') {
        requestAnimationFrame(() => requestAnimationFrame(centerSelectedYear));
        return;
      }
      if (event.target?.id === 'projectionChartZoom') return;
      queueDecorate();
    });

    document.addEventListener('change', (event) => {
      if (event.target?.id === 'projectionChartZoom') return;
      queueDecorate();
    });

    document.addEventListener('click', (event) => {
      if (event.target?.closest('#resetButton')) {
        zoom = 1;
        requestAnimationFrame(() => {
          if ($('projectionChartZoom')) $('projectionChartZoom').value = '1';
          if ($('projectionChartZoomValue')) $('projectionChartZoomValue').textContent = '100%';
          applyZoom(false);
          queueDecorate();
        });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
