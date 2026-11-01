# Retirement Compass release checklist

The iPhone home-screen shortcut runs the same GitHub Pages site as Safari.

When publishing **any change to the live calculator**, update the version marker in `retirement-compass/household.html`:

1. Change `#appUpdated`'s `datetime`, visible `Updated Month D, YYYY` text and unique `data-release-id`.
2. Change the `?v=` suffix on any edited JavaScript or CSS asset in that HTML file, so home-screen browsers do not keep stale assets.
3. Run the core and Social Security tests before publishing.
4. Merge to `main`; confirm the GitHub Pages deployment succeeds.

The top bar shows the version **loaded on the device**, not the current phone date. `release-status.js` checks the published HTML when the app opens or returns to the foreground. If it sees a different release ID, it displays a **New update available** button that reloads the published release. This requires an internet connection; offline mode retains the last loaded date.

SSA documentation for the optional modeling features:

- [Special monthly earnings rule](https://www.ssa.gov/benefits/retirement/planner/rule.html)
- [SSA POMS RS 02501.030: first grace year](https://secure.ssa.gov/poms.nsf/lnx/0302501030)
- [SSA POMS RS 02501.095: charging excess earnings](https://secure.ssa.gov/poms.nsf/lnx/0302501095)
- [SSA POMS RS 00615.482: crediting withheld months](https://secure.ssa.gov/apps10/poms.nsf/lnx/0300615482)
- [SSA POMS RS 00615.490: recalculation at FRA](https://secure.ssa.gov/poms.nsf/lnx/0300615490)

The Social Security calculations remain planning approximations based on modeled earnings, not a substitute for an SSA benefits determination.
