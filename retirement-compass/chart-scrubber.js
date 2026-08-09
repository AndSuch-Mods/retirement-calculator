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

    result.timeline.forEach((point) => {
      if (!(point.date instanceof Date) || Number.isNaN(point.date.getTime())) return;
      const year = point.date.getUTCFullYear();
      const existing = byYear.get(year);
      const isAsOf = +point.date === +result.asOfDate;

      if (!existing || isJan1(point.date) || (year === asOfYear && isAsOf)) {
        if (year === asOfYear && existing && +existing.date === +result.asOfDate) return;
        byYear.set(year, point);
      }
    });

    return [...byYear.entries()]
      .map(([year, point]) => ({ year, point }))
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
        <div>
          <span class="year-scrubber-label">Explore the projection by year</span>
          <strong id="projectionSelectedYear">—</strong>
        </div>
        <div class="year-scrubber-balance">
          <span>Projected account balance</span>
          <strong id="projectionSelectedBalance">—</strong>
        </div>
      </div>
      <label class="year-slider-label" for="projectionYearSlider">Projection year</label>
      <input id="projectionYearSlider" class="year-slider" type="range" min="0" max="1" step="1" value="0">
      <div class="year-slider-ends"><span id="projectionYearMin">—</span><span id="projectionYearMax">—</span></div>
      <div class="year-scrubber-detail" id="projectionSelectedDetail" aria-live="polite">Move the slider to inspect a year.</div>`;

    chartShell.insertAdjacentElement('afterend', scrubber);

    const style = document.createElement('style');
    style.id = 'projectionYearScrubberStyle';
    style.textContent = `
      .year-scrubber{margin:14px 0 4px;padding:14px 16px;border:1px solid var(--line,#dce4e0);border-radius:14px;background:var(--surface-soft,#f8faf9)}
      .year-scrubber-top{display:flex;justify-content:space-between;gap:18px;align-items:flex-end}
      .year-scrubber-label,.year-scrubber-balance span{display:block;color:var(--muted,#66736d);font-size:.72rem}
      #projectionSelectedYear{display:block;margin-top:2px;font-size:1.25rem;color:var(--ink,#17211d)}
      .year-scrubber-balance{text-align:right}
      .year-scrubber-balance strong{display:block;margin-top:2px;font-size:1.25rem;color:var(--brand,#0e6755);font-variant-numeric:tabular-nums}
      .year-slider-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      .year-slider{width:100%;margin:14px 0 3px;accent-color:var(--brand,#0e6755);cursor:pointer}
      .year-slider-ends{display:flex;justify-content:space-between;color:var(--muted,#66736d);font-size:.7rem;font-variant-numeric:tabular-nums}
      .year-scrubber-detail{margin-top:10px;padding-top:9px;border-top:1px solid var(--line,#dce4e0);color:var(--muted,#66736d);font-size:.78rem;line-height:1.4}
      .year-scrubber-detail strong{color:var(--ink,#17211d)}
      @media(max-width:620px){.year-scrubber-top{align-items:flex-start}.year-scrubber-balance strong,#projectionSelectedYear{font-size:1.08rem}.year-scrubber{padding:13px}}
    `;
    document.head.appendChild(style);

    $('projectionYearSlider').addEventListener('input', (event) => {
      selectedYear = Number(event.target.value);
      userSelected = true;
      queueRefresh();
    });
  }

  function markerGeometry(result, point) {
    const width = 1000;
    const height = 360;
    const pad = { left: 72, right: 28, top: 28, bottom: 48 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const maxX = Math.max(...result.timeline.map((item) => item.yearsFromNow), 1);
    const targetValue = result.requiredNestEggNominal || 0;
    const maxValue = niceMax(Math.max(
      ...result.timeline.map((item) => item.nominalBalance),
      targetValue,
      1
    ) * 1.05);
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
    line.setAttribute('x1', x);
    line.setAttribute('x2', x);
    line.setAttribute('y1', pad.top);
    line.setAttribute('y2', height - pad.bottom);
    line.setAttribute('stroke', '#263c35');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '4 5');
    line.setAttribute('opacity', '.7');

    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
    dot.setAttribute('r', '6');
    dot.setAttribute('fill', '#ffffff');
    dot.setAttribute('stroke', '#0e6755');
    dot.setAttribute('stroke-width', '4');

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', Math.min(x + 9, 850));
    label.setAttribute('y', Math.max(y - 10, 20));
    label.setAttribute('fill', '#263c35');
    label.setAttribute('font-size', '12');
    label.setAttribute('font-weight', '800');
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

    const minYear = annual[0].year;
    const maxYear = annual[annual.length - 1].year;
    const retirementYear = result.firstRetirementDate.getUTCFullYear();

    if (!userSelected || selectedYear == null) selectedYear = Math.min(Math.max(retirementYear, minYear), maxYear);
    selectedYear = Math.min(Math.max(selectedYear, minYear), maxYear);

    slider.min = String(minYear);
    slider.max = String(maxYear);
    slider.step = '1';
    slider.value = String(selectedYear);
    $('projectionYearMin').textContent = String(minYear);
    $('projectionYearMax').textContent = String(maxYear);

    let selected = annual.find((entry) => entry.year === selectedYear);
    if (!selected) {
      selected = annual.reduce((best, entry) => Math.abs(entry.year - selectedYear) < Math.abs(best.year - selectedYear) ? entry : best, annual[0]);
      selectedYear = selected.year;
      slider.value = String(selectedYear);
    }

    const point = selected.point;
    $('projectionSelectedYear').textContent = String(selected.year);
    $('projectionSelectedBalance').textContent = money.format(point.nominalBalance);

    const current = +point.date === +result.asOfDate;
    const dateText = current ? `Current estimate as of ${dateFmt.format(point.date)}` : `Projection point: ${dateFmt.format(point.date)}`;
    const ages = result.spouse
      ? `Your age: <strong>${formatAge(point.primaryAge)}</strong> · Spouse age: <strong>${formatAge(point.spouseAge)}</strong>`
      : `Your age: <strong>${formatAge(point.primaryAge)}</strong>`;
    const phase = phaseForPoint(result, point);

    $('projectionSelectedDetail').innerHTML = `${dateText} · ${ages} · Phase: <strong>${phase}</strong>. Values are actual modeled account dollars, not inflation-adjusted purchasing power.`;
    drawSelectedMarker(result, point, selected.year);
  }

  function queueRefresh() {
    requestAnimationFrame(() => requestAnimationFrame(refresh));
  }

  function init() {
    ensureScrubber();
    queueRefresh();

    document.addEventListener('input', (event) => {
      if (event.target?.id === 'projectionYearSlider') return;
      queueRefresh();
    });
    document.addEventListener('change', (event) => {
      if (event.target?.id === 'projectionYearSlider') return;
      queueRefresh();
    });
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
