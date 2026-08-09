(function (root) {
  'use strict';

  const Existing = root.HouseholdModel;
  if (!Existing) return;

  const HISTORICAL = Object.freeze({
    inflationPct: 2.52,
    preRetirementReturnPct: 7.83,
    retirementReturnPct: 6.73,
    stockCompoundReturnPct: 10.02,
    treasuryCompoundReturnPct: 4.54,
    inflationPeriod: '1995–2025 CPI-U annual-average CAGR',
    marketPeriod: '1928–2025 compound returns',
    preMix: '60% U.S. stocks / 40% 10-year U.S. Treasuries',
    retirementMix: '40% U.S. stocks / 60% 10-year U.S. Treasuries'
  });

  const originalAnalyze = Existing.analyze.bind(Existing);
  const enhancedDefaults = Object.freeze({
    ...Existing.DEFAULTS,
    preRetirementReturnPct: HISTORICAL.preRetirementReturnPct,
    retirementReturnPct: HISTORICAL.retirementReturnPct,
    inflationPct: HISTORICAL.inflationPct
  });

  function scenarioForRate(result, rate) {
    const initial = Math.max(result.projectedNestEggReal || 0, 0);
    const annualWithdrawal = initial * rate;
    const realReturn = Number.isFinite(result.realRetirementReturn) ? result.realRetirementReturn : 0;
    const years = Math.max(1, Existing.yearsBetween(result.firstRetirementDate, result.endDate));
    let balance = initial;
    let depletedYear = null;
    const wholeYears = Math.max(1, Math.ceil(years));

    for (let y = 1; y <= wholeYears; y += 1) {
      const fraction = Math.min(1, Math.max(years - (y - 1), 0));
      if (fraction <= 0) break;
      balance *= Math.pow(1 + realReturn, fraction);
      balance -= annualWithdrawal * fraction;
      if (balance <= 0) {
        balance = 0;
        depletedYear = y;
        break;
      }
    }

    const netTrend = balance > 0 && initial > 0
      ? Math.pow(balance / initial, 1 / years) - 1
      : null;

    return {
      rate,
      annualWithdrawalReal: annualWithdrawal,
      monthlyWithdrawalReal: annualWithdrawal / 12,
      endingBalanceReal: balance,
      netBalanceTrend: netTrend,
      depletedYear,
      years
    };
  }

  function withdrawalScenarios(result) {
    return [0.03, 0.04, 0.05].map((rate) => scenarioForRate(result, rate));
  }

  root.HouseholdModel = {
    ...Existing,
    DEFAULTS: enhancedDefaults,
    HISTORICAL_ASSUMPTIONS: HISTORICAL,
    analyze: originalAnalyze,
    withdrawalScenarios
  };

  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const pct = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const $ = (id) => document.getElementById(id);

  function readForm() {
    const data = {};
    document.querySelectorAll('input[id], select[id]').forEach((el) => {
      data[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return data;
  }

  function insertStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .historical-baseline { margin: 0 0 1rem; padding: 1rem; border: 1px solid var(--line, #dce4e0); border-radius: .9rem; background: var(--surface-soft, #f8faf9); }
      .historical-baseline .baseline-top { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
      .historical-baseline strong { display:block; }
      .historical-baseline p { margin:.35rem 0 0; color:var(--muted, #66736d); font-size:.86rem; line-height:1.45; }
      .historical-values { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.6rem; margin-top:.8rem; }
      .historical-values div { background:#fff; border:1px solid var(--line, #dce4e0); border-radius:.7rem; padding:.65rem .75rem; }
      .historical-values span { display:block; color:var(--muted, #66736d); font-size:.72rem; }
      .historical-values b { font-size:1rem; }
      .historical-baseline .source-note { font-size:.74rem; }
      .assumption-locked { opacity:.68; }
      .withdrawal-scenarios { margin-top:1.35rem; }
      .withdrawal-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1rem; margin-top:1rem; }
      .withdrawal-card { background:var(--surface, #fff); border:1px solid var(--line, #dce4e0); border-radius:1rem; padding:1rem; box-shadow:0 8px 22px rgba(22,45,36,.05); }
      .withdrawal-card.featured { border-color:#d8a34a; box-shadow:0 8px 24px rgba(216,163,74,.12); }
      .withdrawal-rate { font-size:1.65rem; font-weight:750; color:var(--ink, #17211d); }
      .withdrawal-card .scenario-label { font-size:.76rem; color:var(--muted, #66736d); text-transform:uppercase; letter-spacing:.06em; }
      .withdrawal-card dl { margin:.8rem 0 0; display:grid; gap:.55rem; }
      .withdrawal-card dl div { display:flex; justify-content:space-between; gap:1rem; border-top:1px solid var(--line, #dce4e0); padding-top:.5rem; }
      .withdrawal-card dt { color:var(--muted, #66736d); font-size:.8rem; }
      .withdrawal-card dd { margin:0; font-weight:650; text-align:right; font-size:.84rem; }
      .withdrawal-plan-note { margin-top:1rem; padding:.85rem 1rem; background:#eef5f2; border-radius:.8rem; color:#35544a; font-size:.86rem; }
      @media (max-width: 760px) { .historical-values, .withdrawal-grid { grid-template-columns:1fr; } .historical-baseline .baseline-top { flex-direction:column; } }
    `;
    document.head.appendChild(style);
  }

  function setHistoricalMode(on) {
    const ids = ['preRetirementReturnPct', 'retirementReturnPct', 'inflationPct'];
    if (on) {
      $('preRetirementReturnPct').value = HISTORICAL.preRetirementReturnPct;
      $('retirementReturnPct').value = HISTORICAL.retirementReturnPct;
      $('inflationPct').value = HISTORICAL.inflationPct;
    }
    ids.forEach((id) => {
      const input = $(id);
      if (!input) return;
      input.readOnly = on;
      const field = input.closest('.field');
      if (field) field.classList.toggle('assumption-locked', on);
    });
    ['preRetirementReturnPct','retirementReturnPct','inflationPct'].forEach((id) => {
      $(id)?.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function insertHistoricalControls() {
    const details = $('assumptionsPanel');
    if (!details || $('historicalBaselineBox')) return;
    const box = document.createElement('div');
    box.id = 'historicalBaselineBox';
    box.className = 'historical-baseline';
    box.innerHTML = `
      <div class="baseline-top">
        <div>
          <strong>Historical baseline assumptions</strong>
          <p>Use long-run market and inflation history as the starting point, or turn this off to enter your own assumptions.</p>
        </div>
        <label class="switch-row" for="historicalBaselineEnabled" style="margin:0;padding:0;border:0;background:transparent;">
          <span><strong style="white-space:nowrap;">Use baseline</strong></span>
          <span class="switch"><input id="historicalBaselineEnabled" type="checkbox" checked><span aria-hidden="true"></span></span>
        </label>
      </div>
      <div class="historical-values">
        <div><span>While either spouse works</span><b>${HISTORICAL.preRetirementReturnPct.toFixed(2)}%</b><span>${HISTORICAL.preMix}</span></div>
        <div><span>After both retire</span><b>${HISTORICAL.retirementReturnPct.toFixed(2)}%</b><span>${HISTORICAL.retirementMix}</span></div>
        <div><span>Inflation</span><b>${HISTORICAL.inflationPct.toFixed(2)}%</b><span>${HISTORICAL.inflationPeriod}</span></div>
      </div>
      <p class="source-note">Market reference uses ${HISTORICAL.marketPeriod}: stocks ${HISTORICAL.stockCompoundReturnPct.toFixed(2)}% and 10-year Treasuries ${HISTORICAL.treasuryCompoundReturnPct.toFixed(2)}%. Blended figures are historical references, not forecasts, and do not model sequence-of-returns risk.</p>
    `;
    const content = details.querySelector('.assumptions-grid') || details.lastElementChild;
    if (content) details.insertBefore(box, content);
    else details.appendChild(box);
    $('historicalBaselineEnabled').addEventListener('change', (e) => setHistoricalMode(e.target.checked));
    setHistoricalMode(true);
  }

  function renderWithdrawalScenarios() {
    const section = $('withdrawalScenarioSection');
    if (!section) return;
    const result = root.HouseholdModel.analyze(readForm());
    if (!result || result.errors?.length || !(result.projectedNestEggReal > 0)) {
      $('withdrawalScenarioGrid').innerHTML = '<p>Complete the retirement inputs to see withdrawal scenarios.</p>';
      return;
    }
    const scenarios = root.HouseholdModel.withdrawalScenarios(result);
    const labels = ['Lower draw', 'Middle draw', 'Higher draw'];
    $('withdrawalScenarioGrid').innerHTML = scenarios.map((s, idx) => {
      const trend = s.netBalanceTrend == null ? 'Depleted' : `${s.netBalanceTrend >= 0 ? '+' : ''}${pct.format(s.netBalanceTrend)}/yr`;
      const ending = s.depletedYear ? `Depleted ~year ${s.depletedYear}` : money.format(s.endingBalanceReal);
      return `<article class="withdrawal-card ${idx === 1 ? 'featured' : ''}">
        <div class="scenario-label">${labels[idx]}</div>
        <div class="withdrawal-rate">${Math.round(s.rate * 100)}%</div>
        <div style="color:var(--muted,#66736d);font-size:.8rem;">initial portfolio withdrawal</div>
        <dl>
          <div><dt>Annual withdrawal</dt><dd>${money.format(s.annualWithdrawalReal)}</dd></div>
          <div><dt>Monthly equivalent</dt><dd>${money.format(s.monthlyWithdrawalReal)}</dd></div>
          <div><dt>Ending real balance</dt><dd>${ending}</dd></div>
          <div><dt>Net balance trend</dt><dd>${trend}</dd></div>
        </dl>
      </article>`;
    }).join('');

    const planRate = result.projectedNestEggReal > 0
      ? result.portfolioGapAfterAllIncomeReal / result.projectedNestEggReal
      : 0;
    $('withdrawalPlanNote').innerHTML = `After Social Security, TRS and other recurring retirement income are active, your stated spending goal leaves about <strong>${money.format(result.portfolioGapAfterAllIncomeReal)}/yr</strong> for the portfolio to cover—roughly <strong>${pct.format(planRate)}</strong> of the portfolio projected at first retirement. The three cards above are separate stress tests and do not replace your actual spending plan.`;
  }

  function insertWithdrawalSection() {
    if ($('withdrawalScenarioSection')) return;
    const detailGrid = document.querySelector('.detail-grid');
    if (!detailGrid) return;
    const section = document.createElement('section');
    section.id = 'withdrawalScenarioSection';
    section.className = 'results-section withdrawal-scenarios';
    section.innerHTML = `
      <div class="results-heading">
        <div>
          <p class="eyebrow">Withdrawal stress test</p>
          <h2>How different portfolio withdrawals affect long-term balance</h2>
          <p>These scenarios start at the first retirement and hold the initial withdrawal amount constant in today’s purchasing power. They are comparisons, not recommended “safe” withdrawal rates.</p>
        </div>
      </div>
      <div class="withdrawal-grid" id="withdrawalScenarioGrid"></div>
      <div class="withdrawal-plan-note" id="withdrawalPlanNote"></div>
    `;
    detailGrid.parentNode.insertBefore(section, detailGrid);
  }

  function init() {
    insertStyles();
    insertHistoricalControls();
    insertWithdrawalSection();
    renderWithdrawalScenarios();
    setTimeout(renderWithdrawalScenarios, 0);
    document.addEventListener('input', (e) => {
      if (e.target && (e.target.matches('input,select') || e.target.id === 'historicalBaselineEnabled')) {
        window.requestAnimationFrame(renderWithdrawalScenarios);
      }
    });
    document.addEventListener('change', () => window.requestAnimationFrame(renderWithdrawalScenarios));
    $('resetButton')?.addEventListener('click', () => {
      setTimeout(() => {
        const toggle = $('historicalBaselineEnabled');
        if (toggle) toggle.checked = true;
        setHistoricalMode(true);
        renderWithdrawalScenarios();
      }, 0);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
