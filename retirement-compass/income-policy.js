(function (root) {
  'use strict';

  const Existing = root.HouseholdModel;
  const Base = root.RetirementModel;
  if (!Existing || !Base) return;

  const DAY = 86400000;
  const $ = (id) => typeof document !== 'undefined' ? document.getElementById(id) : null;
  const clamp = (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max);

  const originalNormalize = Existing.normalize.bind(Existing);
  const originalEstimateTrs = Existing.estimateAlabamaTrs.bind(Existing);

  // 2026 Trustees Report intermediate AWI projections. After 2035, use the
  // report's ultimate nominal wage-growth assumption instead of extending a
  // recent historical CAGR forever.
  const SSA_AWI_PROJECTED = Object.freeze({
    2025: 72025.07,
    2026: 75246.70,
    2027: 78286.92,
    2028: 81537.43,
    2029: 85047.82,
    2030: 88895.99,
    2031: 92915.31,
    2032: 96989.47,
    2033: 101085.63,
    2034: 105045.59,
    2035: 109064.86
  });
  const SSA_ULTIMATE_AWI_GROWTH = 0.0357;
  const SSA_ULTIMATE_COLA = 0.024;
  const SSA_COLA_PROJECTED = Object.freeze({
    2025: 0.028,
    2026: 0.027,
    2027: 0.024,
    2028: 0.024,
    2029: 0.024,
    2030: 0.024,
    2031: 0.024,
    2032: 0.024,
    2033: 0.024,
    2034: 0.024,
    2035: 0.024
  });

  const DEFAULTS = Object.freeze({
    ...Existing.DEFAULTS,
    employerMatchTier2Enabled: false,
    employerMatchTier2RatePct: 50,
    employerMatchTier2AdditionalPct: 2
  });

  function domFallback(raw, id, fallback) {
    if (raw && Object.prototype.hasOwnProperty.call(raw, id)) return raw[id];
    const el = $(id);
    if (!el) return fallback;
    return el.type === 'checkbox' ? el.checked : el.value;
  }

  function normalize(raw = {}) {
    const base = originalNormalize(raw);
    return {
      ...base,
      employerMatchTier2Enabled: Boolean(domFallback(raw, 'employerMatchTier2Enabled', DEFAULTS.employerMatchTier2Enabled)),
      employerMatchTier2RatePct: clamp(domFallback(raw, 'employerMatchTier2RatePct', DEFAULTS.employerMatchTier2RatePct), 0, 500),
      employerMatchTier2AdditionalPct: clamp(domFallback(raw, 'employerMatchTier2AdditionalPct', DEFAULTS.employerMatchTier2AdditionalPct), 0, 100)
    };
  }

  function parseDate(value) { return Existing.parseDate(value); }
  function addYears(date, value) { return Existing.addYears(date, value); }
  function yearsBetween(a, b) { return Existing.yearsBetween(a, b); }
  function ageOnDate(birth, date) { return Existing.ageOnDate(birth, date); }
  function maxDate(...dates) { return new Date(Math.max(...dates.map((date) => +date))); }
  function minDate(...dates) { return new Date(Math.min(...dates.map((date) => +date))); }
  function days(a, b) { return Math.max(0, (b - a) / DAY); }

  function yearFraction(a, b) {
    if (!(a instanceof Date) || !(b instanceof Date) || b <= a) return 0;
    const year = a.getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    return days(a, b) / Math.max(days(start, end), 1);
  }

  function overlap(a, b, c, d) {
    const start = maxDate(a, c);
    const end = minDate(b, d);
    return end > start ? yearFraction(start, end) : 0;
  }

  function ageAtYearEnd(birth, year) {
    return Math.floor(ageOnDate(birth, new Date(Date.UTC(year, 11, 31, 23, 59, 59))));
  }

  function ssaBirthYear(birth) {
    return birth.getUTCMonth() === 0 && birth.getUTCDate() === 1
      ? birth.getUTCFullYear() - 1
      : birth.getUTCFullYear();
  }

  function projectedAwi(year) {
    if (year <= 2024) return Base.averageWageIndexForYear(year);
    if (SSA_AWI_PROJECTED[year]) return SSA_AWI_PROJECTED[year];
    return SSA_AWI_PROJECTED[2035] * Math.pow(1 + SSA_ULTIMATE_AWI_GROWTH, year - 2035);
  }

  function projectedTaxableMax(year) {
    if (year <= 2026) return Base.ssaTaxableMaxForYear(year);
    const raw = 184500 * projectedAwi(year - 2) / projectedAwi(2024);
    return Math.max(300, Math.round(raw / 300) * 300);
  }

  function projectedBendPoints(eligibilityYear) {
    if (eligibilityYear <= 2026) return Base.bendPointsForEligibilityYear(eligibilityYear);
    // SSA's bend points for a year of first eligibility are tied to the AWI
    // two years earlier. 2026 bend points use the 2024 AWI.
    const factor = projectedAwi(eligibilityYear - 2) / projectedAwi(2024);
    return [
      Math.max(1, Math.round(1286 * factor)),
      Math.max(2, Math.round(7749 * factor))
    ];
  }

  function ssaColaForYear(year) {
    return SSA_COLA_PROJECTED[year] ?? SSA_ULTIMATE_COLA;
  }

  function ssaColaFactor(fromYear, toYear) {
    let factor = 1;
    for (let year = fromYear; year < toYear; year += 1) factor *= 1 + ssaColaForYear(year);
    return factor;
  }

  function salaryForYear(p, year, currentYear) {
    return Math.max(0, p.income * Math.pow(1 + p.growth / 100, year - currentYear));
  }

  function person(input, spouse = false) {
    if (spouse) {
      return {
        name: 'Spouse', birth: parseDate(input.spouseBirthDate), retirementAge: input.spouseRetirementAge,
        savings: input.spouseCurrentSavings, income: input.spouseCurrentIncome, rate: input.spouseEmployeeContributionPct,
        growth: input.spouseSalaryGrowthPct, auto: input.spouseAutoIncreaseEnabled, step: input.spouseAutoIncreasePctPoints,
        maxRate: input.spouseMaxEmployeeContributionPct, matchRate: 0, matchCap: 0, matchTier2Enabled: false,
        matchTier2Rate: 0, matchTier2Additional: 0, planType: input.spouseVoluntaryPlanType,
        ss: input.spouseSocialSecurityEnabled, ssClaim: input.spouseSocialSecurityClaimAge,
        careerStart: input.spouseSocialSecurityCareerStartAge
      };
    }
    return {
      name: 'You', birth: parseDate(input.birthDate), retirementAge: input.retirementAge,
      savings: input.currentSavings, income: input.currentIncome, rate: input.employeeContributionPct,
      growth: input.salaryGrowthPct, auto: input.autoIncreaseEnabled, step: input.autoIncreasePctPoints,
      maxRate: input.maxEmployeeContributionPct, matchRate: input.employerMatchRatePct / 100,
      matchCap: input.employerMatchCapPct / 100, matchTier2Enabled: input.employerMatchTier2Enabled,
      matchTier2Rate: input.employerMatchTier2RatePct / 100,
      matchTier2Additional: input.employerMatchTier2AdditionalPct / 100, planType: '401k',
      ss: input.socialSecurityEnabled, ssClaim: input.socialSecurityClaimAge,
      careerStart: input.socialSecurityCareerStartAge
    };
  }

  function employerMatchEffectiveRate(employeeRate, p) {
    const rate = Math.max(Number(employeeRate) || 0, 0);
    const firstTier = Math.min(rate, Math.max(p.matchCap, 0)) * Math.max(p.matchRate, 0);
    if (!p.matchTier2Enabled) return firstTier;
    const secondEligible = Math.min(
      Math.max(rate - Math.max(p.matchCap, 0), 0),
      Math.max(p.matchTier2Additional, 0)
    );
    return firstTier + secondEligible * Math.max(p.matchTier2Rate, 0);
  }

  function estimateSocialSecurity(p, input, asOfDate) {
    const claimDate = addYears(p.birth, p.ssClaim);
    if (!p.ss) {
      return {
        enabled: false, annualBenefitReal: 0, monthlyBenefitReal: 0,
        annualBenefitNominalAtClaim: 0, monthlyBenefitNominalAtClaim: 0,
        claimDate, claimAge: p.ssClaim, earningsYearsModeled: 0
      };
    }

    const birthYear = ssaBirthYear(p.birth);
    const currentYear = asOfDate.getUTCFullYear();
    const retirementDate = addYears(p.birth, p.retirementAge);
    const careerStartYear = p.birth.getUTCFullYear() + Math.round(p.careerStart);
    const stopWorkYear = retirementDate.getUTCFullYear();
    const indexingYear = birthYear + 60;
    const eligibilityYear = birthYear + 62;
    const claimYear = claimDate.getUTCFullYear();
    const indexingAwi = projectedAwi(indexingYear);
    const indexedEarnings = [];

    for (let year = careerStartYear; year <= stopWorkYear; year += 1) {
      let salary = salaryForYear(p, year, currentYear);
      if (year === stopWorkYear) {
        const start = new Date(Date.UTC(year, 0, 1));
        const end = new Date(Date.UTC(year + 1, 0, 1));
        salary *= overlap(start, end, start, retirementDate);
      }
      const covered = Math.min(salary, projectedTaxableMax(year));
      const indexed = year < indexingYear ? covered * indexingAwi / projectedAwi(year) : covered;
      indexedEarnings.push(Math.max(indexed, 0));
    }

    indexedEarnings.sort((a, b) => b - a);
    const top35 = indexedEarnings.slice(0, 35);
    while (top35.length < 35) top35.push(0);

    const aime = Math.floor(top35.reduce((sum, value) => sum + value, 0) / 420);
    const bendPoints = projectedBendPoints(eligibilityYear);
    const first = Math.min(aime, bendPoints[0]);
    const second = Math.min(Math.max(aime - bendPoints[0], 0), bendPoints[1] - bendPoints[0]);
    const third = Math.max(aime - bendPoints[1], 0);
    const piaAtEligibility = Math.floor((first * 0.90 + second * 0.32 + third * 0.15) * 10) / 10;
    const fullRetirementAge = Base.fullRetirementAgeForBirthYear(birthYear);
    const claimFactor = Base.socialSecurityClaimFactor(p.ssClaim, fullRetirementAge);
    const piaAtClaim = piaAtEligibility * ssaColaFactor(eligibilityYear, claimYear);
    const monthlyBenefitNominalAtClaim = piaAtClaim * claimFactor;
    const generalInflationFactor = Math.pow(
      1 + input.inflationPct / 100,
      Math.max(yearsBetween(asOfDate, claimDate), 0)
    );
    const monthlyBenefitReal = monthlyBenefitNominalAtClaim / Math.max(generalInflationFactor, 1e-12);

    return {
      enabled: true,
      annualBenefitReal: monthlyBenefitReal * 12,
      monthlyBenefitReal,
      annualBenefitNominalAtClaim: monthlyBenefitNominalAtClaim * 12,
      monthlyBenefitNominalAtClaim,
      claimAge: p.ssClaim,
      claimDate,
      claimYear,
      fullRetirementAge,
      claimFactor,
      aime,
      piaAtEligibility,
      bendPoints,
      eligibilityYear,
      indexingYear,
      careerStartYear,
      stopWorkYear,
      earningsYearsModeled: indexedEarnings.length,
      projectionMethod: '2026 Trustees intermediate AWI/COLA assumptions'
    };
  }

  function socialSecurityAnnualNominalForYear(ss, year) {
    if (!ss?.enabled || !Number.isFinite(ss.annualBenefitNominalAtClaim)) return 0;
    if (year <= ss.claimYear) return ss.annualBenefitNominalAtClaim;
    return ss.annualBenefitNominalAtClaim * ssaColaFactor(ss.claimYear, year);
  }

  function buildEvents(input, people, socialSecurity, trs) {
    const asOfDate = parseDate(input.asOfDate);
    let endDate = addYears(people[0].birth, input.planThroughAge);
    if (people[1]) endDate = maxDate(endDate, addYears(people[1].birth, input.planThroughAge));
    const dates = [asOfDate, endDate];
    for (let year = asOfDate.getUTCFullYear() + 1; year <= endDate.getUTCFullYear(); year += 1) {
      dates.push(new Date(Date.UTC(year, 0, 1)));
    }
    people.forEach((p, index) => {
      dates.push(addYears(p.birth, p.retirementAge));
      if (socialSecurity[index]?.enabled) dates.push(socialSecurity[index].claimDate);
    });
    if (trs?.eligible) dates.push(trs.pensionStart);
    return [...new Map(
      dates.filter((date) => date >= asOfDate && date <= endDate).map((date) => [+date, date])
    ).values()].sort((a, b) => a - b);
  }

  function analyze(raw = {}) {
    const input = normalize(raw);
    const errors = Existing.validate(input);
    if (errors.length) return { input, errors };

    const asOfDate = parseDate(input.asOfDate);
    const people = [person(input, false), ...(input.spouseEnabled ? [person(input, true)] : [])];
    const socialSecurity = people.map((p) => estimateSocialSecurity(p, input, asOfDate));
    const trs = originalEstimateTrs(input);
    const retirementDates = people.map((p) => addYears(p.birth, p.retirementAge));
    const firstRetirementDate = retirementDates.reduce((a, b) => minDate(a, b));
    const bothRetiredDate = retirementDates.reduce((a, b) => maxDate(a, b));
    const events = buildEvents(input, people, socialSecurity, trs);
    const inflation = input.inflationPct / 100;
    const yearToDate = {};
    const capEvents = [];

    let balance = people.reduce((sum, p) => sum + p.savings, 0);
    let depletionDate = null;
    let atFirstRetirement = null;
    let totalEmployee = 0;
    let totalEmployer = 0;
    let totalGrowth = 0;
    let totalWithdrawals = 0;
    let initialRetirementWithdrawalNominal = null;

    const timeline = [{
      date: asOfDate, yearsFromNow: 0, calendarYear: asOfDate.getUTCFullYear(),
      primaryAge: ageOnDate(people[0].birth, asOfDate),
      spouseAge: people[1] ? ageOnDate(people[1].birth, asOfDate) : null,
      nominalBalance: balance, realBalance: balance, contributions: 0,
      employeeContribution: 0, employerContribution: 0, withdrawal: 0,
      spending: 0, workingIncome: 0, ssIncome: 0, trsIncome: 0, otherIncome: 0,
      anyoneWorking: true
    }];
    const segments = [];

    function personState(p, index, start, end) {
      const retirementDate = retirementDates[index];
      const year = start.getUTCFullYear();
      const workEnd = minDate(end, retirementDate);
      const works = start < retirementDate && workEnd > start;
      const fraction = works ? yearFraction(start, workEnd) : 0;
      const annualSalary = salaryForYear(p, year, asOfDate.getUTCFullYear());
      const salary = annualSalary * fraction;
      const key = `${index}-${year}`;
      if (!yearToDate[key]) yearToDate[key] = { employee: 0, base: 0, employer: 0 };

      const yearIndex = Math.max(0, year - asOfDate.getUTCFullYear());
      const rate = p.auto
        ? Math.min(p.rate / 100 + p.step / 100 * yearIndex, p.maxRate / 100)
        : p.rate / 100;
      const limits = Base.contributionLimitsForEmployee(year, ageAtYearEnd(p.birth, year));
      const desiredEmployee = salary * rate;
      const employee = Math.min(
        desiredEmployee,
        Math.max(limits.employeeDeferralMax - yearToDate[key].employee, 0),
        salary
      );
      const baseEmployee = Math.min(employee, Math.max(limits.deferral - yearToDate[key].base, 0));

      let desiredEmployer = 0;
      let employer = 0;
      if (p.planType !== '457b') {
        const effectiveEmployeeRate = salary > 0 ? employee / salary : 0;
        const eligibleCompensation = Math.min(salary, limits.compensation);
        desiredEmployer = eligibleCompensation * employerMatchEffectiveRate(effectiveEmployeeRate, p);
        employer = Math.min(
          desiredEmployer,
          Math.max(limits.overall - yearToDate[key].base - yearToDate[key].employer, 0)
        );
      }

      yearToDate[key].employee += employee;
      yearToDate[key].base += baseEmployee;
      yearToDate[key].employer += employer;

      if (desiredEmployee > employee + 0.01 || desiredEmployer > employer + 0.01) {
        capEvents.push({
          person: p.name, year, age: ageAtYearEnd(p.birth, year),
          desiredEmployeeContribution: desiredEmployee, employeeContribution: employee,
          desiredEmployerContribution: desiredEmployer, employerContribution: employer,
          limits, planType: p.planType
        });
      }

      const spendingFraction = start >= firstRetirementDate
        ? fraction
        : overlap(start, workEnd, firstRetirementDate, workEnd);
      const share = fraction ? Math.min(spendingFraction / fraction, 1) : 0;
      const voluntaryAfterFirstRetirement = employee * share;
      const trsRate = index === 1 && input.spouseTrsEnabled
        ? (input.spouseTrsTier === '1' ? 0.075 : 0.062)
        : 0;
      const trsPay = annualSalary * spendingFraction * trsRate;
      const salaryAvailable = Math.max(0, annualSalary * spendingFraction - voluntaryAfterFirstRetirement - trsPay);
      return { works, employee, employer, salaryAvailable };
    }

    for (let index = 0; index < events.length - 1; index += 1) {
      const start = events[index];
      const end = events[index + 1];
      if (end <= start) continue;

      const segmentYears = yearsBetween(start, end);
      const states = people.map((p, pIndex) => personState(p, pIndex, start, end));
      const anyoneWorking = states.some((state) => state.works);
      const returnRate = (anyoneWorking ? input.preRetirementReturnPct : input.retirementReturnPct) / 100;
      const growthFactor = Math.pow(1 + returnRate, segmentYears);
      const growth = balance * (growthFactor - 1);
      balance += growth;
      totalGrowth += growth;

      const contributions = states.reduce((sum, state) => sum + state.employee + state.employer, 0);
      balance += contributions;
      totalEmployee += states.reduce((sum, state) => sum + state.employee, 0);
      totalEmployer += states.reduce((sum, state) => sum + state.employer, 0);

      let spending = 0, workingIncome = 0, ssIncome = 0, trsIncome = 0, otherIncome = 0, withdrawal = 0;

      if (end > firstRetirementDate) {
        const retirementStart = maxDate(start, firstRetirementDate);
        const fraction = yearFraction(retirementStart, end);
        const midpoint = new Date((+retirementStart + +end) / 2);
        const yearsFromToday = Math.max(yearsBetween(asOfDate, midpoint), 0);
        const generalInflationFactor = Math.pow(1 + inflation, yearsFromToday);

        spending = input.desiredSpending * generalInflationFactor * fraction;
        otherIncome = input.otherRetirementIncome * generalInflationFactor * fraction;
        workingIncome = states.reduce((sum, state) => sum + state.salaryAvailable, 0);

        people.forEach((p, pIndex) => {
          const ss = socialSecurity[pIndex];
          if (!ss?.enabled || end <= ss.claimDate) return;
          const benefitStart = maxDate(retirementStart, ss.claimDate);
          if (end <= benefitStart) return;
          const benefitFraction = yearFraction(benefitStart, end);
          const annualNominal = socialSecurityAnnualNominalForYear(ss, benefitStart.getUTCFullYear());
          ssIncome += annualNominal * benefitFraction;
        });

        if (trs?.eligible && end > trs.pensionStart) {
          const pensionStart = maxDate(retirementStart, trs.pensionStart);
          if (end > pensionStart) trsIncome += trs.annualBenefitNominal * yearFraction(pensionStart, end);
        }

        withdrawal = Math.max(spending - workingIncome - ssIncome - trsIncome - otherIncome, 0);
        if (initialRetirementWithdrawalNominal == null && fraction > 0) initialRetirementWithdrawalNominal = withdrawal / fraction;
        balance -= withdrawal;
        totalWithdrawals += withdrawal;
        if (balance <= 0) {
          balance = 0;
          if (!depletionDate) depletionDate = end;
        }
      }

      if (atFirstRetirement === null && +end === +firstRetirementDate) atFirstRetirement = balance;
      const inflationAtEnd = Math.pow(1 + inflation, Math.max(yearsBetween(asOfDate, end), 0));
      const point = {
        date: end, yearsFromNow: yearsBetween(asOfDate, end), calendarYear: end.getUTCFullYear(),
        primaryAge: ageOnDate(people[0].birth, end),
        spouseAge: people[1] ? ageOnDate(people[1].birth, end) : null,
        nominalBalance: balance, realBalance: balance / inflationAtEnd, contributions,
        employeeContribution: states.reduce((sum, state) => sum + state.employee, 0),
        employerContribution: states.reduce((sum, state) => sum + state.employer, 0),
        growth, withdrawal, spending, workingIncome, ssIncome, trsIncome, otherIncome, anyoneWorking
      };
      timeline.push(point);
      segments.push({ ...point, start, end, growthFactor });
    }

    if (atFirstRetirement === null) {
      const point = timeline.find((item) => item.date >= firstRetirementDate);
      atFirstRetirement = point ? point.nominalBalance : balance;
    }

    let requiredNestEggNominal = 0;
    const retirementSegments = segments.filter((segment) => segment.start >= firstRetirementDate);
    for (let index = retirementSegments.length - 1; index >= 0; index -= 1) {
      const segment = retirementSegments[index];
      requiredNestEggNominal = Math.max(
        0,
        (requiredNestEggNominal + segment.withdrawal - segment.contributions) / Math.max(segment.growthFactor, 1e-12)
      );
    }

    const firstInflationFactor = Math.pow(1 + inflation, Math.max(yearsBetween(asOfDate, firstRetirementDate), 0));
    const projectedNestEggReal = atFirstRetirement / firstInflationFactor;
    const requiredNestEggReal = requiredNestEggNominal / firstInflationFactor;
    const trsReal = trs?.eligible
      ? trs.annualBenefitNominal / Math.pow(1 + inflation, Math.max(yearsBetween(asOfDate, trs.pensionStart), 0))
      : 0;
    const stableRetirementIncomeReal = input.otherRetirementIncome
      + socialSecurity.reduce((sum, ss) => sum + (ss?.annualBenefitReal || 0), 0)
      + trsReal;
    const portfolioGapReal = Math.max(input.desiredSpending - stableRetirementIncomeReal, 0);
    const realRetirementReturn = (1 + input.retirementReturnPct / 100) / (1 + inflation) - 1;
    const endDate = events[events.length - 1];
    const endInflationFactor = Math.pow(1 + inflation, Math.max(yearsBetween(asOfDate, endDate), 0));

    return {
      input, errors: [], asOfDate, primary: people[0], spouse: people[1] || null,
      socialSecurity: socialSecurity[0],
      spouseSocialSecurity: socialSecurity[1] || { enabled: false, annualBenefitReal: 0, annualBenefitNominalAtClaim: 0 },
      trs, firstRetirementDate, bothRetiredDate, endDate,
      projectedNestEggNominal: atFirstRetirement, projectedNestEggReal,
      requiredNestEggNominal, requiredNestEggReal,
      fundingRatio: requiredNestEggNominal ? atFirstRetirement / requiredNestEggNominal : Infinity,
      surplusReal: projectedNestEggReal - requiredNestEggReal,
      surplusNominal: atFirstRetirement - requiredNestEggNominal,
      onTrack: !depletionDate, depletionDate,
      endingBalanceNominal: balance, endingBalanceReal: balance / endInflationFactor,
      employeeContributions: totalEmployee, employerContributions: totalEmployer,
      investmentGrowth: totalGrowth, totalWithdrawals,
      contributionCapEvents: capEvents, firstContributionCapEvent: capEvents[0] || null,
      stableRetirementIncomeReal, portfolioGapAfterAllIncomeReal: portfolioGapReal,
      spendingGapReal: portfolioGapReal,
      initialRetirementWithdrawalNominal: initialRetirementWithdrawalNominal || 0,
      initialRetirementWithdrawalReal: (initialRetirementWithdrawalNominal || 0) / firstInflationFactor,
      realRetirementReturn, timeline,
      currentIrsLimits: Base.contributionLimitsForEmployee(
        asOfDate.getUTCFullYear(), ageAtYearEnd(people[0].birth, asOfDate.getUTCFullYear())
      ),
      ssaProjectionAssumptions: {
        source: '2026 Trustees Report intermediate assumptions',
        ultimateAwiGrowth: SSA_ULTIMATE_AWI_GROWTH,
        ultimateCola: SSA_ULTIMATE_COLA
      }
    };
  }

  root.HouseholdModel = {
    ...Existing,
    DEFAULTS,
    normalize,
    analyze,
    projectedSocialSecurityAwi: projectedAwi,
    projectedSocialSecurityBendPoints: projectedBendPoints,
    projectedSocialSecurityCola: ssaColaForYear,
    __todayDollarInputPolicy: true,
    __ssa2026ProjectionPolicy: true,
    __tieredEmployerMatchPolicy: true
  };

  function installMatchTier2Ui() {
    if (typeof document === 'undefined' || $('employerMatchTier2Enabled')) return;
    const matchBox = document.querySelector('.match-box');
    if (!matchBox) return;

    const panel = document.createElement('div');
    panel.className = 'match-tier2-panel';
    panel.innerHTML = `
      <label class="switch-row match-tier2-toggle" for="employerMatchTier2Enabled">
        <span><strong>Add a second employer match tier</strong><small>For plans such as 100% of the first 3%, then 50% of the next 2%.</small></span>
        <span class="switch"><input id="employerMatchTier2Enabled" type="checkbox"><span aria-hidden="true"></span></span>
      </label>
      <div class="match-tier2-fields" id="employerMatchTier2Fields" hidden>
        <span>Then matches</span>
        <label class="inline-field"><input id="employerMatchTier2RatePct" type="number" min="0" max="500" step="1"><span>%</span></label>
        <span>of the next</span>
        <label class="inline-field"><input id="employerMatchTier2AdditionalPct" type="number" min="0" max="100" step="0.5"><span>%</span></label>
        <span>of salary I contribute.</span>
      </div>`;
    matchBox.insertAdjacentElement('afterend', panel);

    const style = document.createElement('style');
    style.id = 'matchTier2Style';
    style.textContent = `
      .match-tier2-panel{margin-top:8px;border:1px solid var(--line);border-radius:var(--radius-md);background:var(--surface-soft);overflow:hidden}
      .match-tier2-toggle{margin:0!important;padding:13px 15px!important}
      .match-tier2-fields{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:0 15px 14px;color:var(--muted);font-size:.82rem}
      .match-tier2-fields[hidden]{display:none!important}
      @media(max-width:520px){.match-tier2-fields{align-items:flex-start}.match-tier2-fields>span{padding-top:7px}}
    `;
    document.head.appendChild(style);

    const enabled = $('employerMatchTier2Enabled');
    const rate = $('employerMatchTier2RatePct');
    const additional = $('employerMatchTier2AdditionalPct');
    enabled.checked = DEFAULTS.employerMatchTier2Enabled;
    rate.value = DEFAULTS.employerMatchTier2RatePct;
    additional.value = DEFAULTS.employerMatchTier2AdditionalPct;

    function sync() { $('employerMatchTier2Fields').hidden = !enabled.checked; }
    sync();
    enabled.addEventListener('change', sync);

    $('resetButton')?.addEventListener('click', () => {
      setTimeout(() => {
        enabled.checked = DEFAULTS.employerMatchTier2Enabled;
        rate.value = DEFAULTS.employerMatchTier2RatePct;
        additional.value = DEFAULTS.employerMatchTier2AdditionalPct;
        sync();
        enabled.dispatchEvent(new Event('change', { bubbles: true }));
      }, 0);
    });
  }

  installMatchTier2Ui();

  if (typeof document !== 'undefined' && !document.querySelector('script[data-planner-accordion]')) {
    const script = document.createElement('script');
    script.src = 'section-accordion.js?v=20260810-0100';
    script.dataset.plannerAccordion = 'true';
    document.head.appendChild(script);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);