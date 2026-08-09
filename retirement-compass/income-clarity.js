(function (root) {
  'use strict';

  const Model = root.HouseholdModel;
  if (!Model) return;

  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
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
    const fraction = (end - anniversary) / Math.max(nextAnniversary - anniversary, 1);
    return wholeYears + fraction;
  }

  function firstRetirementFactor(result) {
    const years = Math.max(exactCalendarYearsBetween(result.asOfDate, result.firstRetirementDate), 0);
    return Math.pow(1 + result.input.inflationPct / 100, years);
  }

  function displayAnnual(realValue, result) {
    return isRealMode() ? realValue : realValue * firstRetirementFactor(result);
  }

  function ensureIncomeBreakdown() {
    const card = document.querySelector('.income-card');
    if (!card) return;

    const label = card.querySelector('.card-label');
    if (label) label.textContent = 'How your retirement spending is funded';

    const nominalButton = document.querySelector('[data-display-mode="nominal"]');
    if (nominalButton) {
      nominalButton.textContent = 'First-retirement dollars';
      nominalButton.title = 'Show amounts in nominal dollars at the date of the first retirement.';
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
        .income-goal-line {
          padding-top: 4px;
          padding-bottom: 12px;
          margin-bottom: 2px;
          color: var(--ink);
          font-weight: 750;
          border-bottom: 2px solid var(--line-strong, #cad6d0);
        }
        .income-goal-line strong { color: var(--ink); font-size: 1.02em; }
        .retirement-account-note {
          margin-top: 12px;
          padding: 11px 12px;
          border-radius: 12px;
          background: var(--brand-soft, #e8f3ef);
          color: var(--muted, #66736d);
          font-size: 0.76rem;
          line-height: 1.45;
        }
        .retirement-account-note strong { color: var(--brand-strong, #075346); }
      `;
      document.head.appendChild(style);
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
  }

  function scheduleRender() {
    window.requestAnimationFrame(render);
  }

  function init() {
    ensureIncomeBreakdown();
    render();
    document.addEventListener('input', scheduleRender);
    document.addEventListener('change', scheduleRender);
    document.addEventListener('click', (event) => {
      if (event.target?.closest('[data-display-mode], #resetButton')) scheduleRender();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);