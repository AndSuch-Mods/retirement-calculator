(function (root) {
  'use strict';

  // All user-entered spending and retirement-income amounts are interpreted
  // in today's dollars. The base household model already converts those
  // planning amounts into nominal future cash flows using the inflation
  // assumption, so no additional fixed-nominal-income override is needed.
  const Model = root.HouseholdModel;
  if (!Model) return;

  root.HouseholdModel = {
    ...Model,
    __todayDollarInputPolicy: true
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
