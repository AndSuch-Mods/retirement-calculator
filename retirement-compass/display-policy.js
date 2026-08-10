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

  function forceDarkOnlyChrome() {
    document.documentElement.style.colorScheme = 'dark';

    let colorScheme = document.querySelector('meta[name="color-scheme"]');
    if (!colorScheme) {
      colorScheme = document.createElement('meta');
      colorScheme.name = 'color-scheme';
      document.head.appendChild(colorScheme);
    }
    colorScheme.content = 'dark';

    let themeColor = document.querySelector('meta[name="theme-color"]');
    if (!themeColor) {
      themeColor = document.createElement('meta');
      themeColor.name = 'theme-color';
      document.head.appendChild(themeColor);
    }

    const keepDark = () => {
      if (themeColor.content !== '#0b100e') themeColor.content = '#0b100e';
      if (colorScheme.content !== 'dark') colorScheme.content = 'dark';
    };
    keepDark();

    const observer = new MutationObserver(keepDark);
    observer.observe(themeColor, { attributes: true, attributeFilter: ['content'] });
    observer.observe(colorScheme, { attributes: true, attributeFilter: ['content'] });
  }

  function readForm() {
    const data = {};
    document.querySelectorAll('input[id], select[id]').forEach((el) => {
      if (el.id === 'projectionYearSlider' || el.id === 'projectionChartZoom') return;
      data[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return data;
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

  function inflationFactor(result, date) {
    const years = Math.max(exactCalendarYearsBetween(result.asOfDate, date), 0);
    return Math.pow(1 + result.input.inflationPct / 100, years);
  }

  function firstRetirementFactor(result) {
    return inflationFactor(result, result.firstRetirementDate);
  }

  function removeDisplayToggle() {
    document.querySelector('.currency-toggle')?.remove();
    document.getElementById('futureEquivalentHelp')?.remove();
    const wrapper = document.querySelector('.currency-toggle-block');
    if (wrapper && !wrapper.children.length) wrapper.remove();
  }

  function updateInputHelp() {
    const spendingHelp = $('desiredSpending')?.closest('.field')?.querySelector('small');
    if (spendingHelp) spendingHelp.textContent = 'Enter the annual lifestyle amount in today’s dollars.';

    const otherHelp = $('otherRetirementIncome')?.closest('.field')?.querySelector('small');
    if (otherHelp) otherHelp.textContent = 'Enter the annual amount in today’s dollars. The model adjusts the future cash flow for inflation.';
  }

  function rowLabel(valueId, text) {
    const row = $(valueId)?.closest('.income-line');
    const span = row?.querySelector('span');
    if (span) span.textContent = text;
  }

  function ensureFutureNeedRow() {
    if ($('inflationAdjustedSpendingResult')) return;
    const spendingRow = $('spendingGoalBreakdownResult')?.closest('.income-line');
    if (!spendingRow) return;

    const row = document.createElement('div');
    row.className = 'income-line inflation-need-line';
    row.innerHTML = '<span>Estimated spending needed at first retirement</span><strong id="inflationAdjustedSpendingResult">—</strong>';
    spendingRow.insertAdjacentElement('afterend', row);

    const note = document.createElement('small');
    note.id = 'inflationAdjustedSpendingNote';
    note.className = 'inflation-need-note';
    row.insertAdjacentElement('afterend', note);

    if (!document.getElementById('singleDollarModeStyle')) {
      const style = document.createElement('style');
      style.id = 'singleDollarModeStyle';
      style.textContent = `
        .intro{align-items:flex-start}
        .inflation-need-line{padding-top:11px;color:var(--ink);font-weight:700}
        .inflation-need-line strong{color:var(--accent)}
        .inflation-need-note{display:block;margin:-2px 0 9px;color:var(--muted);font-size:.7rem;line-height:1.4}
        .income-secondary{display:block;margin-top:2px;color:var(--muted);font-size:.68rem;font-weight:500;line-height:1.3}
      `;
      document.head.appendChild(style);
    }
  }

  function setSecondary(valueId, text) {
    const row = $(valueId)?.closest('.income-line');
    if (!row) return;
    let small = row.querySelector('.income-secondary');
    if (!small) {
      small = document.createElement('small');
      small.className = 'income-secondary';
      row.querySelector('span')?.appendChild(small);
    }
    small.textContent = text;
  }

  function loadChartControls() {
    if (document.querySelector('script[data-retirement-chart-controls]')) return;
    const script = document.createElement('script');
    script.src = 'chart-controls.js';
    script.dataset.retirementChartControls = 'true';
    document.head.appendChild(script);
  }

  function render() {
    removeDisplayToggle();
    updateInputHelp();
    ensureFutureNeedRow();

    const result = Model.analyze(readForm());
    if (!result || result.errors?.length) return;

    const futureSpending = result.input.desiredSpending * firstRetirementFactor(result);
    const primarySsNominal = result.socialSecurity?.enabled
      ? result.socialSecurity.annualBenefitReal * inflationFactor(result, result.socialSecurity.claimDate)
      : 0;
    const spouseSsNominal = result.spouseSocialSecurity?.enabled
      ? result.spouseSocialSecurity.annualBenefitReal * inflationFactor(result, result.spouseSocialSecurity.claimDate)
      : 0;

    if ($('summaryModeLabel')) $('summaryModeLabel').textContent = 'Today’s buying power';
    if ($('spendingGoalBreakdownResult')) $('spendingGoalBreakdownResult').textContent = `${money.format(result.input.desiredSpending)}/yr`;
    if ($('inflationAdjustedSpendingResult')) $('inflationAdjustedSpendingResult').textContent = `${money.format(futureSpending)}/yr`;
    if ($('inflationAdjustedSpendingNote')) {
      $('inflationAdjustedSpendingNote').textContent = `Estimated future dollars needed to preserve the buying power of today’s ${money.format(result.input.desiredSpending)}/yr goal at the first retirement date, using ${result.input.inflationPct.toFixed(2)}% inflation.`;
    }

    if ($('primarySocialSecurityResult')) $('primarySocialSecurityResult').textContent = result.socialSecurity?.enabled ? `${money.format(result.socialSecurity.annualBenefitReal)}/yr` : '$0/yr';
    if ($('spouseSocialSecurityResult') && result.spouse) $('spouseSocialSecurityResult').textContent = result.spouseSocialSecurity?.enabled ? `${money.format(result.spouseSocialSecurity.annualBenefitReal)}/yr` : '$0/yr';
    if ($('trsIncomeResult') && result.trs?.eligible) $('trsIncomeResult').textContent = `${money.format(result.trs.annualBenefitRealAtStart)}/yr`;
    if ($('otherIncomeResult')) $('otherIncomeResult').textContent = `${money.format(result.input.otherRetirementIncome)}/yr`;
    if ($('portfolioGapResult')) $('portfolioGapResult').textContent = `${money.format(result.portfolioGapAfterAllIncomeReal)}/yr`;

    rowLabel('spendingGoalBreakdownResult', 'Household spending goal (today)');
    rowLabel('primarySocialSecurityResult', 'Your Social Security');
    rowLabel('spouseSocialSecurityResult', 'Spouse Social Security');
    rowLabel('trsIncomeResult', 'Alabama TRS pension');
    rowLabel('otherIncomeResult', 'Other retirement income');
    rowLabel('portfolioGapResult', 'Needed from retirement accounts');

    if (result.socialSecurity?.enabled) {
      setSecondary('primarySocialSecurityResult', `Today’s buying power · about ${money.format(primarySsNominal)}/yr projected when claimed.`);
      if ($('socialSecurityEstimateInline')) {
        $('socialSecurityEstimateInline').textContent = `About ${money.format(result.socialSecurity.monthlyBenefitReal)}/mo in today’s buying power · about ${money.format(primarySsNominal / 12)}/mo projected when claimed`;
      }
    }

    if (result.spouse && result.spouseSocialSecurity?.enabled) {
      setSecondary('spouseSocialSecurityResult', `Today’s buying power · about ${money.format(spouseSsNominal)}/yr projected when claimed.`);
      if ($('spouseSocialSecurityEstimateInline')) {
        $('spouseSocialSecurityEstimateInline').textContent = `About ${money.format(result.spouseSocialSecurity.monthlyBenefitReal)}/mo in today’s buying power · about ${money.format(spouseSsNominal / 12)}/mo projected when claimed`;
      }
    }

    if (result.trs?.eligible) {
      setSecondary('trsIncomeResult', `Today’s buying power · about ${money.format(result.trs.annualBenefitNominal)}/yr projected at pension start.`);
      if ($('trsEstimateInline')) {
        $('trsEstimateInline').textContent = `Estimated maximum benefit: ${money.format(result.trs.annualBenefitRealAtStart)}/yr in today’s buying power · about ${money.format(result.trs.annualBenefitNominal)}/yr at pension start`;
      }
    }

    const note = $('retirementAccountWithdrawalNote');
    if (note) {
      note.innerHTML = `All planning inputs are entered in <strong>today’s dollars</strong>. After Social Security, TRS, and other modeled income, the plan needs about <strong>${money.format(result.portfolioGapAfterAllIncomeReal)}/yr</strong> from invested retirement accounts in today’s buying power. The cash-flow engine then converts spending and income into the future nominal dollars needed in each modeled year.`;
    }
  }

  function schedule() {
    requestAnimationFrame(render);
  }

  function init() {
    forceDarkOnlyChrome();
    removeDisplayToggle();
    updateInputHelp();
    schedule();
    loadChartControls();

    document.addEventListener('input', (event) => {
      if (event.target?.id === 'projectionYearSlider' || event.target?.id === 'projectionChartZoom') return;
      schedule();
    });
    document.addEventListener('change', (event) => {
      if (event.target?.id === 'projectionYearSlider' || event.target?.id === 'projectionChartZoom') return;
      schedule();
    });
    document.addEventListener('click', (event) => {
      if (event.target?.closest('#resetButton')) schedule();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
