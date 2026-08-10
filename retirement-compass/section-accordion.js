(function (root) {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function installStyles() {
    if ($('plannerAccordionStyle')) return;
    const style = document.createElement('style');
    style.id = 'plannerAccordionStyle';
    style.textContent = `
      .planner-section{
        margin:0 0 14px;
        border:1px solid var(--line);
        border-radius:18px;
        background:var(--surface);
        overflow:hidden;
      }
      .planner-section[hidden]{display:none!important}
      .planner-section-summary{
        list-style:none;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        padding:16px 18px;
        cursor:pointer;
        background:var(--surface-soft);
        user-select:none;
      }
      .planner-section-summary::-webkit-details-marker{display:none}
      .planner-section-summary::marker{display:none}
      .planner-section-summary-main{display:flex;align-items:flex-start;gap:12px;min-width:0}
      .planner-step{
        flex:0 0 auto;
        width:30px;
        height:30px;
        border-radius:50%;
        display:grid;
        place-items:center;
        background:var(--brand-soft);
        color:var(--brand-strong);
        font-size:.78rem;
        font-weight:850;
      }
      .planner-section-title{display:block;color:var(--ink);font-size:1rem;font-weight:780;letter-spacing:-.015em}
      .planner-section-subtitle{display:block;margin-top:2px;color:var(--muted);font-size:.72rem;line-height:1.35}
      .planner-section-chevron{flex:0 0 auto;color:var(--muted);font-size:1.2rem;transition:transform 160ms ease}
      .planner-section[open]>.planner-section-summary{border-bottom:1px solid var(--line);background:#17211d}
      .planner-section[open]>.planner-section-summary .planner-section-chevron{transform:rotate(180deg)}
      .planner-section-body{padding:18px}
      .planner-section-body>.accordion-source-heading{display:none!important}
      .planner-section-body>.spouse-section{
        margin:0!important;
        padding:0!important;
        border:0!important;
        border-radius:0!important;
        background:transparent!important;
      }
      .input-panel>.spouse-toggle{
        margin:2px 0 14px!important;
        padding:15px 16px!important;
        border-color:#2c4c41!important;
        background:linear-gradient(145deg,#13251f,#111a17)!important;
      }
      @media(max-width:720px){
        .planner-section-summary{padding:14px 14px}
        .planner-section-body{padding:15px 13px}
        .planner-section-subtitle{font-size:.69rem}
      }
    `;
    document.head.appendChild(style);
  }

  function directHeading(panel, title) {
    return Array.from(panel.children).find((el) =>
      el.classList?.contains('section-heading') && el.querySelector('h2')?.textContent.trim() === title
    ) || null;
  }

  function createSection(id, step, title, subtitle, nodes, sourceHeading) {
    if (!nodes.length) return null;

    const details = document.createElement('details');
    details.id = id;
    details.className = 'planner-section';
    details.removeAttribute('open');
    details.open = false;

    const summary = document.createElement('summary');
    summary.className = 'planner-section-summary';
    summary.innerHTML = `
      <span class="planner-section-summary-main">
        <span class="planner-step" data-planner-step>${step}</span>
        <span>
          <span class="planner-section-title">${title}</span>
          <span class="planner-section-subtitle">${subtitle}</span>
        </span>
      </span>
      <span class="planner-section-chevron" aria-hidden="true">⌄</span>`;

    const body = document.createElement('div');
    body.className = 'planner-section-body';

    nodes[0].parentNode.insertBefore(details, nodes[0]);
    details.append(summary, body);
    nodes.forEach((node) => body.appendChild(node));

    if (sourceHeading) sourceHeading.classList.add('accordion-source-heading');
    return details;
  }

  function buildAccordion() {
    const panel = document.querySelector('.input-panel');
    if (!panel || $('plannerSectionYou')) return null;

    const children = Array.from(panel.children);
    const youHeading = directHeading(panel, 'You');
    const spouseToggle = children.find((el) => el.classList?.contains('spouse-toggle')) || null;
    const spouseFields = $('spouseFields');
    const lifestyleHeading = directHeading(panel, 'Household retirement lifestyle');
    if (!youHeading || !spouseToggle || !spouseFields || !lifestyleHeading) return null;

    const youIndex = children.indexOf(youHeading);
    const spouseToggleIndex = children.indexOf(spouseToggle);
    const spouseIndex = children.indexOf(spouseFields);
    const lifestyleIndex = children.indexOf(lifestyleHeading);

    const firstDivider = children.slice(youIndex + 1, spouseToggleIndex)
      .find((el) => el.classList?.contains('divider')) || null;
    const secondDivider = children.slice(spouseIndex + 1, lifestyleIndex)
      .find((el) => el.classList?.contains('divider')) || null;

    const youEnd = firstDivider ? children.indexOf(firstDivider) : spouseToggleIndex;
    const youNodes = children.slice(youIndex, youEnd);
    const lifestyleNodes = children.slice(lifestyleIndex);

    const youSection = createSection(
      'plannerSectionYou',
      '1',
      'You',
      'Personal details, savings, contributions, employer match, and Social Security.',
      youNodes,
      youHeading
    );

    const spouseHeading = spouseFields.querySelector('.section-heading');
    const spouseSection = createSection(
      'plannerSectionSpouse',
      '2',
      'Spouse',
      'Separate retirement savings, Social Security, and Alabama TRS assumptions.',
      [spouseFields],
      spouseHeading
    );

    const lifestyleSection = createSection(
      'plannerSectionLifestyle',
      '2',
      'Household retirement lifestyle',
      'Spending goal, other retirement income, investment return, and inflation assumptions.',
      lifestyleNodes,
      lifestyleHeading
    );

    firstDivider?.remove();
    secondDivider?.remove();

    return { youSection, spouseSection, lifestyleSection, lifestyleHeading };
  }

  function setStep(section, value) {
    const badge = section?.querySelector('[data-planner-step]');
    if (badge) badge.textContent = String(value);
  }

  function forceClosed(section) {
    if (!section) return;
    section.open = false;
    section.removeAttribute('open');
  }

  function keepHeaderAtViewportPosition(section, previousTop) {
    if (!section || !Number.isFinite(previousTop)) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const currentTop = section.getBoundingClientRect().top;
        const delta = currentTop - previousTop;
        if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
      });
    });
  }

  function init() {
    installStyles();
    const built = buildAccordion();
    if (!built) return;

    const { youSection, spouseSection, lifestyleSection, lifestyleHeading } = built;
    const spouseEnabled = $('spouseEnabled');
    const sections = [youSection, spouseSection, lifestyleSection].filter(Boolean);
    let syncing = false;

    function collapseAll() {
      syncing = true;
      sections.forEach(forceClosed);
      syncing = false;
    }

    function closeOthers(current) {
      sections.forEach((section) => {
        if (section && section !== current && !section.hidden) forceClosed(section);
      });
    }

    sections.forEach((section) => {
      const summary = section.querySelector('.planner-section-summary');

      // On a user-initiated close, take control of the collapse so the section
      // header remains anchored at the same place in the viewport after the
      // large body disappears. Programmatic closes do not move the page.
      summary?.addEventListener('click', (event) => {
        if (!section.open || syncing) return;
        event.preventDefault();
        const previousTop = section.getBoundingClientRect().top;
        syncing = true;
        forceClosed(section);
        syncing = false;
        keepHeaderAtViewportPosition(section, previousTop);
      });

      section.addEventListener('toggle', () => {
        if (syncing || !section.open) return;
        syncing = true;
        closeOthers(section);
        syncing = false;
      });
    });

    function syncSpouseState({ reset = false, spouseChanged = false } = {}) {
      const enabled = Boolean(spouseEnabled?.checked);
      spouseSection.hidden = !enabled;
      setStep(spouseSection, 2);
      setStep(lifestyleSection, enabled ? 3 : 2);

      const originalLifestyleStep = lifestyleHeading?.querySelector('.step-number');
      if (originalLifestyleStep) originalLifestyleStep.textContent = enabled ? '3' : '2';

      // The spouse toggle only controls whether the collapsed spouse section exists.
      // It must never open that section as a side effect.
      if (spouseChanged || !enabled) forceClosed(spouseSection);
      if (reset) collapseAll();
    }

    // Force the initial state closed more than once so browser state restoration
    // or later calculator initialization cannot reopen a section on page load.
    syncSpouseState({ reset: true });
    requestAnimationFrame(collapseAll);
    setTimeout(collapseAll, 0);
    setTimeout(collapseAll, 80);

    spouseEnabled?.addEventListener('change', () => {
      syncSpouseState({ spouseChanged: true });
      requestAnimationFrame(() => forceClosed(spouseSection));
      setTimeout(() => forceClosed(spouseSection), 0);
    });

    $('resetButton')?.addEventListener('click', () => {
      setTimeout(() => syncSpouseState({ reset: true }), 0);
      setTimeout(collapseAll, 80);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
