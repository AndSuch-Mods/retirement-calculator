(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RetirementModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    currentAge: 35,
    retirementAge: 65,
    planThroughAge: 95,
    currentSavings: 50000,
    currentIncome: 80000,
    employeeContributionPct: 10,
    employerMatchRatePct: 50,
    employerMatchCapPct: 6,
    salaryGrowthPct: 3,
    autoIncreaseEnabled: false,
    autoIncreasePctPoints: 1,
    maxEmployeeContributionPct: 15,
    desiredSpending: 60000,
    otherRetirementIncome: 20000,
    preRetirementReturnPct: 7,
    retirementReturnPct: 5,
    inflationPct: 2.5
  });

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const number = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  function normalize(raw = {}) {
    const merged = { ...DEFAULTS, ...raw };
    return {
      currentAge: clamp(number(merged.currentAge, DEFAULTS.currentAge), 0, 100),
      retirementAge: clamp(number(merged.retirementAge, DEFAULTS.retirementAge), 1, 110),
      planThroughAge: clamp(number(merged.planThroughAge, DEFAULTS.planThroughAge), 1, 120),
      currentSavings: Math.max(number(merged.currentSavings), 0),
      currentIncome: Math.max(number(merged.currentIncome), 0),
      employeeContributionPct: clamp(number(merged.employeeContributionPct), 0, 100),
      employerMatchRatePct: clamp(number(merged.employerMatchRatePct), 0, 500),
      employerMatchCapPct: clamp(number(merged.employerMatchCapPct), 0, 100),
      salaryGrowthPct: clamp(number(merged.salaryGrowthPct), -20, 50),
      autoIncreaseEnabled: Boolean(merged.autoIncreaseEnabled),
      autoIncreasePctPoints: clamp(number(merged.autoIncreasePctPoints), 0, 25),
      maxEmployeeContributionPct: clamp(number(merged.maxEmployeeContributionPct), 0, 100),
      desiredSpending: Math.max(number(merged.desiredSpending), 0),
      otherRetirementIncome: Math.max(number(merged.otherRetirementIncome), 0),
      preRetirementReturnPct: clamp(number(merged.preRetirementReturnPct), -50, 50),
      retirementReturnPct: clamp(number(merged.retirementReturnPct), -50, 50),
      inflationPct: clamp(number(merged.inflationPct), -10, 25)
    };
  }

  function validate(input) {
    const errors = [];
    if (input.retirementAge <= input.currentAge) {
      errors.push('Retirement age must be greater than current age.');
    }
    if (input.planThroughAge <= input.retirementAge) {
      errors.push('Plan-through age must be greater than retirement age.');
    }
    if (input.currentIncome <= 0) {
      errors.push('Annual salary must be greater than $0.');
    }
    if (input.autoIncreaseEnabled && input.maxEmployeeContributionPct < input.employeeContributionPct) {
      errors.push('Maximum contribution cannot be below your starting contribution rate.');
    }
    return errors;
  }

  function annuityPresentValue(payment, rate, years) {
    if (!(payment > 0) || !(years > 0)) return 0;
    if (Math.abs(rate) < 1e-10) return payment * years;
    return payment * (1 - Math.pow(1 + rate, -years)) / rate;
  }

  function annuityPayment(presentValue, rate, years) {
    if (!(presentValue > 0) || !(years > 0)) return 0;
    if (Math.abs(rate) < 1e-10) return presentValue / years;
    return presentValue * rate / (1 - Math.pow(1 + rate, -years));
  }

  function employerMatchEffectiveRate(employeeRate, matchRate, matchCap) {
    return Math.min(Math.max(employeeRate, 0), Math.max(matchCap, 0)) * Math.max(matchRate, 0);
  }

  function contributionRateForYear(input, yearIndex) {
    const start = input.employeeContributionPct / 100;
    if (!input.autoIncreaseEnabled) return start;
    const step = input.autoIncreasePctPoints / 100;
    const cap = input.maxEmployeeContributionPct / 100;
    return Math.min(start + step * yearIndex, cap);
  }

  function simulateCore(rawInput) {
    const input = normalize(rawInput);
    const errors = validate(input);
    if (errors.length) return { input, errors };

    const workYears = Math.round(input.retirementAge - input.currentAge);
    const retirementYears = Math.round(input.planThroughAge - input.retirementAge);
    const preReturn = input.preRetirementReturnPct / 100;
    const retirementReturn = input.retirementReturnPct / 100;
    const inflation = input.inflationPct / 100;
    const salaryGrowth = input.salaryGrowthPct / 100;
    const matchRate = input.employerMatchRatePct / 100;
    const matchCap = input.employerMatchCapPct / 100;

    const timeline = [{
      age: input.currentAge,
      yearsFromNow: 0,
      phase: 'working',
      nominalBalance: input.currentSavings,
      realBalance: input.currentSavings,
      employeeContribution: 0,
      employerContribution: 0,
      salary: input.currentIncome
    }];

    let balance = input.currentSavings;
    let employeeContributions = 0;
    let employerContributions = 0;
    let investmentGrowth = 0;

    for (let year = 0; year < workYears; year += 1) {
      const salary = input.currentIncome * Math.pow(1 + salaryGrowth, year);
      const employeeRate = contributionRateForYear(input, year);
      const matchEffective = employerMatchEffectiveRate(employeeRate, matchRate, matchCap);
      const employeeContribution = salary * employeeRate;
      const employerContribution = salary * matchEffective;
      const growth = balance * preReturn;

      balance += growth + employeeContribution + employerContribution;
      employeeContributions += employeeContribution;
      employerContributions += employerContribution;
      investmentGrowth += growth;

      const yearsFromNow = year + 1;
      const inflationFactor = Math.pow(1 + inflation, yearsFromNow);
      timeline.push({
        age: input.currentAge + yearsFromNow,
        yearsFromNow,
        phase: yearsFromNow === workYears ? 'retirement-start' : 'working',
        nominalBalance: Math.max(balance, 0),
        realBalance: Math.max(balance, 0) / inflationFactor,
        employeeContribution,
        employerContribution,
        salary
      });
    }

    const projectedNestEggNominal = Math.max(balance, 0);
    const retirementInflationFactor = Math.pow(1 + inflation, workYears);
    const projectedNestEggReal = projectedNestEggNominal / retirementInflationFactor;

    const spendingGapReal = Math.max(input.desiredSpending - input.otherRetirementIncome, 0);
    const realRetirementReturn = (1 + retirementReturn) / (1 + inflation) - 1;
    const requiredNestEggReal = annuityPresentValue(spendingGapReal, realRetirementReturn, retirementYears);
    const requiredNestEggNominal = requiredNestEggReal * retirementInflationFactor;
    const sustainablePortfolioIncomeReal = annuityPayment(projectedNestEggReal, realRetirementReturn, retirementYears);
    const sustainableTotalIncomeReal = sustainablePortfolioIncomeReal + input.otherRetirementIncome;
    const fundingRatio = requiredNestEggReal > 0 ? projectedNestEggReal / requiredNestEggReal : Infinity;
    const surplusReal = projectedNestEggReal - requiredNestEggReal;
    const onTrack = spendingGapReal <= 0 || projectedNestEggReal >= requiredNestEggReal;

    // Withdrawals are modeled at year end. A constant real withdrawal therefore
    // needs one additional year of inflation before the first retirement withdrawal.
    const firstYearWithdrawalNominal = spendingGapReal * retirementInflationFactor * (1 + inflation);
    let retirementBalance = projectedNestEggNominal;
    let depletedAtAge = null;

    for (let year = 1; year <= retirementYears; year += 1) {
      const withdrawal = firstYearWithdrawalNominal * Math.pow(1 + inflation, year - 1);
      const growth = retirementBalance * retirementReturn;
      retirementBalance = retirementBalance + growth - withdrawal;
      if (retirementBalance <= 0) {
        retirementBalance = 0;
        if (depletedAtAge === null) depletedAtAge = input.retirementAge + year;
      }

      const yearsFromNow = workYears + year;
      const inflationFactor = Math.pow(1 + inflation, yearsFromNow);
      timeline.push({
        age: input.retirementAge + year,
        yearsFromNow,
        phase: 'retired',
        nominalBalance: retirementBalance,
        realBalance: retirementBalance / inflationFactor,
        withdrawal,
        growth
      });
    }

    const startingEmployeeRate = input.employeeContributionPct / 100;
    const startingMatchRate = employerMatchEffectiveRate(startingEmployeeRate, matchRate, matchCap);
    const endingEmployeeRate = contributionRateForYear(input, Math.max(workYears - 1, 0));
    const endingMatchRate = employerMatchEffectiveRate(endingEmployeeRate, matchRate, matchCap);

    return {
      input,
      errors: [],
      workYears,
      retirementYears,
      realRetirementReturn,
      spendingGapReal,
      projectedNestEggReal,
      projectedNestEggNominal,
      requiredNestEggReal,
      requiredNestEggNominal,
      sustainablePortfolioIncomeReal,
      sustainableTotalIncomeReal,
      fundingRatio,
      surplusReal,
      onTrack,
      depletedAtAge,
      endingBalanceNominal: retirementBalance,
      endingBalanceReal: retirementBalance / Math.pow(1 + inflation, workYears + retirementYears),
      employeeContributions,
      employerContributions,
      investmentGrowth,
      startingEmployeeRate,
      startingMatchRate,
      endingEmployeeRate,
      endingMatchRate,
      timeline
    };
  }

  function findRequiredFlatEmployeeRate(rawInput) {
    const input = normalize(rawInput);
    const errors = validate(input);
    if (errors.length) return null;

    const current = simulateCore(input);
    if (current.onTrack) return input.employeeContributionPct / 100;

    const upperRate = 0.6;
    const atUpper = simulateCore({
      ...input,
      employeeContributionPct: upperRate * 100,
      autoIncreaseEnabled: false,
      maxEmployeeContributionPct: upperRate * 100
    });
    if (!atUpper.onTrack) return null;

    let low = 0;
    let high = upperRate;
    for (let iteration = 0; iteration < 50; iteration += 1) {
      const mid = (low + high) / 2;
      const result = simulateCore({
        ...input,
        employeeContributionPct: mid * 100,
        autoIncreaseEnabled: false,
        maxEmployeeContributionPct: mid * 100
      });
      if (result.onTrack) high = mid;
      else low = mid;
    }
    return high;
  }

  function analyze(rawInput) {
    const result = simulateCore(rawInput);
    if (result.errors.length) return result;

    const requiredFlatEmployeeRate = result.onTrack ? null : findRequiredFlatEmployeeRate(result.input);
    const currentMonthlyEmployeeContribution = result.input.currentIncome * (result.input.employeeContributionPct / 100) / 12;
    const targetMonthlyEmployeeContribution = requiredFlatEmployeeRate == null
      ? null
      : result.input.currentIncome * requiredFlatEmployeeRate / 12;

    return {
      ...result,
      requiredFlatEmployeeRate,
      currentMonthlyEmployeeContribution,
      targetMonthlyEmployeeContribution,
      additionalMonthlyContributionNeeded: targetMonthlyEmployeeContribution == null
        ? null
        : Math.max(targetMonthlyEmployeeContribution - currentMonthlyEmployeeContribution, 0)
    };
  }

  return {
    DEFAULTS,
    normalize,
    validate,
    annuityPresentValue,
    annuityPayment,
    employerMatchEffectiveRate,
    contributionRateForYear,
    simulateCore,
    findRequiredFlatEmployeeRate,
    analyze
  };
});
