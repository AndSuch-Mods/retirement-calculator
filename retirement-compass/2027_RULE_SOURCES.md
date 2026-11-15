# Retirement Compass: 2027 rule update

Verified November 15, 2026. This file documents published limits and modeling assumptions; the calculator is a planning tool, not an IRS, SSA, or RSA benefit determination.

## IRS contribution limits

2027 statutory limits from [IRS Notice 2026-66](https://www.irs.gov/pub/irs-drop/n-26-66.pdf), PDF pages 1–2:

| Limit | 2026 | 2027 |
|---|---:|---:|
| 401(k)/403(b)/governmental 457(b) elective deferral | $24,500 | $25,500 |
| Regular catch-up for eligible ages 50+ | $8,000 | $8,500 |
| Enhanced catch-up for ages 60–63 | $11,250 | $11,750 |
| Defined-contribution annual additions before catch-up | $72,000 | $75,000 |
| Annual compensation limit | $360,000 | $375,000 |
| Prior-year FICA wage threshold for mandatory designated Roth catch-up | $150,000 | $155,000 |

2027 values are official and marked non-estimated in `model.js`. 2028+ limits are still projections, now anchored to 2027 rather than 2026. The separate `RULES_BASE_YEAR = 2026` is the standalone calculator's projection start, not the latest IRS publication year.

Roth catch-up treatment is **not** an account tax calculation; the threshold is reference data only. Plan-specific 403(b) 15-year and governmental 457(b) pre-retirement special catch-ups remain **unmodeled**.

## Social Security

SSA's [2027 COLA and indexed changes](https://www.ssa.gov/news/press/factsheets/colafacts2027.pdf), the [retirement PIA bend points](https://www.ssa.gov/oact/cola/bendpoints.html) and [work-credit table](https://www.ssa.gov/oact/cola/QC.html) establish:

- 2027 COLA: 3.6%, applied in December 2026 for January 2027 benefits.
- 2027 covered-earnings cap: $192,300.
- 2027 first/second PIA bend points: $1,340 and $8,077.
- 2027 annual retirement earnings-test thresholds: $25,560 (under FRA) and $67,920 (year attaining FRA).
- 2027 earnings per work credit: $1,970. Most workers need 40 credits to qualify for an own-record retirement benefit.

The indexed dollar values and COLA were already present. The additional insured-status logic now checks modeled covered earnings through the selected claim year. Users can enter confirmed SSA credits earned **through the previous calendar year** for either spouse. Current/future credits use modeled covered earnings, up to four credits per year. A modeled total below 40 suppresses that person's own-record benefit at the selected claim age. Credits before 1978 cannot be derived from the modern annual-earnings rule, so the model does not automatically declare such cases ineligible.

**Limitations:** Salary-derived historical earnings are only estimates. The model does not import an SSA lifetime earnings record, add spouse/survivor benefits, or start a delayed own-record benefit if eligibility is achieved after the modeled claiming age. Check the actual Social Security statement.

## Alabama TRS

Sources: [RSA TRS Member Handbook](https://www.rsa-al.gov/uploads/files/TRS_Member_Handbook_2024_for_web.pdf), printed pages 7–9 for member credit and the July–June contribution year (PDF pages 9–11); printed pages 17 and 21–22 for tiers, vesting and pension formulas; and [Alabama Act 2026-525](https://www.rsa-al.gov/uploads/files/Act_2026-525_%28SB280%29_Federal_Service_Purchase.pdf), PDF pages 1–3.

- Tier 1: 2.0125% benefit multiplier; highest three of final ten years' compensation; standard retirement age 60 with at least ten years or any age with 25 years.
- Tier 2: 1.65% multiplier; highest five of final ten; standard retirement age 62 with ten years; early retirement with 30 years and 2% reduction for each year younger than 62; maximum 80% of average final compensation.
- Future TRS credit defaults to 100% (full service), but may be reduced to model prorated/part-time membership. Prior credit remains the user-entered service from their RSA statement.
- The salary model now calculates July 1–June 30 contribution-year compensation, rather than comparing calendar-year salaries.
- An optional federal-service purchase scenario may add **up to four** qualifying years under Act 2026-525. This must be confirmed, purchased, and not already included in the RSA statement. The act has eligibility/cost restrictions, including ten contributing years (not counting military credit) and a certified service record; the calculator does not independently verify purchase eligibility or fund the payment.
- No automatic TRS COLA is projected.

Actual compensation records, unpaid leave, part-time service determinations, retirement-option elections, approved purchase cost and service-credit record may materially change RSA's award.

## Validation

Run separately from `retirement-compass/` with Node.js:

```sh
node model.test.js
node ssa-2027.test.js
node ssa-benefit-schedule.test.js
node rules-2027.test.js
```

The release marker and cache-busting script version strings in `household.html` must change whenever a live version is published. See `RELEASE_WORKFLOW.md`.
