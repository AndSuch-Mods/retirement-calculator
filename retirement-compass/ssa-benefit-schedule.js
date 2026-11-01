(function (root) {
  'use strict';

  // Retirement insurance benefits (own earnings record), not auxiliary or
  // survivor benefits. SSA policy references:
  // RS 02501.030 (grace-year monthly test),
  // RS 02501.095 (charge excess to earliest payable months),
  // RS 00615.482 and RS 00615.490 (FRA reduction-factor adjustment).
  const DAY = 86400000;
  const Base = root.RetirementModel;
  if (!Base) return;

  const monthStart = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const nextMonth = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const minDate = (a, b) => a < b ? a : b;
  const maxDate = (a, b) => a > b ? a : b;
  const wholeMonths = (a, b) => Math.max(0, Math.round(
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  ));

  function entitlementMonth(ss) {
    const date = ss.claimDate;
    // At age 62, the first full month of age-62 eligibility is normally the
    // next month when the birthday falls after the second of the month.
    return new Date(Date.UTC(date.getUTCFullYear(),
      date.getUTCMonth() + (ss.claimAge === 62 && date.getUTCDate() > 2 ? 1 : 0), 1));
  }

  function fraMonthForPerson(p, ss, addYears) {
    const birthday = addYears(p.birth, ss.fullRetirementAge);
    // A person born on the first attains an age in the previous month.
    return new Date(Date.UTC(birthday.getUTCFullYear(),
      birthday.getUTCMonth() - (p.birth.getUTCDate() === 1 ? 1 : 0), 1));
  }

  function projectedWagesInMonth(p, year, month, currentYear, addYears) {
    const start = new Date(Date.UTC(year, month, 1));
    const end = nextMonth(start);
    const retire = addYears(p.birth, p.retirementAge);
    const workEnd = minDate(retire, end);
    if (workEnd <= start) return 0;
    const daysWorking = (workEnd - start) / DAY;
    const daysInYear = (new Date(Date.UTC(year + 1, 0, 1)) - new Date(Date.UTC(year, 0, 1))) / DAY;
    return Math.max(0, p.income * Math.pow(1 + p.growth / 100, year - currentYear)) *
      daysWorking / daysInYear;
  }

  function build({ person: p, socialSecurity: ss, input, asOfDate, endDate, addYears,
                   benefitForYear, earningsLimitsForYear }) {
    const empty = {
      months: [], years: [], graceYear: null, creditedMonths: 0,
      totalWithheld: 0, fraIncreasePct: 0, fraMonth: null,
      originalReductionMonths: 0, adjustedReductionMonths: 0,
      originalClaimFactor: ss?.claimFactor ?? 1, adjustedClaimFactor: ss?.claimFactor ?? 1
    };
    if (!ss?.enabled) return empty;

    const claimMonth = entitlementMonth(ss);
    const fraMonth = fraMonthForPerson(p, ss, addYears);
    const rules = p.ssRules || {};
    const currentYear = asOfDate.getUTCFullYear();
    const customYear = rules.overrideYear || claimMonth.getUTCFullYear();
    const originalFactor = ss.claimFactor;
    const originalReductionMonths = Math.max(0, Math.round(
      (ss.fullRetirementAge - ss.claimAge) * 12
    ));
    const output = { ...empty, fraMonth, originalReductionMonths,
      adjustedReductionMonths: originalReductionMonths,
      originalClaimFactor: originalFactor, adjustedClaimFactor: originalFactor };
    let graceYear = null;
    let creditedMonths = 0;
    let totalWithheld = 0;

    for (let year = claimMonth.getUTCFullYear(); year <= endDate.getUTCFullYear(); year += 1) {
      const monthData = [];
      for (let month = 0; month < 12; month += 1) {
        const date = new Date(Date.UTC(year, month, 1));
        const eligible = date >= claimMonth && date < nextMonth(endDate);
        const beforeFRA = date < fraMonth;
        let wages = projectedWagesInMonth(p, year, month, currentYear, addYears);
        if (year === customYear && rules.wages?.[month] != null) {
          wages = Math.max(0, Number(rules.wages[month]) || 0);
        }
        const substantialSelfEmployment = year === customYear && !!rules.substantial?.[month];
        monthData.push({ date, year, month, eligible, beforeFRA, wages,
          substantialSelfEmployment, nonService: false, gross: 0, withheld: 0, paid: 0 });
      }
      const attainingFRA = fraMonth.getUTCFullYear() === year;
      const limit = earningsLimitsForYear(year)[attainingFRA ? 'attainingFRA' : 'underFRA'];
      const testEarnings = monthData.reduce((sum, month) =>
        sum + (!attainingFRA || month.beforeFRA ? month.wages : 0), 0);
      const annualWithholding = Math.max(0, (testEarnings - limit) / (attainingFRA ? 3 : 2));
      const monthlyLimit = limit / 12;
      for (const month of monthData) {
        month.nonService = month.eligible && month.beforeFRA &&
          month.wages <= monthlyLimit && !month.substantialSelfEmployment;
      }

      // The first year with a non-service month after entitlement is the
      // initial grace year, which is not necessarily the claim year.
      const applyGrace = !!rules.monthlyRule && graceYear == null &&
        monthData.some(month => month.nonService);
      if (applyGrace) graceYear = year;

      // SSA charges work deductions to the earliest payable months of the
      // same calendar year, never across years. In the grace year, qualifying
      // non-service months are protected even when total wages exceed the
      // annual threshold.
      let remaining = annualWithholding;
      let yearWithheld = 0;
      let yearCredited = 0;
      for (const month of monthData) {
        if (!month.eligible || !month.beforeFRA) continue;
        month.gross = Math.max(0, benefitForYear(ss, year) / 12);
        if (!(applyGrace && month.nonService)) {
          month.withheld = Math.min(month.gross, remaining);
          remaining = Math.max(0, remaining - month.withheld);
        }
        month.paid = Math.max(0, month.gross - month.withheld);
        if (month.withheld > 0.000001) {
          creditedMonths += 1;
          yearCredited += 1;
        }
        yearWithheld += month.withheld;
      }

      // Crediting full or partially withheld months removes them from the
      // original early-claim reduction factor beginning in the FRA month.
      const adjustedMonths = Math.max(0, originalReductionMonths - creditedMonths);
      const adjustedFactor = (rules.fraAdjustment && originalReductionMonths > 0)
        ? Base.socialSecurityClaimFactor(
          ss.fullRetirementAge - adjustedMonths / 12, ss.fullRetirementAge
        ) : originalFactor;
      for (const month of monthData) {
        if (!month.eligible || month.beforeFRA) continue;
        month.gross = Math.max(0, benefitForYear(ss, year) / 12) *
          (originalFactor > 0 ? adjustedFactor / originalFactor : 1);
        month.paid = month.gross;
      }

      output.years.push({
        year, testEarnings, limit, annualWithholding, yearWithheld,
        yearCredited, graceYearApplied: applyGrace, attainingFRA
      });
      output.months.push(...monthData.filter(month => month.eligible && month.date <= endDate));
      totalWithheld += yearWithheld;
    }

    output.graceYear = graceYear;
    output.creditedMonths = creditedMonths;
    output.totalWithheld = totalWithheld;
    output.adjustedReductionMonths = Math.max(0, originalReductionMonths - creditedMonths);
    output.adjustedClaimFactor = rules.fraAdjustment && originalReductionMonths > 0
      ? Base.socialSecurityClaimFactor(
        ss.fullRetirementAge - output.adjustedReductionMonths / 12, ss.fullRetirementAge
      ) : originalFactor;
    output.fraIncreasePct = originalFactor > 0
      ? Math.max(0, (output.adjustedClaimFactor / originalFactor - 1) * 100) : 0;
    return output;
  }

  function paidBetween(schedule, start, end) {
    if (!schedule?.months?.length || end <= start) return 0;
    let paid = 0;
    for (const month of schedule.months) {
      if (month.date >= end) break;
      if (month.date >= start) paid += month.paid;
    }
    return paid;
  }

  root.SsaBenefitSchedule = Object.freeze({
    build, paidBetween, entitlementMonth, fraMonthForPerson
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
