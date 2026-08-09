(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RetirementModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RULES_BASE_YEAR = 2026;
  const SSA_AWI_GROWTH = 0.041565236170168385; // 2014-2024 CAGR
  const IRS_DEFERRAL_GROWTH = 0.03131030647754507; // 2016-2026 CAGR
  const IRS_CATCHUP_GROWTH = 0.029186008964760646;
  const IRS_OVERALL_GROWTH = 0.031111576229459592;
  const IRS_COMP_GROWTH = 0.031111576229459592;

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
    otherRetirementIncome: 0,
    socialSecurityEnabled: true,
    socialSecurityClaimAge: 67,
    socialSecurityCareerStartAge: 22,
    preRetirementReturnPct: 7,
    retirementReturnPct: 5,
    inflationPct: 2.5
  });

  const AWI_HISTORY = Object.freeze({
    1982: 14531.34, 1983: 15239.24, 1984: 16135.07, 1985: 16822.51,
    1986: 17321.82, 1987: 18426.51, 1988: 19334.04, 1989: 20099.55,
    1990: 21027.98, 1991: 21811.60, 1992: 22935.42, 1993: 23132.67,
    1994: 23753.53, 1995: 24705.66, 1996: 25913.90, 1997: 27426.00,
    1998: 28861.44, 1999: 30469.84, 2000: 32154.82, 2001: 32921.92,
    2002: 33252.09, 2003: 34064.95, 2004: 35648.55, 2005: 36952.94,
    2006: 38651.41, 2007: 40405.48, 2008: 41334.97, 2009: 40711.61,
    2010: 41673.83, 2011: 42979.61, 2012: 44321.67, 2013: 44888.16,
    2014: 46481.52, 2015: 48098.63, 2016: 48642.15, 2017: 50321.89,
    2018: 52145.80, 2019: 54099.99, 2020: 55628.60, 2021: 60575.07,
    2022: 63795.13, 2023: 66621.80, 2024: 69846.57
  });

  const SSA_TAXABLE_MAX_HISTORY = Object.freeze({
    1982: 32400, 1983: 35700, 1984: 37800, 1985: 39600, 1986: 42000,
    1987: 43800, 1988: 45000, 1989: 48000, 1990: 51300, 1991: 53400,
    1992: 55500, 1993: 57600, 1994: 60600, 1995: 61200, 1996: 62700,
    1997: 65400, 1998: 68400, 1999: 72600, 2000: 76200, 2001: 80400,
    2002: 84900, 2003: 87000, 2004: 87900, 2005: 90000, 2006: 94200,
    2007: 97500, 2008: 102000, 2009: 106800, 2010: 106800, 2011: 106800,
    2012: 110100, 2013: 113700, 2014: 117000, 2015: 118500, 2016: 118500,
    2017: 127200, 2018: 128400, 2019: 132900, 2020: 137700, 2021: 142800,
    2022: 147000, 2023: 160200, 2024: 168600, 2025: 176100, 2026: 184500
  });

  const PIA_BEND_POINTS = Object.freeze({
    2016: [856, 5157], 2017: [885, 5336], 2018: [895, 5397],
    2019: [926, 5583], 2020: [960, 5785], 2021: [996, 6002],
    2022: [1024, 6172], 2023: [1115, 6721], 2024: [1174, 7078],
    2025: [1226, 7391], 2026: [1286, 7749]
  });

  const IRS_LIMIT_HISTORY = Object.freeze({
    2016: { deferral: 18000, catchup: 6000, enhancedCatchup: 6000, overall: 53000, compensation: 265000 },
    2017: { deferral: 18000, catchup: 6000, enhancedCatchup: 6000, overall: 54000, compensation: 270000 },
    2018: { deferral: 18500, catchup: 6000, enhancedCatchup: 6000, overall: 55000, compensation: 275000 },
    2019: { deferral: 19000, catchup: 6000, enhancedCatchup: 6000, overall: 56000, compensation: 280000 },
    2020: { deferral: 19500, catchup: 6500, enhancedCatchup: 6500, overall: 57000, compensation: 285000 },
    2021: { deferral: 19500, catchup: 6500, enhancedCatchup: 6500, overall: 58000, compensation: 290000 },
    2022: { deferral: 20500, catchup: 6500, enhancedCatchup: 6500, overall: 61000, compensation: 305000 },
    2023: { deferral: 22500, catchup: 7500, enhancedCatchup: 7500, overall: 66000, compensation: 330000 },
    2024: { deferral: 23000, catchup: 7500, enhancedCatchup: 7500, overall: 69000, compensation: 345000 },
    2025: { deferral: 23500, catchup: 7500, enhancedCatchup: 11250, overall: 70000, compensation: 350000 },
    2026: { deferral: 24500, catchup: 8000, enhancedCatchup: 11250, overall: 72000, compensation: 360000 }
  });

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const number = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const roundStep = (value, step) => Math.max(step, Math.round(value / step) * step);

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
      socialSecurityEnabled: Boolean(merged.socialSecurityEnabled),
      socialSecurityClaimAge: clamp(number(merged.socialSecurityClaimAge, DEFAULTS.socialSecurityClaimAge), 62, 70),
      socialSecurityCareerStartAge: clamp(number(merged.socialSecurityCareerStartAge, DEFAULTS.socialSecurityCareerStartAge), 14, 40),
      preRetirementReturnPct: clamp(number(merged.preRetirementReturnPct), -50, 50),
      retirementReturnPct: clamp(number(merged.retirementReturnPct), -50, 50),
      inflationPct: clamp(number(merged.inflationPct), -10, 25)
    };
  }

  function validate(input) {
    const errors = [];
    if (input.retirementAge <= input.currentAge) errors.push('Retirement age must be greater than current age.');
    if (input.planThroughAge <= input.retirementAge) errors.push('Plan-through age must be greater than retirement age.');
    if (input.currentIncome <= 0) errors.push('Annual salary must be greater than $0.');
    if (input.autoIncreaseEnabled && input.maxEmployeeContributionPct < input.employeeContributionPct) {
      errors.push('Maximum contribution cannot be below your starting contribution rate.');
    }
    if (input.socialSecurityEnabled && input.socialSecurityCareerStartAge >= input.retirementAge) {
      errors.push('Social Security career start age must be below retirement age.');
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

  function averageWageIndexForYear(year) {
    if (AWI_HISTORY[year]) return AWI_HISTORY[year];
    if (year > 2024) return AWI_HISTORY[2024] * Math.pow(1 + SSA_AWI_GROWTH, year - 2024);
    return AWI_HISTORY[1982] / Math.pow(1 + SSA_AWI_GROWTH, 1982 - year);
  }

  function ssaTaxableMaxForYear(year) {
    if (SSA_TAXABLE_MAX_HISTORY[year]) return SSA_TAXABLE_MAX_HISTORY[year];
    if (year > RULES_BASE_YEAR) {
      return roundStep(SSA_TAXABLE_MAX_HISTORY[RULES_BASE_YEAR] * Math.pow(1 + SSA_AWI_GROWTH, year - RULES_BASE_YEAR), 300);
    }
    return roundStep(SSA_TAXABLE_MAX_HISTORY[1982] / Math.pow(1 + SSA_AWI_GROWTH, 1982 - year), 300);
  }

  function bendPointsForEligibilityYear(year) {
    if (PIA_BEND_POINTS[year]) return PIA_BEND_POINTS[year];
    const anchorYear = year > RULES_BASE_YEAR ? RULES_BASE_YEAR : 2016;
    const anchor = PIA_BEND_POINTS[anchorYear];
    const factor = Math.pow(1 + SSA_AWI_GROWTH, year - anchorYear);
    return [Math.max(1, Math.round(anchor[0] * factor)), Math.max(2, Math.round(anchor[1] * factor))];
  }

  function irsLimitsForYear(year) {
    if (IRS_LIMIT_HISTORY[year]) return { ...IRS_LIMIT_HISTORY[year], year, estimated: false };
    if (year < 2016) {
      const years = 2016 - year;
      return {
        year,
        estimated: true,
        deferral: roundStep(18000 / Math.pow(1 + IRS_DEFERRAL_GROWTH, years), 500),
        catchup: roundStep(6000 / Math.pow(1 + IRS_CATCHUP_GROWTH, years), 500),
        enhancedCatchup: roundStep(6000 / Math.pow(1 + IRS_CATCHUP_GROWTH, years), 250),
        overall: roundStep(53000 / Math.pow(1 + IRS_OVERALL_GROWTH, years), 1000),
        compensation: roundStep(265000 / Math.pow(1 + IRS_COMP_GROWTH, years), 5000)
      };
    }
    const years = year - RULES_BASE_YEAR;
    return {
      year,
      estimated: true,
      deferral: roundStep(24500 * Math.pow(1 + IRS_DEFERRAL_GROWTH, years), 500),
      catchup: roundStep(8000 * Math.pow(1 + IRS_CATCHUP_GROWTH, years), 500),
      enhancedCatchup: roundStep(11250 * Math.pow(1 + IRS_CATCHUP_GROWTH, years), 250),
      overall: roundStep(72000 * Math.pow(1 + IRS_OVERALL_GROWTH, years), 1000),
      compensation: roundStep(360000 * Math.pow(1 + IRS_COMP_GROWTH, years), 5000)
    };
  }

  function fullRetirementAgeForBirthYear(birthYear) {
    if (birthYear <= 1937) return 65;
    if (birthYear <= 1942) return 65 + ((birthYear - 1937) * 2) / 12;
    if (birthYear <= 1954) return 66;
    if (birthYear <= 1959) return 66 + ((birthYear - 1954) * 2) / 12;
    return 67;
  }

  function socialSecurityClaimFactor(claimAge, fullRetirementAge) {
    const claim = clamp(number(claimAge), 62, 70);
    if (claim < fullRetirementAge) {
      const monthsEarly = Math.max(0, Math.round((fullRetirementAge - claim) * 12));
      const first36 = Math.min(monthsEarly, 36);
      const extra = Math.max(monthsEarly - 36, 0);
      const reduction = first36 * (5 / 9 / 100) + extra * (5 / 12 / 100);
      return Math.max(0, 1 - reduction);
    }
    const monthsDelayed = Math.min(Math.max(0, Math.round((claim - fullRetirementAge) * 12)), Math.round((70 - fullRetirementAge) * 12));
    return 1 + monthsDelayed * (0.08 / 12);
  }

  function salaryForYear(input, year) {
    const growth = input.salaryGrowthPct / 100;
    return Math.max(0, input.currentIncome * Math.pow(1 + growth, year - RULES_BASE_YEAR));
  }

  function estimateSocialSecurity(rawInput) {
    const input = normalize(rawInput);
    if (!input.socialSecurityEnabled) {
      return {
        enabled: false,
        annualBenefitReal: 0,
        annualBenefitNominalAtClaim: 0,
        monthlyBenefitReal: 0,
        monthlyBenefitNominalAtClaim: 0,
        claimAge: input.socialSecurityClaimAge,
        fullRetirementAge: null,
        claimFactor: 0,
        aime: 0,
        piaAtEligibility: 0,
        eligibilityYear: null,
        claimYear: null,
        taxableMaxAtClaim: null,
        bendPoints: [0, 0],
        earningsYearsModeled: 0
      };
    }

    const workYears = Math.max(0, Math.round(input.retirementAge - input.currentAge));
    const birthYear = Math.round(RULES_BASE_YEAR - input.currentAge);
    const careerStartYear = birthYear + Math.round(input.socialSecurityCareerStartAge);
    const stopWorkYear = RULES_BASE_YEAR + workYears - 1;
    const indexingYear = birthYear + 60;
    const eligibilityYear = birthYear + 62;
    const claimYear = birthYear + Math.round(input.socialSecurityClaimAge);
    const indexingAwi = averageWageIndexForYear(indexingYear);
    const indexedEarnings = [];

    for (let year = careerStartYear; year <= stopWorkYear; year += 1) {
      const earnings = Math.min(salaryForYear(input, year), ssaTaxableMaxForYear(year));
      const indexed = year < indexingYear
        ? earnings * (indexingAwi / averageWageIndexForYear(year))
        : earnings;
      indexedEarnings.push(Math.max(indexed, 0));
    }

    indexedEarnings.sort((a, b) => b - a);
    const top35 = indexedEarnings.slice(0, 35);
    while (top35.length < 35) top35.push(0);
    const aime = Math.floor(top35.reduce((sum, value) => sum + value, 0) / 420);
    const bendPoints = bendPointsForEligibilityYear(eligibilityYear);
    const first = Math.min(aime, bendPoints[0]);
    const second = Math.min(Math.max(aime - bendPoints[0], 0), bendPoints[1] - bendPoints[0]);
    const third = Math.max(aime - bendPoints[1], 0);
    const piaRaw = first * 0.90 + second * 0.32 + third * 0.15;
    const piaAtEligibility = Math.floor(piaRaw * 10) / 10;
    const fullRetirementAge = fullRetirementAgeForBirthYear(birthYear);
    const claimFactor = socialSecurityClaimFactor(input.socialSecurityClaimAge, fullRetirementAge);
    const colaYears = Math.max(claimYear - eligibilityYear, 0);
    const cola = input.inflationPct / 100;
    const piaAtClaim = piaAtEligibility * Math.pow(1 + cola, colaYears);
    const monthlyBenefitNominalAtClaim = piaAtClaim * claimFactor;
    const yearsToClaim = Math.max(claimYear - RULES_BASE_YEAR, 0);
    const monthlyBenefitReal = monthlyBenefitNominalAtClaim / Math.pow(1 + cola, yearsToClaim);

    return {
      enabled: true,
      annualBenefitReal: monthlyBenefitReal * 12,
      annualBenefitNominalAtClaim: monthlyBenefitNominalAtClaim * 12,
      monthlyBenefitReal,
      monthlyBenefitNominalAtClaim,
      claimAge: input.socialSecurityClaimAge,
      fullRetirementAge,
      claimFactor,
      aime,
      piaAtEligibility,
      eligibilityYear,
      claimYear,
      taxableMaxAtClaim: ssaTaxableMaxForYear(claimYear),
      bendPoints,
      earningsYearsModeled: indexedEarnings.length,
      birthYear,
      careerStartYear,
      stopWorkYear,
      estimatedAwiGrowth: SSA_AWI_GROWTH
    };
  }

  function contributionLimitsForEmployee(year, age) {
    const limits = irsLimitsForYear(year);
    const catchup = age >= 60 && age <= 63
      ? limits.enhancedCatchup
      : age >= 50 ? limits.catchup : 0;
    return {
      ...limits,
      catchupAllowed: catchup,
      employeeDeferralMax: limits.deferral + catchup
    };
  }

  function apply401kLimits({ salary, employeeRate, matchRate, matchCap, year, age }) {
    const limits = contributionLimitsForEmployee(year, age);
    const desiredEmployeeContribution = Math.max(0, salary * Math.max(employeeRate, 0));
    const employeeContribution = Math.min(desiredEmployeeContribution, limits.employeeDeferralMax, salary);
    const baseEmployeeContribution = Math.min(employeeContribution, limits.deferral);
    const catchupContribution = Math.max(employeeContribution - baseEmployeeContribution, 0);
    const effectiveEmployeeRate = salary > 0 ? employeeContribution / salary : 0;
    const eligibleMatchCompensation = Math.min(salary, limits.compensation);
    const desiredEmployerContribution = eligibleMatchCompensation
      * employerMatchEffectiveRate(effectiveEmployeeRate, matchRate, matchCap);
    const nonCatchupOverallCap = Math.min(limits.overall, salary);
    const employerContribution = Math.min(
      Math.max(desiredEmployerContribution, 0),
      Math.max(nonCatchupOverallCap - baseEmployeeContribution, 0)
    );

    return {
      limits,
      desiredEmployeeContribution,
      employeeContribution,
      baseEmployeeContribution,
      catchupContribution,
      effectiveEmployeeRate,
      desiredEmployerContribution,
      employerContribution,
      employeeWasCapped: desiredEmployeeContribution > employeeContribution + 0.01,
      employerWasCapped: desiredEmployerContribution > employerContribution + 0.01
    };
  }

  function requiredNestEggForRetirement(input, socialSecurity, retirementYears, realRetirementReturn) {
    let presentValue = 0;
    for (let year = 1; year <= retirementYears; year += 1) {
      const ageAtYearEnd = input.retirementAge + year;
      const ssIncome = socialSecurity.enabled && ageAtYearEnd >= socialSecurity.claimAge
        ? socialSecurity.annualBenefitReal
        : 0;
      const gap = Math.max(input.desiredSpending - input.otherRetirementIncome - ssIncome, 0);
      presentValue += gap / Math.pow(1 + realRetirementReturn, year);
    }
    return presentValue;
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
    const socialSecurity = estimateSocialSecurity(input);

    const timeline = [{
      age: input.currentAge,
      calendarYear: RULES_BASE_YEAR,
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
    const contributionCapEvents = [];

    for (let year = 0; year < workYears; year += 1) {
      const salary = input.currentIncome * Math.pow(1 + salaryGrowth, year);
      const plannedEmployeeRate = contributionRateForYear(input, year);
      const calendarYear = RULES_BASE_YEAR + year;
      const age = input.currentAge + year;
      const limited = apply401kLimits({
        salary,
        employeeRate: plannedEmployeeRate,
        matchRate,
        matchCap,
        year: calendarYear,
        age
      });
      const growth = balance * preReturn;

      balance += growth + limited.employeeContribution + limited.employerContribution;
      employeeContributions += limited.employeeContribution;
      employerContributions += limited.employerContribution;
      investmentGrowth += growth;

      if (limited.employeeWasCapped || limited.employerWasCapped) {
        contributionCapEvents.push({
          year: calendarYear,
          age,
          employeeWasCapped: limited.employeeWasCapped,
          employerWasCapped: limited.employerWasCapped,
          desiredEmployeeContribution: limited.desiredEmployeeContribution,
          employeeContribution: limited.employeeContribution,
          desiredEmployerContribution: limited.desiredEmployerContribution,
          employerContribution: limited.employerContribution,
          limits: limited.limits
        });
      }

      const yearsFromNow = year + 1;
      const inflationFactor = Math.pow(1 + inflation, yearsFromNow);
      timeline.push({
        age: input.currentAge + yearsFromNow,
        calendarYear,
        yearsFromNow,
        phase: yearsFromNow === workYears ? 'retirement-start' : 'working',
        nominalBalance: Math.max(balance, 0),
        realBalance: Math.max(balance, 0) / inflationFactor,
        employeeContribution: limited.employeeContribution,
        employerContribution: limited.employerContribution,
        plannedEmployeeRate,
        effectiveEmployeeRate: limited.effectiveEmployeeRate,
        salary,
        irsLimits: limited.limits,
        employeeWasCapped: limited.employeeWasCapped,
        employerWasCapped: limited.employerWasCapped
      });
    }

    const projectedNestEggNominal = Math.max(balance, 0);
    const retirementInflationFactor = Math.pow(1 + inflation, workYears);
    const projectedNestEggReal = projectedNestEggNominal / retirementInflationFactor;
    const realRetirementReturn = (1 + retirementReturn) / (1 + inflation) - 1;
    const requiredNestEggReal = requiredNestEggForRetirement(input, socialSecurity, retirementYears, realRetirementReturn);
    const requiredNestEggNominal = requiredNestEggReal * retirementInflationFactor;
    const sustainablePortfolioIncomeReal = annuityPayment(projectedNestEggReal, realRetirementReturn, retirementYears);
    const portfolioGapBeforeSocialSecurityReal = Math.max(input.desiredSpending - input.otherRetirementIncome, 0);
    const portfolioGapAfterSocialSecurityReal = Math.max(
      input.desiredSpending - input.otherRetirementIncome - socialSecurity.annualBenefitReal,
      0
    );
    const firstRetirementAge = input.retirementAge + 1;
    const firstYearSocialSecurityReal = socialSecurity.enabled && firstRetirementAge >= socialSecurity.claimAge
      ? socialSecurity.annualBenefitReal : 0;
    const spendingGapReal = Math.max(input.desiredSpending - input.otherRetirementIncome - firstYearSocialSecurityReal, 0);
    const sustainableTotalIncomeReal = sustainablePortfolioIncomeReal + input.otherRetirementIncome + socialSecurity.annualBenefitReal;
    const fundingRatio = requiredNestEggReal > 0 ? projectedNestEggReal / requiredNestEggReal : Infinity;
    const surplusReal = projectedNestEggReal - requiredNestEggReal;
    const onTrack = requiredNestEggReal <= 0 || projectedNestEggReal >= requiredNestEggReal;

    let retirementBalance = projectedNestEggNominal;
    let depletedAtAge = null;

    for (let year = 1; year <= retirementYears; year += 1) {
      const ageAtYearEnd = input.retirementAge + year;
      const ssIncomeReal = socialSecurity.enabled && ageAtYearEnd >= socialSecurity.claimAge
        ? socialSecurity.annualBenefitReal : 0;
      const withdrawalReal = Math.max(input.desiredSpending - input.otherRetirementIncome - ssIncomeReal, 0);
      const yearsFromNow = workYears + year;
      const withdrawal = withdrawalReal * Math.pow(1 + inflation, yearsFromNow);
      const growth = retirementBalance * retirementReturn;
      retirementBalance = retirementBalance + growth - withdrawal;
      if (retirementBalance <= 0) {
        retirementBalance = 0;
        if (depletedAtAge === null) depletedAtAge = ageAtYearEnd;
      }

      const inflationFactor = Math.pow(1 + inflation, yearsFromNow);
      timeline.push({
        age: ageAtYearEnd,
        calendarYear: RULES_BASE_YEAR + yearsFromNow - 1,
        yearsFromNow,
        phase: 'retired',
        nominalBalance: retirementBalance,
        realBalance: retirementBalance / inflationFactor,
        withdrawal,
        withdrawalReal,
        socialSecurityIncomeReal: ssIncomeReal,
        otherIncomeReal: input.otherRetirementIncome,
        growth
      });
    }

    const firstWorkingPoint = timeline[1] || timeline[0];
    const lastWorkingPoint = timeline[Math.max(workYears, 0)] || timeline[0];
    const startingPlannedEmployeeRate = contributionRateForYear(input, 0);
    const endingPlannedEmployeeRate = contributionRateForYear(input, Math.max(workYears - 1, 0));
    const startingEmployeeRate = firstWorkingPoint.salary > 0
      ? (firstWorkingPoint.employeeContribution || 0) / firstWorkingPoint.salary : 0;
    const endingEmployeeRate = lastWorkingPoint.salary > 0
      ? (lastWorkingPoint.employeeContribution || 0) / lastWorkingPoint.salary : 0;
    const startingMatchRate = firstWorkingPoint.salary > 0
      ? (firstWorkingPoint.employerContribution || 0) / firstWorkingPoint.salary : 0;
    const endingMatchRate = lastWorkingPoint.salary > 0
      ? (lastWorkingPoint.employerContribution || 0) / lastWorkingPoint.salary : 0;

    return {
      input,
      errors: [],
      rulesBaseYear: RULES_BASE_YEAR,
      workYears,
      retirementYears,
      realRetirementReturn,
      spendingGapReal,
      portfolioGapBeforeSocialSecurityReal,
      portfolioGapAfterSocialSecurityReal,
      socialSecurity,
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
      contributionCapEvents,
      firstContributionCapEvent: contributionCapEvents[0] || null,
      currentIrsLimits: contributionLimitsForEmployee(RULES_BASE_YEAR, input.currentAge),
      retirementYearIrsLimits: contributionLimitsForEmployee(RULES_BASE_YEAR + Math.max(workYears - 1, 0), input.retirementAge - 1),
      startingPlannedEmployeeRate,
      endingPlannedEmployeeRate,
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

    const upperRate = 1;
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
    const currentMonthlyEmployeeContribution = (result.timeline[1]?.employeeContribution || 0) / 12;
    let targetMonthlyEmployeeContribution = null;
    if (requiredFlatEmployeeRate != null) {
      const target = simulateCore({
        ...result.input,
        employeeContributionPct: requiredFlatEmployeeRate * 100,
        autoIncreaseEnabled: false,
        maxEmployeeContributionPct: requiredFlatEmployeeRate * 100
      });
      targetMonthlyEmployeeContribution = (target.timeline[1]?.employeeContribution || 0) / 12;
    }

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
    RULES_BASE_YEAR,
    DEFAULTS,
    RULE_ASSUMPTIONS: Object.freeze({
      ssaAwiGrowth: SSA_AWI_GROWTH,
      irsDeferralGrowth: IRS_DEFERRAL_GROWTH,
      irsCatchupGrowth: IRS_CATCHUP_GROWTH,
      irsOverallGrowth: IRS_OVERALL_GROWTH
    }),
    normalize,
    validate,
    annuityPresentValue,
    annuityPayment,
    employerMatchEffectiveRate,
    contributionRateForYear,
    averageWageIndexForYear,
    ssaTaxableMaxForYear,
    bendPointsForEligibilityYear,
    irsLimitsForYear,
    contributionLimitsForEmployee,
    fullRetirementAgeForBirthYear,
    socialSecurityClaimFactor,
    estimateSocialSecurity,
    apply401kLimits,
    simulateCore,
    findRequiredFlatEmployeeRate,
    analyze
  };
});