(function (root) {
  'use strict';

  const Model = root.HouseholdModel;
  if (!Model || Model.__fixedNominalOtherIncomePolicy) return;

  const originalAnalyze = Model.analyze.bind(Model);
  const DAY = 86400000;

  function days(a, b) {
    return Math.max(0, (b - a) / DAY);
  }

  function yearFraction(a, b) {
    if (!(a instanceof Date) || !(b instanceof Date) || b <= a) return 0;
    const year = a.getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    return days(a, b) / Math.max(days(start, end), 1);
  }

  function maxDate(a, b) {
    return new Date(Math.max(+a, +b));
  }

  function inflationFactor(result, date) {
    const years = Math.max(Model.yearsBetween(result.asOfDate, date), 0);
    return Math.pow(1 + result.input.inflationPct / 100, years);
  }

  function enrichSocialSecurity(result, ss) {
    if (!ss || !ss.enabled || !(ss.claimDate instanceof Date)) return ss;
    const factor = inflationFactor(result, ss.claimDate);
    return {
      ...ss,
      annualBenefitNominalAtClaim: ss.annualBenefitReal * factor,
      monthlyBenefitNominalAtClaim: ss.monthlyBenefitReal * factor
    };
  }

  function analyze(raw = {}) {
    const result = originalAnalyze(raw);
    if (!result || result.errors?.length || !Array.isArray(result.timeline) || result.timeline.length < 2) return result;

    result.socialSecurity = enrichSocialSecurity(result, result.socialSecurity);
    result.spouseSocialSecurity = enrichSocialSecurity(result, result.spouseSocialSecurity);

    const input = result.input;
    const inflation = input.inflationPct / 100;
    const firstRetirement = result.firstRetirementDate;
    const timeline = result.timeline.map((point) => ({ ...point }));
    const segments = [];

    let balance = Math.max(Number(timeline[0].nominalBalance) || 0, 0);
    let totalGrowth = 0;
    let totalWithdrawals = 0;
    let depletionDate = null;

    timeline[0].nominalBalance = balance;
    timeline[0].realBalance = balance;
    timeline[0].otherIncome = 0;
    timeline[0].withdrawal = 0;

    for (let index = 1; index < timeline.length; index += 1) {
      const previous = timeline[index - 1];
      const point = timeline[index];
      const years = Math.max(Model.yearsBetween(previous.date, point.date), 0);
      const rate = (point.anyoneWorking ? input.preRetirementReturnPct : input.retirementReturnPct) / 100;
      const growthFactor = Math.pow(1 + rate, years);
      const growth = balance * (growthFactor - 1);

      balance += growth;
      balance += Number(point.contributions) || 0;
      totalGrowth += growth;

      let otherIncome = 0;
      if (point.date > firstRetirement) {
        const start = maxDate(previous.date, firstRetirement);
        if (point.date > start) {
          otherIncome = input.otherRetirementIncome * yearFraction(start, point.date);
        }
      }

      const withdrawal = Math.max(
        (Number(point.spending) || 0)
        - (Number(point.workingIncome) || 0)
        - (Number(point.ssIncome) || 0)
        - (Number(point.trsIncome) || 0)
        - otherIncome,
        0
      );

      balance -= withdrawal;
      totalWithdrawals += withdrawal;
      if (balance <= 0) {
        balance = 0;
        if (!depletionDate) depletionDate = point.date;
      }

      const realFactor = Math.pow(1 + inflation, Math.max(Model.yearsBetween(result.asOfDate, point.date), 0));
      point.growth = growth;
      point.otherIncome = otherIncome;
      point.withdrawal = withdrawal;
      point.nominalBalance = balance;
      point.realBalance = balance / realFactor;

      segments.push({
        start: previous.date,
        end: point.date,
        growthFactor,
        contributions: Number(point.contributions) || 0,
        withdrawal
      });
    }

    const firstPoint = timeline.find((point) => +point.date === +firstRetirement)
      || timeline.find((point) => point.date >= firstRetirement)
      || timeline[timeline.length - 1];
    const projectedNominal = Number(firstPoint.nominalBalance) || 0;

    let requiredNominal = 0;
    const retirementSegments = segments.filter((segment) => segment.start >= firstRetirement);
    for (let index = retirementSegments.length - 1; index >= 0; index -= 1) {
      const segment = retirementSegments[index];
      requiredNominal = Math.max(
        0,
        (requiredNominal + segment.withdrawal - segment.contributions) / Math.max(segment.growthFactor, 1e-12)
      );
    }

    const firstInflationFactor = Math.pow(1 + inflation, Math.max(Model.yearsBetween(result.asOfDate, firstRetirement), 0));
    const projectedReal = projectedNominal / firstInflationFactor;
    const requiredReal = requiredNominal / firstInflationFactor;
    const otherIncomeRealAtFirstRetirement = input.otherRetirementIncome / firstInflationFactor;
    const stableIncomeReal = otherIncomeRealAtFirstRetirement
      + (result.socialSecurity?.annualBenefitReal || 0)
      + (result.spouseSocialSecurity?.annualBenefitReal || 0)
      + (result.trs?.eligible ? result.trs.annualBenefitRealAtStart : 0);
    const portfolioGapReal = Math.max(input.desiredSpending - stableIncomeReal, 0);
    const endFactor = Math.pow(1 + inflation, Math.max(Model.yearsBetween(result.asOfDate, result.endDate), 0));

    return {
      ...result,
      socialSecurity: result.socialSecurity,
      spouseSocialSecurity: result.spouseSocialSecurity,
      projectedNestEggNominal: projectedNominal,
      projectedNestEggReal: projectedReal,
      requiredNestEggNominal: requiredNominal,
      requiredNestEggReal: requiredReal,
      fundingRatio: requiredNominal ? projectedNominal / requiredNominal : Infinity,
      surplusReal: projectedReal - requiredReal,
      onTrack: !depletionDate,
      depletionDate,
      endingBalanceNominal: balance,
      endingBalanceReal: balance / endFactor,
      investmentGrowth: totalGrowth,
      totalWithdrawals,
      stableRetirementIncomeReal: stableIncomeReal,
      portfolioGapAfterAllIncomeReal: portfolioGapReal,
      spendingGapReal: portfolioGapReal,
      timeline
    };
  }

  root.HouseholdModel = {
    ...Model,
    analyze,
    __fixedNominalOtherIncomePolicy: true
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);