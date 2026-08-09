const assert = require('assert');
const Model = require('./model.js');

function approx(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

// Defaults should be valid and generate the full age timeline.
{
  const result = Model.analyze(Model.DEFAULTS);
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.workYears, 30);
  assert.strictEqual(result.retirementYears, 30);
  assert.strictEqual(result.timeline[0].age, 35);
  assert.strictEqual(result.timeline[result.timeline.length - 1].age, 95);
  assert.ok(result.socialSecurity.annualBenefitReal > 0);
}

// Employer match: 50% of employee contribution up to 6% of salary.
{
  approx(Model.employerMatchEffectiveRate(0.10, 0.50, 0.06), 0.03, 1e-12, 'effective match');
  approx(Model.employerMatchEffectiveRate(0.04, 0.50, 0.06), 0.02, 1e-12, 'effective match below cap');
}

// 2026 IRS employee limits must cap planned deferrals.
{
  const under50 = Model.apply401kLimits({ salary: 500000, employeeRate: 0.20, matchRate: 0, matchCap: 0, year: 2026, age: 35 });
  approx(under50.employeeContribution, 24500, 0.01, '2026 under-50 deferral cap');

  const age55 = Model.apply401kLimits({ salary: 500000, employeeRate: 0.20, matchRate: 0, matchCap: 0, year: 2026, age: 55 });
  approx(age55.employeeContribution, 32500, 0.01, '2026 age-50+ deferral cap');

  const age61 = Model.apply401kLimits({ salary: 500000, employeeRate: 0.20, matchRate: 0, matchCap: 0, year: 2026, age: 61 });
  approx(age61.employeeContribution, 35750, 0.01, '2026 age-60-63 enhanced catch-up cap');
}

// Overall employee + employer annual additions should be capped before catch-up.
{
  const result = Model.apply401kLimits({ salary: 500000, employeeRate: 1, matchRate: 10, matchCap: 1, year: 2026, age: 35 });
  approx(result.employeeContribution + result.employerContribution, 72000, 0.01, '2026 overall plan cap');
}

// Future IRS limits should increase using the historical projection rather than staying frozen.
{
  const current = Model.irsLimitsForYear(2026);
  const future = Model.irsLimitsForYear(2036);
  assert.ok(future.deferral > current.deferral);
  assert.ok(future.overall > current.overall);
  assert.strictEqual(future.estimated, true);
}

// Social Security claiming adjustment should match current-law age mechanics for FRA 67.
{
  approx(Model.socialSecurityClaimFactor(62, 67), 0.70, 1e-10, 'claim at 62 with FRA 67');
  approx(Model.socialSecurityClaimFactor(67, 67), 1.00, 1e-10, 'claim at FRA');
  approx(Model.socialSecurityClaimFactor(70, 67), 1.24, 1e-10, 'claim at 70 with FRA 67');
}

// Delaying Social Security should increase the modeled benefit.
{
  const early = Model.estimateSocialSecurity({ ...Model.DEFAULTS, socialSecurityClaimAge: 62 });
  const late = Model.estimateSocialSecurity({ ...Model.DEFAULTS, socialSecurityClaimAge: 70 });
  assert.ok(late.annualBenefitReal > early.annualBenefitReal);
}

// Salary growth must compound correctly and year 1 uses current salary.
{
  const result = Model.simulateCore({
    ...Model.DEFAULTS,
    socialSecurityEnabled: false,
    currentAge: 40,
    retirementAge: 42,
    planThroughAge: 72,
    currentSavings: 0,
    currentIncome: 100000,
    salaryGrowthPct: 10,
    employeeContributionPct: 10,
    employerMatchRatePct: 0,
    preRetirementReturnPct: 0
  });
  approx(result.timeline[1].employeeContribution, 10000, 0.01, 'year 1 contribution');
  approx(result.timeline[2].employeeContribution, 11000, 0.01, 'year 2 contribution');
  approx(result.projectedNestEggNominal, 21000, 0.01, 'two-year accumulation');
}

// Today-dollar chart values must equal nominal value deflated by inflation to each year.
{
  const result = Model.simulateCore({
    ...Model.DEFAULTS,
    currentAge: 40,
    retirementAge: 42,
    planThroughAge: 72,
    inflationPct: 5
  });
  const point = result.timeline[2];
  approx(point.realBalance, point.nominalBalance / Math.pow(1.05, 2), 0.01, 'real timeline balance');
}

// If outside income fully covers spending, required nest egg is zero and plan is on track.
{
  const result = Model.analyze({ ...Model.DEFAULTS, socialSecurityEnabled: false, desiredSpending: 50000, otherRetirementIncome: 60000 });
  approx(result.requiredNestEggReal, 0, 1e-9, 'zero required nest egg');
  assert.strictEqual(result.onTrack, true);
}

// Social Security starting after retirement should reduce the later portfolio gap.
{
  const result = Model.analyze({ ...Model.DEFAULTS, retirementAge: 65, socialSecurityClaimAge: 67 });
  assert.ok(result.portfolioGapAfterSocialSecurityReal < result.portfolioGapBeforeSocialSecurityReal);
  const age66 = result.timeline.find((p) => p.age === 66);
  const age67 = result.timeline.find((p) => p.age === 67);
  assert.strictEqual(age66.socialSecurityIncomeReal, 0);
  assert.ok(age67.socialSecurityIncomeReal > 0);
}

// A portfolio starting retirement at the required nest egg should finish near zero.
{
  const base = Model.simulateCore({ ...Model.DEFAULTS, currentSavings: 0, employeeContributionPct: 0, employerMatchRatePct: 0 });
  const inflation = Model.DEFAULTS.inflationPct / 100;
  const workYears = Model.DEFAULTS.retirementAge - Model.DEFAULTS.currentAge;
  const requiredNominal = base.requiredNestEggReal * Math.pow(1 + inflation, workYears);
  const seededToday = requiredNominal / Math.pow(1 + Model.DEFAULTS.preRetirementReturnPct / 100, workYears);
  const result = Model.simulateCore({
    ...Model.DEFAULTS,
    currentSavings: seededToday,
    employeeContributionPct: 0,
    employerMatchRatePct: 0
  });
  approx(result.endingBalanceReal, 0, 2, 'required nest egg depletion');
}

// Increasing the employee contribution should not reduce retirement assets, subject to IRS caps.
{
  const low = Model.analyze({ ...Model.DEFAULTS, employeeContributionPct: 5, autoIncreaseEnabled: false });
  const high = Model.analyze({ ...Model.DEFAULTS, employeeContributionPct: 15, autoIncreaseEnabled: false });
  assert.ok(high.projectedNestEggReal > low.projectedNestEggReal);
}

// A shortfall scenario should return a required flat employee rate when reachable.
{
  const result = Model.analyze({
    ...Model.DEFAULTS,
    socialSecurityEnabled: false,
    currentAge: 35,
    retirementAge: 65,
    planThroughAge: 95,
    currentSavings: 0,
    employeeContributionPct: 1,
    desiredSpending: 90000,
    otherRetirementIncome: 10000
  });
  if (!result.onTrack) {
    assert.ok(result.requiredFlatEmployeeRate === null || result.requiredFlatEmployeeRate > 0.01);
  }
}

console.log('All Retirement Compass model tests passed.');