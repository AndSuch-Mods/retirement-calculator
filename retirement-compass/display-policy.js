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
  const dateFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
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
      themeColor.content = '#0b100e';
      colorScheme.content = 'dark';
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

  function formatDate(date) {
    return date instanceof Date && !Number.isNaN(date.getTime()) ? dateFmt.format(date) : '—';
  }

  function inflationFactor(result, date) {
    const years = Math.max(Model.yearsBetween(result.asOfDate, date), 0);
    return Math.pow(1 + result.input.inflationPct / 100, years);
  }

  function removeDisplayToggle() {
    document.querySelector('.currency-toggle')?.remove();
    document.getElementById('futureEquivalentHelp')?.remove();
    const wrapper = document.querySelector('.currency-toggle-block');
    if (wrapper && !wrapper.children.length) wrapper.remove();
  }

  function cleanHeader() {
    removeDisplayToggle();
    const intro = document.querySelector('.intro');
    const eyebrow = intro?.querySelector('.eyebrow');
    const copy = intro?.querySelector('.intro-copy');
    const title = $('pageTitle');
    eyebrow?.remove();
    copy?.remove();
    if (title) title.textContent = 'Household retirement planning';
    if (intro) intro.classList.add('intro-clean');

    if (!$('professionalHeaderStyle')) {
      const style = document.createElement('style');
      style.id = 'professionalHeaderStyle';
      style.textContent = `
        .intro.intro-clean{display:block;margin-bottom:22px}
        .intro.intro-clean h1{max-width:none;margin:0;font-size:clamp(2rem,4.8vw,3.6rem);line-height:1;letter-spacing:-.045em}
      `;
      document.head.appendChild(style);
    }
  }

  function setFieldCopy(inputId, label, help) {
    const field = $(inputId)?.closest('.field');
    if (!field) return;
    const title = field.querySelector(':scope > span:first-child');
    if (title) title.textContent = label;
    let small = field.querySelector(':scope > small');
    if (!small) {
      small = document.createElement('small');
      field.appendChild(small);
    }
    small.textContent = help;
  }

  function updateInputHelp() {
    setFieldCopy('desiredSpending', 'Annual household spending goal', 'Enter the annual lifestyle amount in today’s dollars.');
    setFieldCopy('otherRetirementIncome', 'Other household retirement income', 'Enter the annual amount in today’s dollars. The model carries the same buying power forward with inflation.');
    setFieldCopy(
      'socialSecurityCareerStartAge',
      'Age Social Security-covered earnings began',
      'Use the age you first had wages subject to Social Security. This is not “35 years before retirement”; SSA uses your highest 35 earning years and includes $0 years if fewer than 35 are available.'
    );
    setFieldCopy(
      'spouseSocialSecurityCareerStartAge',
      'Age Social Security-covered earnings began',
      'Use the age the spouse first had wages subject to Social Security. SSA uses the highest 35 earning years and includes $0 years if fewer than 35 are available.'
    );
  }

  function ensureIncomeComparison() {
    const card = document.querySelector('.income-card');
    if (!card) return;
    if (card.dataset.comparisonLayout === 'true') return;

    card.dataset.comparisonLayout = 'true';
    card.innerHTML = `
      <p class="card-label">Retirement income &amp; spending</p>
      <div class="income-compare-head" aria-hidden="true">
        <span></span><strong>Today’s buying power</strong><strong>Projected actual amount</strong>
      </div>
      <div class="income-line income-compare-row income-goal-line" id="spendingCompareRow">
        <span data-row-label></span><strong id="spendingGoalBreakdownResult">—</strong><strong id="spendingGoalFutureResult">—</strong>
      </div>
      <div class="income-line income-compare-row" id="primarySsIncomeRow">
        <span data-row-label></span><strong id="primarySocialSecurityResult">—</strong><strong id="primarySocialSecurityFutureResult">—</strong>
      </div>
      <div class="income-line income-compare-row" id="spouseSsIncomeRow" hidden>
        <span data-row-label></span><strong id="spouseSocialSecurityResult">—</strong><strong id="spouseSocialSecurityFutureResult">—</strong>
      </div>
      <div class="income-line income-compare-row" id="trsIncomeRow" hidden>
        <span data-row-label></span><strong id="trsIncomeResult">—</strong><strong id="trsIncomeFutureResult">—</strong>
      </div>
      <div class="income-line income-compare-row" id="otherIncomeRow">
        <span data-row-label></span><strong id="otherIncomeResult">—</strong><strong id="otherIncomeFutureResult">—</strong>
      </div>
      <div class="income-line income-compare-row income-total" id="portfolioWithdrawalRow">
        <span data-row-label></span><strong id="portfolioGapResult">—</strong><strong id="portfolioGapFutureResult">—</strong>
      </div>
      <div class="retirement-account-note" id="retirementAccountWithdrawalNote"></div>`;

    if (!$('incomeComparisonStyle')) {
      const style = document.createElement('style');
      style.id = 'incomeComparisonStyle';
      style.textContent = `
        .income-compare-head,.income-compare-row{display:grid!important;grid-template-columns:minmax(145px,1.45fr) minmax(92px,.8fr) minmax(105px,.9fr);gap:10px;align-items:center}
        .income-compare-head{padding:3px 0 8px;border-bottom:1px solid var(--line);color:var(--muted);font-size:.64rem;line-height:1.2;text-align:right}
        .income-compare-head strong{font-weight:700}.income-compare-head strong:first-of-type{color:var(--brand-strong)}.income-compare-head strong:last-child{color:var(--accent)}
        .income-compare-row>span{color:var(--muted);line-height:1.25}.income-compare-row>strong{text-align:right;color:var(--ink);font-variant-numeric:tabular-nums}
        .income-compare-row>strong:last-child{color:#e6c27d}.income-compare-row.income-total>strong{color:var(--brand-strong)}.income-compare-row.income-total>strong:last-child{color:var(--accent)}
        .income-row-date{display:block;margin-top:3px;color:var(--muted);font-size:.64rem;font-weight:500;line-height:1.25}
        @media(max-width:540px){
          .income-compare-head,.income-compare-row{grid-template-columns:minmax(115px,1.2fr) minmax(80px,.78fr) minmax(92px,.9fr);gap:7px}
          .income-compare-head{font-size:.59rem}.income-compare-row{font-size:.73rem}.income-row-date{font-size:.59rem}
        }
      `;
      document.head.appendChild(style);
    }
  }

  function setCompareRow(rowId, label, detail, todayValue, futureValue) {
    const row = $(rowId);
    if (!row) return;
    const labelNode = row.querySelector('[data-row-label]');
    if (labelNode) labelNode.innerHTML = `${label}${detail ? `<small class="income-row-date">${detail}</small>` : ''}`;
    const values = row.querySelectorAll(':scope > strong');
    if (values[0]) values[0].textContent = `${money.format(todayValue)}/yr`;
    if (values[1]) values[1].textContent = `${money.format(futureValue)}/yr`;
  }

  function renderStatusNominal(result) {
    const projected = result.projectedNestEggNominal || 0;
    const required = result.requiredNestEggNominal || 0;
    const surplus = projected - required;
    const ratio = Number.isFinite(result.fundingRatio) ? Math.max(result.fundingRatio, 0) : 1;
    const pct = required > 0 ? Math.round(ratio * 100) : 100;
    const degrees = Math.min(ratio, 1) * 360;

    if ($('summaryModeLabel')) $('summaryModeLabel').textContent = 'Actual dollars at first retirement';
    if ($('projectedNestEgg')) $('projectedNestEgg').textContent = money.format(projected);
    if ($('requiredNestEgg')) $('requiredNestEgg').textContent = money.format(required);
    if ($('surplusShortfall')) $('surplusShortfall').textContent = `${surplus >= 0 ? '+' : '−'}${money.format(Math.abs(surplus))}`;
    if ($('fundingPercent')) $('fundingPercent').textContent = `${pct}%`;
    if ($('fundingRing')) $('fundingRing').style.background = `conic-gradient(#d8a34a ${degrees}deg, rgba(255,255,255,0.15) ${degrees}deg)`;

    const targetLabel = $('requiredNestEgg')?.previousElementSibling;
    const surplusLabel = $('surplusShortfall')?.previousElementSibling;
    if (targetLabel) targetLabel.textContent = 'Modeled target at first retirement';
    if (surplusLabel) surplusLabel.textContent = 'Surplus / shortfall at first retirement';

    const pill = $('statusPill');
    pill?.classList.remove('positive', 'negative');
    if (result.onTrack) {
      if (pill) { pill.textContent = 'On track'; pill.classList.add('positive'); }
      if ($('statusHeadline')) $('statusHeadline').textContent = 'The modeled portfolio lasts through the planning horizon.';
    } else {
      if (pill) { pill.textContent = 'Needs adjustment'; pill.classList.add('negative'); }
      if ($('statusHeadline')) $('statusHeadline').textContent = 'The modeled portfolio runs out before the planning horizon.';
    }
    if ($('statusExplanation')) {
      $('statusExplanation').textContent = `First retirement: ${formatDate(result.firstRetirementDate)}. This balance is in actual account dollars and uses the same nominal balance as the chart.`;
    }
  }

  function renderSocialSecurityCopy(result) {
    const primary = result.socialSecurity;
    if (primary?.enabled) {
      if ($('socialSecurityEstimateInline')) $('socialSecurityEstimateInline').textContent = `Rough estimate: ${money.format(primary.monthlyBenefitReal)}/mo in today’s buying power`;
      if ($('socialSecurityEstimateDetail')) $('socialSecurityEstimateDetail').textContent = `About ${money.format(primary.monthlyBenefitNominalAtClaim)}/mo projected when claimed at age ${primary.claimAge}. This reconstructs earnings from the salary and raise assumptions; an SSA earnings record will be more precise.`;
    }

    const spouse = result.spouseSocialSecurity;
    if (result.spouse && spouse?.enabled) {
      if ($('spouseSocialSecurityEstimateInline')) $('spouseSocialSecurityEstimateInline').textContent = `Rough estimate: ${money.format(spouse.monthlyBenefitReal)}/mo in today’s buying power`;
      if ($('spouseSocialSecurityEstimateDetail')) $('spouseSocialSecurityEstimateDetail').textContent = `About ${money.format(spouse.monthlyBenefitNominalAtClaim)}/mo projected when claimed at age ${spouse.claimAge}. This reconstructs earnings from the salary and raise assumptions; an SSA earnings record will be more precise.`;
    }
  }

  function renderIncomeComparison(result) {
    ensureIncomeComparison();
    const firstFactor = inflationFactor(result, result.firstRetirementDate);
    const firstDate = formatDate(result.firstRetirementDate);

    setCompareRow('spendingCompareRow', 'Household spending goal', `Projected column: ${firstDate}`, result.input.desiredSpending, result.input.desiredSpending * firstFactor);

    const primarySs = result.socialSecurity?.enabled ? result.socialSecurity : null;
    setCompareRow('primarySsIncomeRow', 'Your Social Security', primarySs ? `Projected column: claim at ${formatDate(primarySs.claimDate)}` : 'Not included', primarySs?.annualBenefitReal || 0, primarySs?.annualBenefitNominalAtClaim || 0);

    const spouseSsRow = $('spouseSsIncomeRow');
    if (spouseSsRow) spouseSsRow.hidden = !result.spouse;
    const spouseSs = result.spouseSocialSecurity?.enabled ? result.spouseSocialSecurity : null;
    if (result.spouse) {
      setCompareRow('spouseSsIncomeRow', 'Spouse Social Security', spouseSs ? `Projected column: claim at ${formatDate(spouseSs.claimDate)}` : 'Not included', spouseSs?.annualBenefitReal || 0, spouseSs?.annualBenefitNominalAtClaim || 0);
    }

    const trsRow = $('trsIncomeRow');
    const hasTrs = Boolean(result.spouse && result.trs?.eligible);
    if (trsRow) trsRow.hidden = !hasTrs;
    if (hasTrs) {
      setCompareRow('trsIncomeRow', 'Alabama TRS pension', `Projected column: pension starts ${formatDate(result.trs.pensionStart)}`, result.trs.annualBenefitRealAtStart, result.trs.annualBenefitNominal);
    }

    setCompareRow('otherIncomeRow', 'Other retirement income', `Projected column: ${firstDate}`, result.input.otherRetirementIncome, result.input.otherRetirementIncome * firstFactor);
    setCompareRow('portfolioWithdrawalRow', 'Initial retirement-account withdrawal', 'At first retirement; later withdrawals change as salary, Social Security, and TRS start', result.initialRetirementWithdrawalReal || 0, result.initialRetirementWithdrawalNominal || 0);

    const note = $('retirementAccountWithdrawalNote');
    if (note) {
      note.innerHTML = `All planning inputs are entered in <strong>today’s dollars</strong>. The projected column shows the estimated nominal cash amount at the date listed for that row. Those dates are not all the same, so the projected column is for scale—not direct subtraction. The model applies each income stream in its actual modeled year. After all recurring income is active, the remaining gap is about <strong>${money.format(result.portfolioGapAfterAllIncomeReal)}/yr</strong> in today’s buying power.`;
    }
  }

  function loadChartControls() {
    if (document.querySelector('script[data-retirement-chart-controls]')) return;
    const script = document.createElement('script');
    script.src = 'chart-controls.js?v=20260810-0100';
    script.dataset.retirementChartControls = 'true';
    document.head.appendChild(script);
  }

  function render() {
    cleanHeader();
    updateInputHelp();
    const result = Model.analyze(readForm());
    if (!result || result.errors?.length) return;
    renderStatusNominal(result);
    renderSocialSecurityCopy(result);
    renderIncomeComparison(result);
  }

  function schedule() { requestAnimationFrame(render); }

  function init() {
    forceDarkOnlyChrome();
    cleanHeader();
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