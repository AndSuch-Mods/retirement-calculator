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
      if (el.id === 'projectionYearSlider') return;
      data[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return data;
  }

  function isTodayMode() {
    return document.querySelector('[data-display-mode="real"]')?.classList.contains('is-active') !== false;
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

  function rowLabel(valueId, text) {
    const row = $(valueId)?.closest('.income-line');
    const span = row?.querySelector('span');
    if (span) span.textContent = text;
  }

  function ensureToggleCopy() {
    const today = document.querySelector('[data-display-mode="real"]');
    const future = document.querySelector('[data-display-mode="nominal"]');
    if (today) {
      today.textContent = 'Today’s buying power';
      today.title = 'Show amounts in today’s purchasing power.';
    }
    if (future) {
      future.textContent = 'Future equivalent $';
      future.title = 'Show the future dollar equivalent of today’s buying power at first retirement. SSA and TRS are shown at their own benefit start dates.';
    }

    const toggle = document.querySelector('.currency-toggle');
    if (toggle && !document.getElementById('futureEquivalentHelp')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'currency-toggle-block';
      toggle.parentNode.insertBefore(wrapper, toggle);
      wrapper.appendChild(toggle);

      const help = document.createElement('small');
      help.id = 'futureEquivalentHelp';
      help.textContent = 'Future equivalent $ = the nominal dollars needed at first retirement to match today’s buying power.';
      wrapper.appendChild(help);

      const style = document.createElement('style');
      style.id = 'futureEquivalentHelpStyle';
      style.textContent = `
        .currency-toggle-block{display:grid;justify-items:end;gap:6px;max-width:360px}
        #futureEquivalentHelp{max-width:330px;color:var(--muted,#9caaa4);font-size:.68rem;line-height:1.35;text-align:right}
        @media(max-width:720px){.currency-toggle-block{width:100%;max-width:none;justify-items:stretch}#futureEquivalentHelp{text-align:left;max-width:none}}
      `;
      document.head.appendChild(style);
    }
  }

  function render() {
    ensureToggleCopy();
    const result = Model.analyze(readForm());
    if (!result || result.errors?.length) return;

    const todayMode = isTodayMode();
    const factor = firstRetirementFactor(result);
    const spending = todayMode ? result.input.desiredSpending : result.input.desiredSpending * factor;
    const withdrawal = todayMode ? result.portfolioGapAfterAllIncomeReal : result.portfolioGapAfterAllIncomeReal * factor;
    const other = result.input.otherRetirementIncome;

    const primarySs = result.socialSecurity?.enabled
      ? (todayMode ? result.socialSecurity.annualBenefitReal : result.socialSecurity.annualBenefitNominalAtClaim)
      : 0;
    const spouseSs = result.spouseSocialSecurity?.enabled
      ? (todayMode ? result.spouseSocialSecurity.annualBenefitReal : result.spouseSocialSecurity.annualBenefitNominalAtClaim)
      : 0;
    const trs = result.trs?.eligible
      ? (todayMode ? result.trs.annualBenefitRealAtStart : result.trs.annualBenefitNominal)
      : 0;

    if ($('summaryModeLabel')) $('summaryModeLabel').textContent = todayMode ? 'Today’s buying power' : 'Future equivalent $';
    if ($('spendingGoalBreakdownResult')) $('spendingGoalBreakdownResult').textContent = `${money.format(spending)}/yr`;
    if ($('primarySocialSecurityResult')) $('primarySocialSecurityResult').textContent = `${money.format(primarySs)}/yr`;
    if ($('spouseSocialSecurityResult') && result.spouse) $('spouseSocialSecurityResult').textContent = `${money.format(spouseSs)}/yr`;
    if ($('trsIncomeResult') && result.trs?.eligible) $('trsIncomeResult').textContent = `${money.format(trs)}/yr`;
    if ($('otherIncomeResult')) $('otherIncomeResult').textContent = `${money.format(other)}/yr`;
    if ($('portfolioGapResult')) $('portfolioGapResult').textContent = `${money.format(withdrawal)}/yr`;

    rowLabel('spendingGoalBreakdownResult', todayMode ? 'Household spending goal' : 'Household spending goal (future equivalent)');
    rowLabel('primarySocialSecurityResult', todayMode ? 'Your Social Security' : 'Your Social Security (at claim)');
    rowLabel('spouseSocialSecurityResult', todayMode ? 'Spouse Social Security' : 'Spouse Social Security (at claim)');
    rowLabel('trsIncomeResult', todayMode ? 'Alabama TRS pension' : 'Alabama TRS pension (at start)');
    rowLabel('otherIncomeResult', 'Other retirement income (entered amount)');
    rowLabel('portfolioGapResult', todayMode ? 'Needed from retirement accounts' : 'Needed from retirement accounts (future equivalent)');

    if ($('socialSecurityEstimateInline') && result.socialSecurity?.enabled) {
      $('socialSecurityEstimateInline').textContent = todayMode
        ? `About ${money.format(result.socialSecurity.monthlyBenefitReal)}/mo in today’s buying power`
        : `Projected about ${money.format(result.socialSecurity.monthlyBenefitNominalAtClaim)}/mo when claimed`;
    }
    if ($('spouseSocialSecurityEstimateInline') && result.spouse && result.spouseSocialSecurity?.enabled) {
      $('spouseSocialSecurityEstimateInline').textContent = todayMode
        ? `About ${money.format(result.spouseSocialSecurity.monthlyBenefitReal)}/mo in today’s buying power`
        : `Projected about ${money.format(result.spouseSocialSecurity.monthlyBenefitNominalAtClaim)}/mo when claimed`;
    }
    if ($('trsEstimateInline') && result.trs?.eligible) {
      $('trsEstimateInline').textContent = todayMode
        ? `Estimated maximum benefit: ${money.format(result.trs.annualBenefitRealAtStart)}/yr in today’s buying power`
        : `Estimated maximum benefit: ${money.format(result.trs.annualBenefitNominal)}/yr at pension start`;
    }

    const note = $('retirementAccountWithdrawalNote');
    if (note) {
      if (todayMode) {
        note.innerHTML = `After all recurring retirement income is active, the model needs about <strong>${money.format(withdrawal)}/yr</strong> from invested retirement accounts in today’s buying power. “Other retirement income” is intentionally shown exactly as entered and is never inflation-increased; the calculator only converts it internally when a common purchasing-power basis is needed for the cash-flow math.`;
      } else {
        note.innerHTML = `The retirement-account need is shown as a <strong>future-dollar equivalent at first retirement</strong>. Social Security and TRS are shown as the projected nominal amounts when each benefit actually starts, while “other income” is shown exactly as entered and remains fixed. Because those income streams can start in different years, the future-mode rows are not all expressed at one common date.`;
      }
    }
  }

  function schedule() {
    requestAnimationFrame(render);
  }

  function init() {
    forceDarkOnlyChrome();
    ensureToggleCopy();
    schedule();
    document.addEventListener('input', schedule);
    document.addEventListener('change', schedule);
    document.addEventListener('click', (event) => {
      if (event.target?.closest('[data-display-mode], #resetButton')) schedule();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);