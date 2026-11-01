const assert = require('node:assert/strict');
require('./model.js');
require('./household.js');
require('./income-policy.js');
require('./ssa-benefit-schedule.js');

const Model = globalThis.HouseholdModel;

const base = {
  asOfDate: '2026-11-01', birthDate: '1965-01-01',
  retirementAge: 62.5, planThroughAge: 90, currentIncome: 300000,
  salaryGrowthPct: 0, socialSecurityClaimAge: 62, spouseEnabled: false
};
const grace = Model.analyze(base);
const annualOnly = Model.analyze({ ...base, ssaUseMonthlyRule: false });
assert.deepEqual(grace.errors, []);
assert.equal(grace.socialSecurity.ssaPaymentSummary.graceYear, 2027);
const graceMonths = grace.ssaSchedules[0].months.filter(m => m.year === 2027);
const annualMonths = annualOnly.ssaSchedules[0].months.filter(m => m.year === 2027);
const total = rows => rows.reduce((sum, month) => sum + month.paid, 0);
assert.ok(total(graceMonths) > total(annualMonths));
assert.ok(graceMonths.some(m => m.month >= 7 && m.paid > 0));
assert.ok(graceMonths.filter(m => m.nonService).every(m => m.withheld === 0));
assert.ok(annualMonths.some(m => m.month >= 7 && m.withheld > 0));

// A non-service month later than the year of claiming creates a later grace year.
const later = Model.analyze({
  asOfDate: '2026-11-01', birthDate: '1965-05-10', retirementAge: 65.5,
  planThroughAge: 95, currentIncome: 150000, salaryGrowthPct: 0,
  socialSecurityClaimAge: 62
});
assert.equal(later.socialSecurity.ssaPaymentSummary.graceYear, 2030);

// Month-specific wage overrides may replace calculated wages with exactly $0.
const custom = Model.analyze({
  ...base, ssaMonthlyOverrideYear: 2027, ssaWageOverride10: 0
});
assert.equal(custom.ssaSchedules[0].months.find(m => m.year === 2027 && m.month === 9).wages, 0);

// Substantial self-employment prevents a month from qualifying as non-service.
const selfEmployed = Model.analyze({
  ...base, ssaMonthlyOverrideYear: 2027,
  ssaSelfEmploymentMonth07: true, ssaSelfEmploymentMonth08: true,
  ssaSelfEmploymentMonth09: true, ssaSelfEmploymentMonth10: true,
  ssaSelfEmploymentMonth11: true, ssaSelfEmploymentMonth12: true
});
assert.equal(selfEmployed.socialSecurity.ssaPaymentSummary.graceYear, 2028);
const extraNetIncome = Model.analyze({
  ...base, ssaMonthlyOverrideYear: 2027, ssaNetSelfEmploymentYear: 10000
});
const earnings = result => result.ssaSchedules[0].years.find(year => year.year === 2027).testEarnings;
assert.ok(Math.abs(earnings(extraNetIncome) - earnings(grace) - 10000) < 0.01);

// SSA credits even partially withheld months at FRA; the adjustment is
// effective beginning with that month, not while the person is still under FRA.
const earning = {
  asOfDate: '2026-11-01', birthDate: '1965-05-10',
  retirementAge: 65, planThroughAge: 95, currentIncome: 150000,
  salaryGrowthPct: 0, socialSecurityClaimAge: 62
};
const withArf = Model.analyze(earning);
const withoutArf = Model.analyze({ ...earning, ssaApplyFraAdjustment: false });
const adjusted = withArf.socialSecurity.ssaPaymentSummary;
assert.ok(adjusted.creditedMonths > 0);
assert.ok(adjusted.fraIncreasePct > 0);
assert.equal(withoutArf.socialSecurity.ssaPaymentSummary.fraIncreasePct, 0);
const july2033 = s => s.ssaSchedules[0].months.find(m => m.year === 2033 && m.month === 6);
assert.ok(july2033(withArf).paid > july2033(withoutArf).paid);
const april2032 = s => s.ssaSchedules[0].months.find(m => m.year === 2032 && m.month === 3);
assert.equal(april2032(withArf).paid, april2032(withoutArf).paid);
assert.ok(withArf.ssaSchedules[0].months.some(
  m => m.withheld > 0 && m.withheld < m.gross
));

// No earnings-test increase is created when claiming at or after full retirement age.
const fraClaim = Model.analyze({ ...earning, socialSecurityClaimAge: 67 });
assert.equal(fraClaim.socialSecurity.ssaPaymentSummary.creditedMonths, 0);
assert.equal(fraClaim.socialSecurity.ssaPaymentSummary.fraIncreasePct, 0);

// Spouse settings are independent of the primary person's settings.
const household = Model.analyze({
  ...earning, spouseEnabled: true, spouseBirthDate: '1965-06-01',
  spouseRetirementAge: 64, spouseSocialSecurityClaimAge: 62,
  spouseCurrentIncome: 135000, spouseSalaryGrowthPct: 0,
  spouseSsaUseMonthlyRule: false, spouseSsaApplyFraAdjustment: false
});
assert.deepEqual(household.errors, []);
assert.equal(household.ssaSchedules.length, 2);
assert.equal(household.spouseSocialSecurity.ssaPaymentSummary.fraIncreasePct, 0);
assert.ok(household.socialSecurity.ssaPaymentSummary.fraIncreasePct > 0);

console.log('All Retirement Compass monthly SSA and FRA adjustment tests passed.');
