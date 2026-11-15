const assert = require('node:assert/strict');
require('./model.js');
require('./household.js');
require('./income-policy.js');
require('./ssa-benefit-schedule.js');

const IRS = globalThis.RetirementModel;
const Compass = globalThis.HouseholdModel;

const limits = IRS.irsLimitsForYear(2027);
assert.deepEqual({
  deferral: limits.deferral, catchup: limits.catchup,
  enhancedCatchup: limits.enhancedCatchup, overall: limits.overall,
  compensation: limits.compensation, rothCatchupWageThreshold: limits.rothCatchupWageThreshold
}, {
  deferral: 25500, catchup: 8500, enhancedCatchup: 11750,
  overall: 75000, compensation: 375000, rothCatchupWageThreshold: 155000
});
assert.equal(limits.estimated, false);
assert.equal(IRS.irsLimitsForYear(2026).deferral, 24500);
assert.equal(IRS.irsLimitsForYear(2028).estimated, true);
assert.ok(IRS.irsLimitsForYear(2030).deferral > limits.deferral);

for (const [age, max] of [[49, 25500], [50, 34000], [59, 34000],
                           [60, 37250], [63, 37250], [64, 34000]]) {
  assert.equal(IRS.contributionLimitsForEmployee(2027, age).employeeDeferralMax, max);
}
const capped = IRS.apply401kLimits({
  salary: 500000, employeeRate: 1, matchRate: 5,
  matchCap: 1, year: 2027, age: 55
});
assert.equal(capped.employeeContribution, 34000);
assert.equal(capped.baseEmployeeContribution + capped.employerContribution, 75000);

assert.equal(IRS.ssaTaxableMaxForYear(2027), 192300);
assert.deepEqual(IRS.bendPointsForEligibilityYear(2027), [1340, 8077]);
assert.equal(IRS.ssaCreditEarningsForYear(2026), 1890);
assert.equal(IRS.ssaCreditEarningsForYear(2027), 1970);
assert.equal(Compass.projectedSocialSecurityCola(2026), 0.036);
assert.deepEqual(Compass.projectedSocialSecurityEarningsTestLimits(2027), {
  underFRA: 25560, attainingFRA: 67920
});

// A modeled short career with fewer than 40 insured credits gets no own-record benefit.
const shortCareer = {
  asOfDate: '2026-11-15', birthDate: '1990-05-10',
  retirementAge: 38, planThroughAge: 95, currentIncome: 100000,
  salaryGrowthPct: 0, socialSecurityCareerStartAge: 36,
  socialSecurityClaimAge: 67, spouseEnabled: false
};
const short = Compass.analyze(shortCareer);
assert.deepEqual(short.errors, []);
assert.equal(short.socialSecurity.estimatedWorkCredits, 12);
assert.equal(short.socialSecurity.insufficientCredits, true);
assert.equal(short.socialSecurity.annualBenefitNominalAtClaim, 0);
const verified = Compass.analyze({ ...shortCareer, ssaCreditsThroughPriorYear: 40 });
assert.equal(verified.socialSecurity.estimatedWorkCredits, 40);
assert.equal(verified.socialSecurity.insufficientCredits, false);
assert.ok(verified.socialSecurity.monthlyBenefitNominalAtClaim > 0);
const zeroPrior = Compass.analyze({ ...shortCareer, ssaCreditsThroughPriorYear: 0 });
assert.equal(zeroPrior.socialSecurity.insufficientCredits, true);

const household = Compass.analyze({
  ...shortCareer, birthDate: '1980-05-10', retirementAge: 67,
  socialSecurityCareerStartAge: 22, spouseEnabled: true,
  spouseBirthDate: '1990-05-10', spouseRetirementAge: 38,
  spouseCurrentIncome: 100000, spouseSocialSecurityEnabled: true,
  spouseSocialSecurityCareerStartAge: 36, spouseTrsEnabled: false
});
assert.deepEqual(household.errors, []);
assert.equal(household.socialSecurity.insufficientCredits, false);
assert.equal(household.spouseSocialSecurity.insufficientCredits, true);
assert.equal(household.spouseSocialSecurity.annualBenefitReal, 0);

const trsScenario = {
  asOfDate: '2026-11-15', spouseEnabled: true, spouseTrsEnabled: true,
  spouseBirthDate: '1980-01-01', spouseRetirementAge: 62,
  spouseCurrentIncome: 70000, spouseSalaryGrowthPct: 0,
  spouseTrsCurrentServiceYears: 15, spouseTrsTier: '2'
};
const full = Compass.estimateAlabamaTrs(Compass.normalize(trsScenario));
const half = Compass.estimateAlabamaTrs(Compass.normalize({
  ...trsScenario, spouseTrsFutureServicePct: 50
}));
const purchased = Compass.estimateAlabamaTrs(Compass.normalize({
  ...trsScenario, spouseTrsPlannedFederalServiceYears: 4
}));
assert.equal(full.eligible, true);
assert.equal(half.eligible, true);
assert.equal(full.averageFinalSalary, 70000);
assert.ok(full.serviceAtStop > half.serviceAtStop);
assert.ok(full.annualBenefitNominal > half.annualBenefitNominal);
assert.ok(Math.abs(purchased.serviceAtStop - full.serviceAtStop - 4) < 1e-6);
assert.ok(purchased.annualBenefitNominal > full.annualBenefitNominal);
assert.equal(Compass.normalize({ ...trsScenario, spouseTrsPlannedFederalServiceYears: 20 })
  .spouseTrsPlannedFederalServiceYears, 4);
assert.equal(Compass.normalize({ ...trsScenario, spouseTrsFutureServicePct: 200 })
  .spouseTrsFutureServicePct, 100);

// Under the original defaults, the new optional inputs preserve full service.
const defaults = Compass.normalize(trsScenario);
assert.equal(defaults.spouseTrsFutureServicePct, 100);
assert.equal(defaults.spouseTrsPlannedFederalServiceYears, 0);

console.log('2027 IRS, SSA and Alabama TRS regression tests passed.');
