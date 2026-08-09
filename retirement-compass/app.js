(function () {
  'use strict';

  const Model = window.RetirementModel;
  const displayState = { mode: 'real' };
  const inputIds = [
    'currentAge', 'retirementAge', 'planThroughAge', 'currentSavings', 'currentIncome',
    'employeeContributionPct', 'employerMatchRatePct', 'employerMatchCapPct', 'salaryGrowthPct',
    'autoIncreaseEnabled', 'autoIncreasePctPoints', 'maxEmployeeContributionPct',
    'desiredSpending', 'otherRetirementIncome', 'socialSecurityEnabled',
    'socialSecurityClaimAge', 'socialSecurityCareerStartAge', 'preRetirementReturnPct',
    'retirementReturnPct', 'inflationPct'
  ];

  const $ = (id) => document.getElementById(id);
  const currency = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0
  });
  const compactCurrency = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1
  });
  const percent1 = new Intl.NumberFormat('en-US', {
    style: 'percent', maximumFractionDigits: 1, minimumFractionDigits: 1
  });

  function getFormValues() {
    const values = {};
    inputIds.forEach((id) => {
      const el = $(id);
      values[id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return values;
  }

  function setFormValues(values) {
    inputIds.forEach((id) => {
      const el = $(id);
      if (!el || values[id] === undefined) return;
      if (el.type === 'checkbox') el.checked = Boolean(values[id]);
      else el.value = values[id];
    });
    syncAutoIncreaseVisibility();
    syncSocialSecurityVisibility();
  }

  function syncAutoIncreaseVisibility() {
    $('autoIncreaseFields').hidden = !$('autoIncreaseEnabled').checked;
  }

  function syncSocialSecurityVisibility() {
    $('socialSecurityFields').hidden = !$('socialSecurityEnabled').checked;
  }

  function dollarValue(realValue, nominalValue) {
    return displayState.mode === 'real' ? realValue : nominalValue;
  }

  function formatMoney(value) {
    if (!Number.isFinite(value)) return '—';
    return currency.format(Math.round(value));
  }

  function formatSignedMoney(value) {
    if (!Number.isFinite(value)) return '—';
    const abs = formatMoney(Math.abs(value));
    if (value > 0) return `+${abs}`;
    if (value < 0) return `−${abs}`;
    return abs;
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? percent1.format(value) : '—';
  }

  function formatAge(age) {
    if (!Number.isFinite(age)) return '—';
    const whole = Math.floor(age + 1e-8);
    const months = Math.round((age - whole) * 12);
    return months ? `${whole} + ${months} mo` : `${whole}`;
  }

  function renderValidation(result) {
    const banner = $('validationBanner');
    if (!result.errors.length) {
      banner.hidden = true;
      banner.textContent = '';
      return false;
    }
    banner.hidden = false;
    banner.textContent = result.errors.join(' ');
    return true;
  }

  function setResultsDimmed(dimmed) {
    document.querySelectorAll('.summary-panel, .results-section, .detail-grid').forEach((el) => {
      el.style.opacity = dimmed ? '0.45' : '1';
      el.style.pointerEvents = dimmed ? 'none' : '';
    });
  }

  function renderStatus(result) {
    const inflationFactor = Math.pow(1 + result.input.inflationPct / 100, result.workYears);
    const projected = dollarValue(result.projectedNestEggReal, result.projectedNestEggNominal);
    const required = dollarValue(result.requiredNestEggReal, result.requiredNestEggNominal);
    const surplus = dollarValue(result.surplusReal, result.surplusReal * inflationFactor);
    const ratio = Number.isFinite(result.fundingRatio) ? result.fundingRatio : 1;
    const ratioDisplay = result.requiredNestEggReal > 0 ? Math.max(0, ratio) : 1;
    const ratioPct = Math.round(ratioDisplay * 100);
    const ringDegrees = Math.min(ratioDisplay, 1) * 360;

    $('summaryModeLabel').textContent = displayState.mode === 'real' ? 'Today’s dollars' : 'Retirement-year dollars';
    $('projectedNestEgg').textContent = formatMoney(projected);
    $('requiredNestEgg').textContent = result.requiredNestEggReal > 0 ? formatMoney(required) : '$0';
    $('surplusShortfall').textContent = formatSignedMoney(surplus);
    $('fundingPercent').textContent = result.requiredNestEggReal > 0 ? `${ratioPct}%` : '100%';
    $('fundingRing').style.background = `conic-gradient(#d8a34a ${ringDegrees}deg, rgba(255,255,255,0.15) ${ringDegrees}deg)`;

    const pill = $('statusPill');
    pill.classList.remove('positive', 'negative');
    if (result.requiredNestEggReal <= 0) {
      pill.textContent = 'Income covers goal';
      pill.classList.add('positive');
      $('statusHeadline').textContent = 'Your non-portfolio retirement income covers the spending goal.';
      $('statusExplanation').textContent = 'This portfolio is modeled as extra cushion because no annual withdrawal is required from it.';
    } else if (result.onTrack) {
      pill.textContent = 'On track';
      pill.classList.add('positive');
      $('statusHeadline').textContent = `You’re modeled at ${ratioPct}% of the retirement target.`;
      $('statusExplanation').textContent = 'Under these assumptions, the portfolio lasts through the full retirement window.';
    } else {
      pill.textContent = 'Needs adjustment';
      pill.classList.add('negative');
      $('statusHeadline').textContent = `You’re modeled at ${ratioPct}% of the retirement target.`;
      $('statusExplanation').textContent = result.depletedAtAge
        ? `At the modeled spending level, the portfolio reaches $0 around age ${result.depletedAtAge}.`
        : 'The projected balance is below the amount needed to fund the full modeled retirement window.';
    }
  }

  function renderRecommendation(result) {
    const metric = $('recommendationMetric');
    metric.hidden = false;

    if (result.requiredNestEggReal <= 0) {
      $('recommendationTitle').textContent = 'Your portfolio is optional for the stated spending goal';
      $('recommendationText').textContent = 'Estimated Social Security plus other retirement income meets or exceeds your spending goal in the modeled years.';
      $('recommendationMetricLabel').textContent = 'Portfolio income modeled as extra';
      $('recommendationMetricValue').textContent = `${formatMoney(result.sustainablePortfolioIncomeReal)} / yr`;
      return;
    }

    if (result.onTrack) {
      $('recommendationTitle').textContent = 'Your current path clears the modeled target';
      $('recommendationText').textContent = 'The plan funds the changing portfolio need before and after Social Security starts, using the return and inflation assumptions shown.';
      $('recommendationMetricLabel').textContent = 'Cushion at retirement, today’s dollars';
      $('recommendationMetricValue').textContent = formatMoney(Math.max(result.surplusReal, 0));
      return;
    }

    if (result.requiredFlatEmployeeRate != null) {
      const targetRate = result.requiredFlatEmployeeRate;
      $('recommendationTitle').textContent = 'The savings rate is the cleanest lever to pull';
      $('recommendationText').textContent = `A planned employee contribution of about ${formatPercent(targetRate)} is modeled to reach the target, with IRS annual limits automatically applied each year.`;
      $('recommendationMetricLabel').textContent = 'Approx. extra employee savings this year';
      $('recommendationMetricValue').textContent = `${formatMoney(result.additionalMonthlyContributionNeeded)} / mo`;
    } else {
      $('recommendationTitle').textContent = 'Contribution changes alone do not close the modeled gap';
      $('recommendationText').textContent = 'Even a very high planned contribution is constrained by IRS annual limits. Retirement age, spending, outside income, or assumptions need to change too.';
      $('recommendationMetricLabel').textContent = 'Modeled shortfall at retirement';
      $('recommendationMetricValue').textContent = formatMoney(Math.abs(result.surplusReal));
    }
  }

  function renderSocialSecurityEstimate(result) {
    const ss = result.socialSecurity;
    if (!ss.enabled) {
      $('socialSecurityEstimateInline').textContent = 'Social Security estimate is turned off.';
      $('socialSecurityEstimateDetail').textContent = 'Turn it on to include an estimated retirement benefit in the plan.';
      return;
    }
    $('socialSecurityEstimateInline').textContent = `${formatMoney(ss.monthlyBenefitReal)} / month at age ${ss.claimAge} in today’s dollars`;
    $('socialSecurityEstimateDetail').textContent = `Estimated from ${ss.earningsYearsModeled} modeled earnings years, with full retirement age ${formatAge(ss.fullRetirementAge)} and current-law claiming adjustments.`;
  }

  function renderIncome(result) {
    const retirementInflationFactor = Math.pow(1 + result.input.inflationPct / 100, result.workYears);
    const modeFactor = displayState.mode === 'real' ? 1 : retirementInflationFactor;
    $('spendingGoalResult').textContent = `${formatMoney(result.input.desiredSpending * modeFactor)} / yr`;
    $('socialSecurityIncomeResult').textContent = result.socialSecurity.enabled
      ? `${formatMoney(result.socialSecurity.annualBenefitReal * modeFactor)} / yr at ${result.socialSecurity.claimAge}`
      : 'Off';
    $('otherIncomeResult').textContent = `${formatMoney(result.input.otherRetirementIncome * modeFactor)} / yr`;
    $('portfolioGapBeforeSsResult').textContent = `${formatMoney(result.portfolioGapBeforeSocialSecurityReal * modeFactor)} / yr`;
    $('portfolioGapResult').textContent = `${formatMoney(result.portfolioGapAfterSocialSecurityReal * modeFactor)} / yr`;
    $('sustainableIncomeResult').textContent = `${formatMoney(result.sustainablePortfolioIncomeReal * modeFactor)} / yr`;
  }

  function renderDetails(result) {
    const startingTotal = result.startingEmployeeRate + result.startingMatchRate;
    const endingTotal = result.endingEmployeeRate + result.endingMatchRate;
    $('contributionRateResult').textContent = `${formatPercent(startingTotal)} total to start`;

    let contributionCopy;
    if (result.contributionCapEvents.length) {
      const first = result.firstContributionCapEvent;
      contributionCopy = `Your planned rate first reaches an IRS contribution limit in ${first.year} around age ${Math.round(first.age)}. The model caps contributions automatically from there.`;
    } else if (result.input.autoIncreaseEnabled) {
      contributionCopy = `Effective employee savings rise from ${formatPercent(result.startingEmployeeRate)} to ${formatPercent(result.endingEmployeeRate)}; modeled total ends near ${formatPercent(endingTotal)} including match.`;
    } else {
      contributionCopy = `${formatPercent(result.startingEmployeeRate)} from you + ${formatPercent(result.startingMatchRate)} effective employer match after annual IRS limits.`;
    }
    $('contributionDetailResult').textContent = contributionCopy;

    $('yearsToRetirementResult').textContent = `${result.workYears} years`;
    $('retirementDurationResult').textContent = `Then ${result.retirementYears} modeled retirement years, through age ${result.input.planThroughAge}.`;
    $('realReturnResult').textContent = formatPercent(result.realRetirementReturn);

    if (result.socialSecurity.enabled) {
      $('socialSecurityDetailResult').textContent = `${formatMoney(result.socialSecurity.monthlyBenefitReal)} / mo at ${result.socialSecurity.claimAge}`;
      $('socialSecurityDetailCopy').textContent = `Estimated full-retirement age ${formatAge(result.socialSecurity.fullRetirementAge)}. Benefit uses a modeled 35-year indexed earnings record and current-law bend-point/claiming rules.`;
    } else {
      $('socialSecurityDetailResult').textContent = 'Not included';
      $('socialSecurityDetailCopy').textContent = 'Turn on the Social Security estimator to include it in the retirement-income timeline.';
    }

    const currentLimits = result.currentIrsLimits;
    $('irsLimitResult').textContent = `${formatMoney(currentLimits.employeeDeferralMax)} employee max in ${result.rulesBaseYear}`;
    const baseText = `Base deferral ${formatMoney(currentLimits.deferral)}; total employee + employer annual-additions limit ${formatMoney(currentLimits.overall)} before catch-up.`;
    const projectionText = result.contributionCapEvents.length
      ? ` Your current plan first hits a modeled limit in ${result.firstContributionCapEvent.year}.`
      : ' Your current plan stays below the modeled limits through retirement.';
    $('irsLimitDetailResult').textContent = baseText + projectionText;
  }

  function niceMax(value) {
    if (!(value > 0)) return 1;
    const exponent = Math.floor(Math.log10(value));
    const base = Math.pow(10, exponent);
    const normalized = value / base;
    let nice;
    if (normalized <= 1) nice = 1;
    else if (normalized <= 2) nice = 2;
    else if (normalized <= 5) nice = 5;
    else nice = 10;
    return nice * base;
  }

  function renderChart(result) {
    const svg = $('projectionChart');
    const width = 1000;
    const height = 360;
    const pad = { left: 68, right: 26, top: 26, bottom: 46 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const data = result.timeline.map((point) => ({
      ...point,
      value: displayState.mode === 'real' ? point.realBalance : point.nominalBalance
    }));
    const maxValue = niceMax(Math.max(...data.map((d) => d.value), 1) * 1.05);
    const minAge = data[0].age;
    const maxAge = data[data.length - 1].age;
    const x = (age) => pad.left + ((age - minAge) / Math.max(maxAge - minAge, 1)) * plotW;
    const y = (value) => pad.top + plotH - (Math.max(value, 0) / maxValue) * plotH;

    const grid = [];
    for (let i = 0; i <= 4; i += 1) {
      const value = maxValue * (1 - i / 4);
      const yy = pad.top + (plotH * i / 4);
      grid.push(`<line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" stroke="#dfe7e3" stroke-width="1"/>`);
      grid.push(`<text x="${pad.left - 10}" y="${yy + 4}" text-anchor="end" fill="#74817b" font-size="12">${compactCurrency.format(value)}</text>`);
    }

    const ageTicks = [];
    const tickCount = Math.min(8, Math.max(4, Math.round((maxAge - minAge) / 8)));
    for (let i = 0; i <= tickCount; i += 1) {
      const age = Math.round(minAge + ((maxAge - minAge) * i / tickCount));
      ageTicks.push(`<text x="${x(age)}" y="${height - 15}" text-anchor="middle" fill="#74817b" font-size="12">${age}</text>`);
    }

    const points = data.map((d) => `${x(d.age).toFixed(2)},${y(d.value).toFixed(2)}`).join(' ');
    const areaPoints = `${x(data[0].age)},${pad.top + plotH} ${points} ${x(data[data.length - 1].age)},${pad.top + plotH}`;
    const retirementX = x(result.input.retirementAge);
    const retirementPoint = data.find((d) => d.age === result.input.retirementAge) || data[result.workYears];
    const targetValue = displayState.mode === 'real' ? result.requiredNestEggReal : result.requiredNestEggNominal;
    const targetY = y(targetValue);
    const ssMarker = result.socialSecurity.enabled && result.socialSecurity.claimAge >= minAge && result.socialSecurity.claimAge <= maxAge
      ? `<line x1="${x(result.socialSecurity.claimAge)}" y1="${pad.top}" x2="${x(result.socialSecurity.claimAge)}" y2="${pad.top + plotH}" stroke="#4f7da6" stroke-width="2" stroke-dasharray="3 6"/>
         <text x="${Math.min(x(result.socialSecurity.claimAge) + 8, width - 125)}" y="${pad.top + 34}" fill="#3d6487" font-size="11" font-weight="700">Social Security ${result.socialSecurity.claimAge}</text>`
      : '';

    svg.innerHTML = `
      <title id="chartTitle">Retirement portfolio projection</title>
      <desc id="chartDesc">Projected portfolio from age ${minAge} through ${maxAge}, with retirement beginning at age ${result.input.retirementAge}${result.socialSecurity.enabled ? ` and Social Security starting at age ${result.socialSecurity.claimAge}` : ''}.</desc>
      <defs>
        <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#0e6755" stop-opacity="0.24"/>
          <stop offset="100%" stop-color="#0e6755" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${grid.join('')}
      <polygon points="${areaPoints}" fill="url(#areaGradient)"/>
      <line x1="${retirementX}" y1="${pad.top}" x2="${retirementX}" y2="${pad.top + plotH}" stroke="#d8a34a" stroke-width="2" stroke-dasharray="6 6"/>
      <text x="${Math.min(retirementX + 9, width - 100)}" y="${pad.top + 15}" fill="#8a5a10" font-size="12" font-weight="700">Retire at ${result.input.retirementAge}</text>
      ${ssMarker}
      ${result.requiredNestEggReal > 0 ? `<circle cx="${retirementX}" cy="${targetY}" r="5" fill="#d8a34a" stroke="#fff" stroke-width="2"/><text x="${Math.min(retirementX + 10, width - 105)}" y="${Math.max(targetY - 9, 18)}" fill="#8a5a10" font-size="11">Target ${compactCurrency.format(targetValue)}</text>` : ''}
      <polyline points="${points}" fill="none" stroke="#0e6755" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${retirementX}" cy="${y(retirementPoint.value)}" r="6" fill="#0e6755" stroke="#fff" stroke-width="3"/>
      ${ageTicks.join('')}
    `;

    const modeText = displayState.mode === 'real' ? 'today’s purchasing power' : 'nominal future dollars';
    $('chartDescription').textContent = `Estimated year-end balance in ${modeText}, while working and while drawing retirement income.`;
    $('chartFooterLeft').textContent = result.socialSecurity.enabled
      ? `Retire at ${result.input.retirementAge}; Social Security starts at ${result.socialSecurity.claimAge}.`
      : `Retirement begins at age ${result.input.retirementAge}.`;
    if (result.depletedAtAge) {
      $('chartFooterRight').textContent = `Portfolio reaches $0 around age ${result.depletedAtAge}.`;
    } else {
      const endValue = displayState.mode === 'real' ? result.endingBalanceReal : result.endingBalanceNominal;
      $('chartFooterRight').textContent = `Modeled balance at age ${result.input.planThroughAge}: ${formatMoney(endValue)}.`;
    }
  }

  function calculateAndRender() {
    const result = Model.analyze(getFormValues());
    const invalid = renderValidation(result);
    setResultsDimmed(invalid);
    if (invalid) return;

    renderStatus(result);
    renderRecommendation(result);
    renderSocialSecurityEstimate(result);
    renderIncome(result);
    renderDetails(result);
    renderChart(result);
  }

  function attachListeners() {
    inputIds.forEach((id) => {
      const el = $(id);
      const eventName = el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(eventName, () => {
        if (id === 'autoIncreaseEnabled') syncAutoIncreaseVisibility();
        if (id === 'socialSecurityEnabled') syncSocialSecurityVisibility();
        calculateAndRender();
      });
    });

    document.querySelectorAll('[data-display-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        displayState.mode = button.dataset.displayMode;
        document.querySelectorAll('[data-display-mode]').forEach((item) => {
          item.classList.toggle('is-active', item === button);
        });
        calculateAndRender();
      });
    });

    $('resetButton').addEventListener('click', () => {
      setFormValues(Model.DEFAULTS);
      displayState.mode = 'real';
      document.querySelectorAll('[data-display-mode]').forEach((item) => {
        item.classList.toggle('is-active', item.dataset.displayMode === 'real');
      });
      calculateAndRender();
    });
  }

  setFormValues(Model.DEFAULTS);
  attachListeners();
  calculateAndRender();
})();