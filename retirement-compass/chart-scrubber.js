(function (root) {
  'use strict';

  const Model = root.HouseholdModel;
  if (!Model) return;

  const $ = (id) => document.getElementById(id);
  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  });
  const compactMoney = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1
  });
  const dateFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
  });

  let selectedYear = null;
  let userSelected = false;

  function installDarkTheme() {
    let colorScheme = document.querySelector('meta[name="color-scheme"]');
    if (!colorScheme) {
      colorScheme = document.createElement('meta');
      colorScheme.name = 'color-scheme';
      document.head.appendChild(colorScheme);
    }
    colorScheme.content = 'dark';

    if (!document.getElementById('retirementCompassDarkTheme')) {
      const style = document.createElement('style');
      style.id = 'retirementCompassDarkTheme';
      style.textContent = `
        :root{
          color-scheme:dark;
          --page:#0b100e;
          --surface:#121916;
          --surface-soft:#161f1b;
          --ink:#edf4f0;
          --muted:#9caaa4;
          --line:#26342e;
          --line-strong:#354840;
          --brand:#54c4a5;
          --brand-strong:#7bd8be;
          --brand-soft:#173128;
          --accent:#e0ae55;
          --positive:#62d5b1;
          --positive-soft:#14352c;
          --negative:#ff9191;
          --negative-soft:#3a2020;
          --warning:#efbc62;
          --shadow:0 18px 55px rgba(0,0,0,.28);
        }
        html{color-scheme:dark}
        body{background:radial-gradient(circle at 85% -5%,rgba(84,196,165,.10),transparent 28rem),var(--page)!important}
        .button-quiet{background:rgba(18,25,22,.82)!important;border-color:var(--line)!important}
        .button-quiet:hover{background:var(--surface)!important}
        .currency-toggle{background:rgba(18,25,22,.76)!important}
        .segment.is-active{box-shadow:0 3px 14px rgba(0,0,0,.28)!important}
        .validation-banner{border-color:#613636!important}
        .input-panel,.recommendation-card,.income-card,.results-section,.detail-card{border-color:var(--line)!important}
        .status-card{border-color:#247863!important;background:radial-gradient(circle at 95% 0%,rgba(224,174,85,.18),transparent 16rem),linear-gradient(145deg,#0a4b40,#06352e)!important}
        .funding-ring::after{background:#073e35!important}
        .input-wrap,.inline-field{background:var(--surface)!important;border-color:var(--line-strong)!important}
        input,select{color:var(--ink);color-scheme:dark}
        select option{background:var(--surface);color:var(--ink)}
        .inline-field input{color:var(--ink)!important}
        .switch span{background:#405149!important}
        .switch span::after{background:#e6eeea!important;box-shadow:0 2px 7px rgba(0,0,0,.35)!important}
        .switch input:checked + span{background:var(--brand)!important}
        .nested-fields{background:var(--brand-soft)!important}
        .social-security-panel,.spouse-toggle{border-color:#2c4c41!important;background:linear-gradient(145deg,#13251f,#111a17)!important}
        .spouse-section{border-color:var(--line)!important;background:#101714!important}
        .trs-panel{border-color:#594828!important;background:linear-gradient(145deg,#211b11,#17150f)!important}
        .trs-panel .rules-note{border-top-color:#4c4028!important}
        .trs-panel .rules-note strong{color:var(--accent)!important}
        .rules-note{border-top-color:#2b4239!important}
        .assumptions summary{background:var(--surface-soft)!important}
        .historical-baseline{background:var(--surface-soft)!important;border-color:var(--line)!important}
        .historical-values div{background:var(--surface)!important;border-color:var(--line)!important}
        .portfolio-blend{background:var(--surface)!important;border-color:var(--line-strong)!important}
        .portfolio-blend>summary{background:var(--surface)!important}
        .portfolio-blend-body{border-top-color:var(--line)!important}
        .blend-input-wrap{background:var(--surface)!important;border-color:var(--line-strong)!important}
        .blend-summary{background:var(--brand-soft)!important}
        .blend-summary span{color:var(--muted)!important}
        .blend-warning{color:var(--warning)!important}
        .withdrawal-card{background:var(--surface)!important;border-color:var(--line)!important;box-shadow:0 8px 22px rgba(0,0,0,.22)!important}
        .withdrawal-card.featured{border-color:var(--accent)!important;box-shadow:0 8px 24px rgba(224,174,85,.10)!important}
        .withdrawal-plan-note{background:var(--brand-soft)!important;color:var(--ink)!important}
        .recommendation-metric{background:var(--brand-soft)!important}
        .chart-shell{background:linear-gradient(rgba(62,79,71,.38) 1px,transparent 1px),linear-gradient(90deg,rgba(62,79,71,.24) 1px,transparent 1px),#0f1512!important;border-color:var(--line)!important}
        .year-scrubber{background:var(--surface-soft)!important;border-color:var(--line)!important}
        .year-scrubber-detail{border-top-color:var(--line)!important}
        #projectionChart [stroke="#dfe7e3"]{stroke:#2a3933!important}
        #projectionChart [fill="#74817b"]{fill:#9eada6!important}
        #projectionChart [stroke="#0e6755"]{stroke:#54c4a5!important}
        #projectionChart [fill="#0e6755"]{fill:#54c4a5!important}
        #projectionChart stop[stop-color="#0e6755"]{stop-color:#54c4a5!important}
        #projectionChart [stroke="#263c35"]{stroke:#b5c6be!important}
        #projectionChart [fill="#263c35"]{fill:#d9e4df!important}
        #projectionChart [fill="#8a5a10"]{fill:#efbc62!important}
        #projectionChart [stroke="#b37b22"]{stroke:#d99f42!important}
        #projectionChart [fill="#b37b22"]{fill:#e0ae55!important}
        #projectionChart [stroke="#4f7da6"]{stroke:#78a8d0!important}
        #projectionChart [fill="#4f7da6"]{fill:#8cb9dd!important}
        #projectionChart [stroke="#6c91b1"]{stroke:#8eb9dc!important}
        #projectionChart [fill="#6c91b1"]{fill:#9ac4e5!important}
        input:-webkit-autofill{-webkit-text-fill-color:var(--ink)!important;-webkit-box-shadow:0 0 0 1000px var(--surface) inset!important}
      `;
      document.head.appendChild(style);
    }

    const themeMeta = document.querySelector('meta[name="theme-color"]') || (() => {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
      return meta;
    })();
    themeMeta.content = '#0b100e';
  }

  function readForm() {
    const data = {};
    document.querySelectorAll('input[id], select[id]').forEach((el) => {
      if (el.id === 'projectionYearSlider') return;
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

  function isJan1(date) {
    return date instanceof Date && date.getUTCMonth() === 0 && date.getUTCDate() === 1;
  }

  function annualPoints(result) {
    const byYear = new Map();
    const asOfYear = result.asOfDate.getUTCFullYear();

    function priority(point) {
      if (+point.date === +result.firstRetirementDate) return 100;
      if (+point.date === +result.asOfDate) return 90;
      if (result.spouse && +point.date === +result.bothRetiredDate) return 80;
      if (isJan1(point.date)) return 50;
      return 10;
    }

    result.timeline.forEach((point) => {
      if (!(point.date instanceof Date) || Number.isNaN(point.date.getTime())) return;
      const year = point.date.getUTCFullYear();
      const existing = byYear.get(year);
      if (!existing || priority(point) > existing.priority) {
        byYear.set(year, { point, priority: priority(point) });
      }
    });

    return [...byYear.entries()]
      .map(([year, entry]) => ({ year, point: entry.point }))
      .sort((a, b) => a.year - b.year);
  }

  function formatAge(age) {
    if (!Number.isFinite(age)) return '—';
    return age.toFixed(1).replace('.0', '');
  }

  function phaseForPoint(result, point) {
    const primaryRetirement = Model.addYears(result.primary.birth, result.primary.retirementAge);
    const spouseRetirement = result.spouse ? Model.addYears(result.spouse.birth, result.spouse.retirementAge) : null;
    if (point.date < result.firstRetirementDate) return 'Accumulating';
    if (result.spouse && point.date < result.bothRetiredDate) {
      if (point.date >= primaryRetirement && point.date < spouseRetirement) return 'You retired; spouse working';
      if (point.date >= spouseRetirement && point.date < primaryRetirement) return 'Spouse retired; you working';
      return 'Retirement transition';
    }
    return 'Retired';
  }

  function ensureScrubber() {
    if ($('projectionYearScrubber')) return;
    const chartShell = document.querySelector('.chart-shell');
    if (!chartShell) return;

    const scrubber = document.createElement('div');
    scrubber.id = 'projectionYearScrubber';
    scrubber.className = 'year-scrubber';
    scrubber.innerHTML = `
      <div class="year-scrubber-top">
        <div><span class="year-scrubber-label">Explore the projection by year</span><strong id="projectionSelectedYear">—</strong></div>
        <div class="year-scrubber-balance"><span>Projected account balance</span><strong id="projectionSelectedBalance">—</strong></div>
      </div>
      <label class="year-slider-label" for="projectionYearSlider">Projection year</label>
      <input id="projectionYearSlider" class="year-slider" type="range" min="0" max="1" step="1" value="0">
      <div class="year-slider-ends"><span id="projectionYearMin">—</span><span id="projectionYearMax">—</span></div>
      <div class="year-scrubber-detail" id="projectionSelectedDetail" aria-live="polite">Move the slider to inspect a year.</div>`;
    chartShell.insertAdjacentElement('afterend', scrubber);

    if (!$('projectionYearScrubberStyle')) {
      const style = document.createElement('style');
      style.id = 'projectionYearScrubberStyle';
      style.textContent = `
        .year-scrubber{margin:14px 0 4px;padding:14px 16px;border:1px solid var(--line,#26342e);border-radius:14px;background:var(--surface-soft,#161f1b)}
        .year-scrubber-top{display:flex;justify-content:space-between;gap:18px;align-items:flex-end}
        .year-scrubber-label,.year-scrubber-balance span{display:block;color:var(--muted,#9caaa4);font-size:.72rem}
        #projectionSelectedYear{display:block;margin-top:2px;font-size:1.25rem;color:var(--ink,#edf4f0)}
        .year-scrubber-balance{text-align:right}.year-scrubber-balance strong{display:block;margin-top:2px;font-size:1.25rem;color:var(--brand,#54c4a5);font-variant-numeric:tabular-nums}
        .year-slider-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
        .year-slider{width:100%;margin:14px 0 3px;accent-color:var(--brand,#54c4a5);cursor:pointer}
        .year-slider-ends{display:flex;justify-content:space-between;color:var(--muted,#9caaa4);font-size:.7rem;font-variant-numeric:tabular-nums}
        .year-scrubber-detail{margin-top:10px;padding-top:9px;border-top:1px solid var(--line,#26342e);color:var(--muted,#9caaa4);font-size:.78rem;line-height:1.4}
        .year-scrubber-detail strong{color:var(--ink,#edf4f0)}
        @media(max-width:620px){.year-scrubber-top{align-items:flex-start}.year-scrubber-balance strong,#projectionSelectedYear{font-size:1.08rem}.year-scrubber{padding:13px}}
      `;
      document.head.appendChild(style);
    }

    $('projectionYearSlider').addEventListener('input', (event) => {
      selectedYear = Number(event.target.value);
      userSelected = true;
      queueRefresh();
    });
  }

  function markerGeometry(result, point) {
    const width = 1000, height = 360;
    const pad = { left: 72, right: 28, top: 28, bottom: 48 };
    const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
    const maxX = Math.max(...result.timeline.map((item) => item.yearsFromNow), 1);
    const targetValue = result.requiredNestEggNominal || 0;
    const maxValue = niceMax(Math.max(...result.timeline.map((item) => item.nominalBalance), targetValue, 1) * 1.05);
    const x = pad.left + (point.yearsFromNow / maxX) * plotW;
    const y = pad.top + plotH - (Math.max(point.nominalBalance, 0) / maxValue) * plotH;
    return { x, y, pad, height };
  }

  function drawSelectedMarker(result, point, year) {
    const svg = $('projectionChart');
    if (!svg) return;
    svg.querySelector('#projectionYearMarker')?.remove();
    const { x, y, pad, height } = markerGeometry(result, point);
    const ns = 'http://www.w3.org/2000/svg';
    const group = document.createElementNS(ns, 'g');
    group.id = 'projectionYearMarker';
    group.setAttribute('pointer-events', 'none');

    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', x); line.setAttribute('x2', x); line.setAttribute('y1', pad.top); line.setAttribute('y2', height - pad.bottom);
    line.setAttribute('stroke', '#b5c6be'); line.setAttribute('stroke-width', '2'); line.setAttribute('stroke-dasharray', '4 5'); line.setAttribute('opacity', '.7');

    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', '6'); dot.setAttribute('fill', '#121916'); dot.setAttribute('stroke', '#54c4a5'); dot.setAttribute('stroke-width', '4');

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', Math.min(x + 9, 850)); label.setAttribute('y', Math.max(y - 10, 20)); label.setAttribute('fill', '#d9e4df'); label.setAttribute('font-size', '12'); label.setAttribute('font-weight', '800');
    label.textContent = `${year}: ${compactMoney.format(point.nominalBalance)}`;
    group.append(line, dot, label);
    svg.appendChild(group);
  }

  function refresh() {
    ensureScrubber();
    const slider = $('projectionYearSlider');
    if (!slider) return;
    const result = Model.analyze(readForm());
    if (!result || result.errors?.length || !Array.isArray(result.timeline) || !result.timeline.length) return;
    const annual = annualPoints(result);
    if (!annual.length) return;

    const minYear = annual[0].year, maxYear = annual[annual.length - 1].year;
    const retirementYear = result.firstRetirementDate.getUTCFullYear();
    if (!userSelected || selectedYear == null) selectedYear = Math.min(Math.max(retirementYear, minYear), maxYear);
    selectedYear = Math.min(Math.max(selectedYear, minYear), maxYear);

    slider.min = String(minYear); slider.max = String(maxYear); slider.step = '1'; slider.value = String(selectedYear);
    $('projectionYearMin').textContent = String(minYear); $('projectionYearMax').textContent = String(maxYear);

    let selected = annual.find((entry) => entry.year === selectedYear);
    if (!selected) {
      selected = annual.reduce((best, entry) => Math.abs(entry.year - selectedYear) < Math.abs(best.year - selectedYear) ? entry : best, annual[0]);
      selectedYear = selected.year; slider.value = String(selectedYear);
    }

    const point = selected.point;
    $('projectionSelectedYear').textContent = String(selected.year);
    $('projectionSelectedBalance').textContent = money.format(point.nominalBalance);
    const current = +point.date === +result.asOfDate;
    const isFirstRetirement = +point.date === +result.firstRetirementDate;
    const dateText = current ? `Current estimate as of ${dateFmt.format(point.date)}` : isFirstRetirement ? `First retirement: ${dateFmt.format(point.date)}` : `Projection point: ${dateFmt.format(point.date)}`;
    const ages = result.spouse ? `Your age: <strong>${formatAge(point.primaryAge)}</strong> · Spouse age: <strong>${formatAge(point.spouseAge)}</strong>` : `Your age: <strong>${formatAge(point.primaryAge)}</strong>`;
    const phase = phaseForPoint(result, point);
    $('projectionSelectedDetail').innerHTML = `${dateText} · ${ages} · Phase: <strong>${phase}</strong>. Values are actual modeled account dollars, not inflation-adjusted purchasing power.`;
    drawSelectedMarker(result, point, selected.year);
  }

  function queueRefresh() { requestAnimationFrame(() => requestAnimationFrame(refresh)); }

  function init() {
    installDarkTheme();
    ensureScrubber();
    queueRefresh();
    document.addEventListener('input', (event) => { if (event.target?.id !== 'projectionYearSlider') queueRefresh(); });
    document.addEventListener('change', (event) => { if (event.target?.id !== 'projectionYearSlider') queueRefresh(); });
    document.addEventListener('click', (event) => {
      if (event.target?.closest('[data-display-mode], #resetButton')) {
        if (event.target?.closest('#resetButton')) userSelected = false;
        queueRefresh();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);