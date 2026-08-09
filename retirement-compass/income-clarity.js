(function (root) {
  'use strict';

  const Model = root.HouseholdModel;
  if (!Model) return;

  const HISTORICAL_INFLATION_PCT = 3.07;
  const HISTORICAL_INFLATION_PERIOD = '1928–2025 CPI-U CAGR';

  if (Model.DEFAULTS) {
    Model.DEFAULTS = Object.freeze({ ...Model.DEFAULTS, inflationPct: HISTORICAL_INFLATION_PCT });
  }
  if (Model.HISTORICAL_ASSUMPTIONS) {
    Model.HISTORICAL_ASSUMPTIONS = Object.freeze({
      ...Model.HISTORICAL_ASSUMPTIONS,
      inflationPct: HISTORICAL_INFLATION_PCT,
      inflationPeriod: HISTORICAL_INFLATION_PERIOD
    });
  }

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

  const $ = (id) => document.getElementById(id);

  function readForm() {
    const data = {};
    document.querySelectorAll('input[id], select[id]').forEach((el) => {
      data[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return data;
  }

  function isRealMode() {
    return document.querySelector('[data-display-mode="real"]')?.classList.contains('is-active') !== false;
  }

  function formatDate(date) {
    return date instanceof Date && !Number.isNaN(date.getTime()) ? dateFmt.format(date) : '—';
  }

  function utcDate(year, month, day) {
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCMonth() !== month) d.setUTCDate(0);
    return d;
  }

  function exactCalendarYearsBetween(start, end) {
    if (!(start instanceof Date) || !(end instanceof Date) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    if (+start === +end) return 0;
    if (end < start) return -exactCalendarYearsBetween(end, start);

    let wholeYears = end.getUTCFullYear() - start.getUTCFullYear();
    let anniversary = utcDate(start.getUTCFullYear() + wholeYears, start.getUTCMonth(), start.getUTCDate());
    if (anniversary > end) {
      wholeYears -= 1;
      anniversary = utcDate(start.getUTCFullYear() + wholeYears, start.getUTCMonth(), start.getUTCDate());
    }
    if (+anniversary === +end) return wholeYears;

    const nextAnniversary = utcDate(start.getUTCFullYear() + wholeYears + 1, start.getUTCMonth(), start.getUTCDate());
    return wholeYears + (end - anniversary) / Math.max(nextAnniversary - anniversary, 1);
  }

  function firstRetirementFactor(result) {
    const years = Math.max(exactCalendarYearsBetween(result.asOfDate, result.firstRetirementDate), 0);
    return Math.pow(1 + result.input.inflationPct / 100, years);
  }

  function displayAnnual(realValue, result) {
    return isRealMode() ? realValue : realValue * firstRetirementFactor(result);
  }

  function applyHistoricalInflationBaseline() {
    const toggle = $('historicalBaselineEnabled');
    const input = $('inflationPct');
    if (toggle?.checked && input && Number(input.value) !== HISTORICAL_INFLATION_PCT) {
      input.value = HISTORICAL_INFLATION_PCT.toFixed(2);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const box = $('historicalBaselineBox');
    const inflationCard = box?.querySelector('.historical-values > div:nth-child(3)');
    if (inflationCard) {
      const value = inflationCard.querySelector('b');
      const detail = inflationCard.querySelectorAll('span')[1];
      if (value) value.textContent = `${HISTORICAL_INFLATION_PCT.toFixed(2)}%`;
      if (detail) detail.textContent = HISTORICAL_INFLATION_PERIOD;
    }
  }

  function ensureIncomeBreakdown() {
    const card = document.querySelector('.income-card');
    if (!card) return;

    const label = card.querySelector('.card-label');
    if (label) label.textContent = 'How your retirement spending is funded';

    const nominalButton = document.querySelector('[data-display-mode="nominal"]');
    if (nominalButton) {
      nominalButton.textContent = 'First-retirement dollars';
      nominalButton.title = 'Show summary amounts in nominal dollars at the date of the first retirement.';
    }

    if (!$('spendingGoalBreakdownResult')) {
      const row = document.createElement('div');
      row.className = 'income-line income-goal-line';
      row.innerHTML = '<span>Household spending goal</span><strong id="spendingGoalBreakdownResult">—</strong>';
      label?.insertAdjacentElement('afterend', row);
    }

    const primaryRow = $('primarySocialSecurityResult')?.closest('.income-line');
    const spouseRow = $('spouseSocialSecurityResult')?.closest('.income-line');
    const trsRow = $('trsIncomeResult')?.closest('.income-line');
    const otherRow = $('otherIncomeResult')?.closest('.income-line');
    const portfolioRow = $('portfolioGapResult')?.closest('.income-line');

    if (primaryRow) primaryRow.querySelector('span').textContent = 'Less: Your Social Security';
    if (spouseRow) spouseRow.querySelector('span').textContent = 'Less: Spouse Social Security';
    if (trsRow) trsRow.querySelector('span').textContent = 'Less: Alabama TRS pension';
    if (otherRow) otherRow.querySelector('span').textContent = 'Less: Other retirement income';
    if (portfolioRow) portfolioRow.querySelector('span').textContent = 'Needed from retirement accounts';

    if (!$('retirementAccountWithdrawalNote')) {
      const note = document.createElement('div');
      note.id = 'retirementAccountWithdrawalNote';
      note.className = 'retirement-account-note';
      portfolioRow?.insertAdjacentElement('afterend', note);
    }

    if (!$('incomeClarityStyle')) {
      const style = document.createElement('style');
      style.id = 'incomeClarityStyle';
      style.textContent = `
        .income-goal-line{padding-top:4px;padding-bottom:12px;margin-bottom:2px;color:var(--ink);font-weight:750;border-bottom:2px solid var(--line-strong,#cad6d0)}
        .income-goal-line strong{color:var(--ink);font-size:1.02em}
        .retirement-account-note{margin-top:12px;padding:11px 12px;border-radius:12px;background:var(--brand-soft,#e8f3ef);color:var(--muted,#66736d);font-size:.76rem;line-height:1.45}
        .retirement-account-note strong{color:var(--brand-strong,#075346)}
      `;
      document.head.appendChild(style);
    }
  }

  function niceMax(value) {
    if (!(value > 0)) return 1;
    const exponent = Math.floor(Math.log10(value));
    const base = 10 ** exponent;
    const normalized = value / base;
    return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * base;
  }

  function renderNominalAccountChart(result) {
    const svg = $('projectionChart');
    if (!svg || !Array.isArray(result.timeline) || !result.timeline.length) return;

    const width = 1000;
    const height = 360;
    const pad = { left: 72, right: 28, top: 28, bottom: 48 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const data = result.timeline.map((point) => ({ ...point, value: point.nominalBalance }));
    const maxX = Math.max(...data.map((point) => point.yearsFromNow), 1);
    const targetValue = result.requiredNestEggNominal || 0;
    const maxValue = niceMax(Math.max(...data.map((point) => point.value), targetValue, 1) * 1.05);
    const x = (t) => pad.left + (t / maxX) * plotW;
    const y = (value) => pad.top + plotH - (Math.max(value, 0) / maxValue) * plotH;

    const grid = [];
    for (let i = 0; i <= 4; i += 1) {
      const value = maxValue * (1 - i / 4);
      const yy = pad.top + plotH * i / 4;
      grid.push(`<line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" stroke="#dfe7e3"/>`);
      grid.push(`<text x="${pad.left - 10}" y="${yy + 4}" text-anchor="end" fill="#74817b" font-size="12">${compactMoney.format(value)}</text>`);
    }

    const ticks = [];
    const startYear = result.asOfDate.getUTCFullYear();
    for (let i = 0; i <= 7; i += 1) {
      const t = maxX * i / 7;
      ticks.push(`<text x="${x(t)}" y="${height - 14}" text-anchor="middle" fill="#74817b" font-size="12">${startYear + Math.round(t)}</text>`);
    }

    const points = data.map((point) => `${x(point.yearsFromNow).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ');
    const area = `${x(0)},${pad.top + plotH} ${points} ${x(maxX)},${pad.top + plotH}`;

    function marker(date, label, color, dash) {
      const t = Model.yearsBetween(result.asOfDate, date);
      if (t < 0 || t > maxX) return '';
      const xx = x(t);
      return `<line x1="${xx}" y1="${pad.top}" x2="${xx}" y2="${pad.top + plotH}" stroke="${color}" stroke-width="2" stroke-dasharray="${dash}"/><text x="${Math.min(xx + 7, width - 120)}" y="${pad.top + 14}" fill="${color}" font-size="11" font-weight="700">${label}</text>`;
    }

    let markers = marker(Model.addYears(result.primary.birth, result.primary.retirementAge), 'You retire', '#b37b22', '6 6');
    if (result.spouse) markers += marker(Model.addYears(result.spouse.birth, result.spouse.retirementAge), 'Spouse retires', '#d8a34a', '6 6');
    if (result.socialSecurity?.enabled) markers += marker(result.socialSecurity.claimDate, 'Your SS', '#4f7da6', '2 6');
    if (result.spouse && result.spouseSocialSecurity?.enabled) markers += marker(result.spouseSocialSecurity.claimDate, 'Spouse SS', '#6c91b1', '2 6');

    const targetX = x(Math.max(Model.yearsBetween(result.asOfDate, result.firstRetirementDate), 0));

    svg.innerHTML = `<title id="chartTitle">Projected retirement account balance in actual future dollars</title><desc id="chartDesc">The account balance compounds using the modeled nominal investment return. Inflation is not subtracted from account growth. After retirement, inflation can affect the balance indirectly because the modeled spending withdrawals rise over time.</desc><defs><linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#0e6755" stop-opacity="0.24"/><stop offset="100%" stop-color="#0e6755" stop-opacity="0.02"/></linearGradient></defs>${grid.join('')}<polygon points="${area}" fill="url(#areaGradient)"/>${markers}${targetValue > 0 ? `<circle cx="${targetX}" cy="${y(targetValue)}" r="5" fill="#d8a34a" stroke="#fff" stroke-width="2"/><text x="${Math.min(targetX + 8, width - 130)}" y="${Math.max(y(targetValue) - 8, 18)}" fill="#8a5a10" font-size="11">Target ${compactMoney.format(targetValue)}</text>` : ''}<polyline points="${points}" fill="none" stroke="#0e6755" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${ticks.join('')}`;

    if ($('projectionHeading')) $('projectionHeading').textContent = 'Projected retirement account balance';
    if ($('chartDescription')) {
      $('chartDescription').textContent = 'Actual modeled account dollars. Investment returns compound without subtracting inflation; after retirement, inflation only affects the chart through the size of modeled withdrawals.';
    }
    if ($('chartFooterLeft')) {
      $('chartFooterLeft').textContent = `First retirement: ${formatDate(result.firstRetirementDate)}${result.spouse ? `; both retired by ${formatDate(result.bothRetiredDate)}` : ''}.`;
    }
    if ($('chartFooterRight')) {
      $('chartFooterRight').textContent = result.depletionDate
        ? `Portfolio reaches $0 around ${formatDate(result.depletionDate)}.`
        : `Ending account balance: ${money.format(result.endingBalanceNominal)}.`;
    }
  }

  function render() {
    ensureIncomeBreakdown();
    const result = Model.analyze(readForm());
    if (!result || result.errors?.length) return;

    const spending = displayAnnual(result.input.desiredSpending, result);
    const withdrawal = displayAnnual(result.portfolioGapAfterAllIncomeReal, result);
    const primarySs = displayAnnual(result.socialSecurity?.annualBenefitReal || 0, result);
    const spouseSs = displayAnnual(result.spouseSocialSecurity?.annualBenefitReal || 0, result);
    const trsReal = result.trs?.eligible ? result.trs.annualBenefitRealAtStart : 0;
    const trs = displayAnnual(trsReal, result);
    const other = displayAnnual(result.input.otherRetirementIncome || 0, result);

    if ($('spendingGoalBreakdownResult')) $('spendingGoalBreakdownResult').textContent = `${money.format(spending)}/yr`;
    if ($('portfolioGapResult')) $('portfolioGapResult').textContent = `${money.format(withdrawal)}/yr`;
    if ($('primarySocialSecurityResult')) $('primarySocialSecurityResult').textContent = `${money.format(primarySs)}/yr`;
    if ($('spouseSocialSecurityResult') && result.spouse) $('spouseSocialSecurityResult').textContent = `${money.format(spouseSs)}/yr`;
    if ($('trsIncomeResult') && result.trs?.eligible) $('trsIncomeResult').textContent = `${money.format(trs)}/yr`;
    if ($('otherIncomeResult')) $('otherIncomeResult').textContent = `${money.format(other)}/yr`;

    const spouseInvestmentPool = Boolean(
      result.spouse &&
      (Number(result.input.spouseCurrentSavings) > 0 || Number(result.input.spouseEmployeeContributionPct) > 0)
    );
    const sourceText = spouseInvestmentPool
      ? 'your combined invested retirement accounts (your 401(k) plus the spouse voluntary retirement account)'
      : 'your 401(k) / invested retirement portfolio';

    const note = $('retirementAccountWithdrawalNote');
    if (note) {
      note.innerHTML = `This is <strong>not an extra shortfall</strong>. It is the modeled withdrawal needed from ${sourceText}: about <strong>${money.format(withdrawal)}/yr</strong>, or <strong>${money.format(withdrawal / 12)}/mo</strong>, to bring total household income up to the spending goal.`;
    }

    renderNominalAccountChart(result);
  }

  function scheduleRender() {
    window.requestAnimationFrame(render);
  }

  function init() {
    ensureIncomeBreakdown();
    applyHistoricalInflationBaseline();
    render();

    const baselineToggle = $('historicalBaselineEnabled');
    baselineToggle?.addEventListener('change', () => {
      if (baselineToggle.checked) setTimeout(applyHistoricalInflationBaseline, 0);
    });

    $('resetButton')?.addEventListener('click', () => {
      setTimeout(() => {
        applyHistoricalInflationBaseline();
        render();
      }, 0);
    });

    document.addEventListener('input', scheduleRender);
    document.addEventListener('change', scheduleRender);
    document.addEventListener('click', (event) => {
      if (event.target?.closest('[data-display-mode], #resetButton')) scheduleRender();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
