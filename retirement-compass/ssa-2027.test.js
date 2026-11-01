const assert = require('node:assert/strict');
require('./model.js');
require('./household.js');
require('./income-policy.js');

const Base = globalThis.RetirementModel;
const Compass = globalThis.HouseholdModel;
const approx = (actual, expected, precision = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < precision, `expected ${expected}, got ${actual}`);

assert.equal(Base.averageWageIndexForYear(2025), 72800.33);
assert.equal(Compass.projectedSocialSecurityAwi(2025), 72800.33);
approx(Compass.projectedSocialSecurityAwi(2026), 75246.70 * 72800.33 / 72025.07);
assert.equal(Base.ssaTaxableMaxForYear(2027), 192300);
assert.deepEqual(Base.bendPointsForEligibilityYear(2027), [1340, 8077]);
assert.deepEqual(Compass.projectedSocialSecurityBendPoints(2027), [1340, 8077]);
assert.equal(Compass.projectedSocialSecurityCola(2026), 0.036); // Dec 2026, paid in Jan 2027
assert.equal(Compass.projectedSocialSecurityCola(2027), 0.024); // Dec 2027 forecast
assert.deepEqual(Compass.projectedSocialSecurityEarningsTestLimits(2027), {
  underFRA: 25560, attainingFRA: 67920
});

const earlyClaim = {
  asOfDate: '2026-11-01',
  birthDate: '1965-06-01',
  retirementAge: 68,
  planThroughAge: 90,
  currentIncome: 100000,
  salaryGrowthPct: 0,
  socialSecurityClaimAge: 62,
  spouseEnabled: true,
  spouseBirthDate: '1963-06-01',
  spouseRetirementAge: 64,
  spouseCurrentIncome: 50000,
  spouseSocialSecurityEnabled: false,
  spouseTrsEnabled: false
};
const high = Compass.analyze(earlyClaim);
assert.deepEqual(high.errors, []);
assert.ok(high.socialSecurity.earningsTestMayApply);
const highTest = Compass.projectedSocialSecurityEarningsTest(
  high.primary, high.socialSecurity, 2027, 2026
);
assert.equal(highTest.limit, 25560);
assert.equal(highTest.payableShare, 0);
const ss2028High = high.timeline.filter(p => p.calendarYear === 2028).reduce((n, p) => n + p.ssIncome, 0);
approx(ss2028High, 0);

const low = Compass.analyze({ ...earlyClaim, currentIncome: 10000 });
const lowTest = Compass.projectedSocialSecurityEarningsTest(
  low.primary, low.socialSecurity, 2027, 2026
);
assert.equal(lowTest.payableShare, 1);
const ss2028Low = low.timeline.filter(p => p.calendarYear === 2028).reduce((n, p) => n + p.ssIncome, 0);
assert.ok(ss2028Low > 0);

const attainingFRA = Compass.analyze({
  asOfDate: '2026-11-01', birthDate: '1960-07-15',
  retirementAge: 69, planThroughAge: 90,
  currentIncome: 120000, salaryGrowthPct: 0, socialSecurityClaimAge: 62
});
assert.deepEqual(attainingFRA.errors, []);
const fraTest = Compass.projectedSocialSecurityEarningsTest(
  attainingFRA.primary, attainingFRA.socialSecurity, 2027, 2026
);
assert.equal(fraTest.attainingFRA, true);
assert.equal(fraTest.limit, 67920);
assert.ok(fraTest.earnings < 67920);
approx(fraTest.withheld, 0);
assert.equal(Compass.projectedSocialSecurityEarningsTest(
  attainingFRA.primary, attainingFRA.socialSecurity, 2028, 2026
).withheld, 0);

console.log('Retirement Compass 2027 SSA rule tests passed.');
