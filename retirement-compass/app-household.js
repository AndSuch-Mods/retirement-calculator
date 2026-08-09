(function () {
  'use strict';

  const Model = window.HouseholdModel;
  const displayState = { mode: 'real' };
  const inputIds = [
    'birthDate','retirementAge','planThroughAge','currentSavings','currentIncome','employeeContributionPct',
    'employerMatchRatePct','employerMatchCapPct','salaryGrowthPct','autoIncreaseEnabled','autoIncreasePctPoints',
    'maxEmployeeContributionPct','socialSecurityEnabled','socialSecurityClaimAge','socialSecurityCareerStartAge',
    'spouseEnabled','spouseBirthDate','spouseRetirementAge','spouseCurrentSavings','spouseCurrentIncome',
    'spouseEmployeeContributionPct','spouseSalaryGrowthPct','spouseAutoIncreaseEnabled','spouseAutoIncreasePctPoints',
    'spouseMaxEmployeeContributionPct','spouseVoluntaryPlanType','spouseSocialSecurityEnabled','spouseSocialSecurityClaimAge',
    'spouseSocialSecurityCareerStartAge','spouseTrsEnabled','spouseTrsTier','spouseTrsCurrentServiceYears',
    'desiredSpending','otherRetirementIncome','preRetirementReturnPct','retirementReturnPct','inflationPct'
  ];
  const $ = (id) => document.getElementById(id);
  const currency = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
  const compactCurrency = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:1});
  const percent1 = new Intl.NumberFormat('en-US',{style:'percent',maximumFractionDigits:1,minimumFractionDigits:1});
  const dateFmt = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});

  function getFormValues(){
    const v={}; inputIds.forEach(id=>{const el=$(id); if(!el)return; v[id]=el.type==='checkbox'?el.checked:el.value;}); return v;
  }
  function setFormValues(values){
    inputIds.forEach(id=>{const el=$(id); if(!el||values[id]===undefined)return; if(el.type==='checkbox')el.checked=Boolean(values[id]); else el.value=values[id];}); syncVisibility();
  }
  function syncVisibility(){
    $('autoIncreaseFields').hidden=!$('autoIncreaseEnabled').checked;
    $('primarySocialSecurityFields').hidden=!$('socialSecurityEnabled').checked;
    $('spouseFields').hidden=!$('spouseEnabled').checked;
    $('spouseAutoIncreaseFields').hidden=!$('spouseAutoIncreaseEnabled').checked;
    $('spouseSocialSecurityFields').hidden=!$('spouseSocialSecurityEnabled').checked;
    $('spouseTrsFields').hidden=!$('spouseTrsEnabled').checked;
  }
  function formatMoney(v){return Number.isFinite(v)?currency.format(Math.round(v)):'—';}
  function formatSignedMoney(v){if(!Number.isFinite(v))return'—';const a=formatMoney(Math.abs(v));return v>0?`+${a}`:v<0?`−${a}`:a;}
  function formatPercent(v){return Number.isFinite(v)?percent1.format(v):'—';}
  function formatDate(d){return d instanceof Date&&!Number.isNaN(d.getTime())?dateFmt.format(d):'—';}
  function formatAge(age){if(!Number.isFinite(age))return'—';const years=Math.floor(age);const months=Math.max(0,Math.min(11,Math.floor((age-years)*12+0.01)));return `${years} yr${years===1?'':'s'}${months?`, ${months} mo`:''}`;}
  function firstRetirementInflation(result){return Math.pow(1+result.input.inflationPct/100,Math.max(Model.yearsBetween(result.asOfDate,result.firstRetirementDate),0));}
  function displayAtFirstRetirement(real,nominal,result){return displayState.mode==='real'?real:(Number.isFinite(nominal)?nominal:real*firstRetirementInflation(result));}
  function displayAnnualReal(real,result){return displayState.mode==='real'?real:real*firstRetirementInflation(result);}

  function renderValidation(result){const b=$('validationBanner');if(!result.errors?.length){b.hidden=true;b.textContent='';return false;}b.hidden=false;b.textContent=result.errors.join(' ');return true;}
  function setResultsDimmed(dimmed){document.querySelectorAll('.summary-panel,.results-section,.detail-grid').forEach(el=>{el.style.opacity=dimmed?'0.45':'1';el.style.pointerEvents=dimmed?'none':'';});}

  function renderAgeNotes(result){
    $('primaryAgeNote').textContent=`Current age: ${formatAge(result.input.currentAge)}.`;
    $('spouseAgeNote').textContent=`Current age: ${formatAge(result.input.spouseCurrentAge)}.`;
  }

  function renderStatus(result){
    const projected=displayAtFirstRetirement(result.projectedNestEggReal,result.projectedNestEggNominal,result);
    const required=displayAtFirstRetirement(result.requiredNestEggReal,result.requiredNestEggNominal,result);
    const surplus=displayState.mode==='real'?result.surplusReal:result.projectedNestEggNominal-result.requiredNestEggNominal;
    const ratio=Number.isFinite(result.fundingRatio)?Math.max(result.fundingRatio,0):1;
    const pct=result.requiredNestEggReal>0?Math.round(ratio*100):100; const degrees=Math.min(ratio,1)*360;
    $('summaryModeLabel').textContent=displayState.mode==='real'?'Today’s dollars':'First-retirement dollars';
    $('projectedNestEgg').textContent=formatMoney(projected); $('requiredNestEgg').textContent=formatMoney(required); $('surplusShortfall').textContent=formatSignedMoney(surplus);
    $('fundingPercent').textContent=`${pct}%`; $('fundingRing').style.background=`conic-gradient(#d8a34a ${degrees}deg, rgba(255,255,255,0.15) ${degrees}deg)`;
    const pill=$('statusPill');pill.classList.remove('positive','negative');
    if(result.onTrack){pill.textContent='On track';pill.classList.add('positive');$('statusHeadline').textContent=result.spouse?'The combined household plan lasts through the modeled horizon.':'Your plan lasts through the modeled horizon.';$('statusExplanation').textContent=`The first retirement begins ${formatDate(result.firstRetirementDate)}; later salary, Social Security, and pension income are included as they start.`;}
    else{pill.textContent='Needs adjustment';pill.classList.add('negative');$('statusHeadline').textContent='The modeled household portfolio runs out before the planning horizon.';$('statusExplanation').textContent=result.depletionDate?`The combined invested balance reaches $0 around ${formatDate(result.depletionDate)}.`:'The projected balance is below the modeled household need.';}
  }

  function renderSocialSecurity(result){
    const ss=result.socialSecurity;
    if(ss.enabled){$('socialSecurityEstimateInline').textContent=`About ${formatMoney(ss.monthlyBenefitReal)}/mo in today’s dollars`;$('socialSecurityEstimateDetail').textContent=`Claim age ${ss.claimAge}; modeled FRA ${ss.fullRetirementAge.toFixed(2)}; AIME about ${formatMoney(ss.aime)}/mo. Actual SSA earnings records will be more precise.`;}
    else{$('socialSecurityEstimateInline').textContent='Social Security estimate disabled';$('socialSecurityEstimateDetail').textContent='No Social Security income is included for you.';}
    const sss=result.spouseSocialSecurity;
    if(result.spouse&&sss.enabled){$('spouseSocialSecurityEstimateInline').textContent=`About ${formatMoney(sss.monthlyBenefitReal)}/mo in today’s dollars`;$('spouseSocialSecurityEstimateDetail').textContent=`Claim age ${sss.claimAge}; modeled FRA ${sss.fullRetirementAge.toFixed(2)}. Montevallo wages are treated as Social Security-covered earnings.`;}
    else{$('spouseSocialSecurityEstimateInline').textContent='Spouse Social Security estimate disabled';$('spouseSocialSecurityEstimateDetail').textContent='No spouse Social Security income is included.';}
  }

  function renderTrs(result){
    const trs=result.trs;
    if(!result.spouse||!trs.enabled){$('trsEstimateInline').textContent='Alabama TRS estimate disabled';$('trsEstimateDetail').textContent='Enable spouse and Alabama TRS to estimate the pension.';return;}
    if(!trs.eligible){$('trsEstimateInline').textContent='No vested lifetime TRS pension modeled at the planned stop date';$('trsEstimateDetail').textContent=trs.eligibilityText;return;}
    const pensionDisplay=displayState.mode==='real'?trs.annualBenefitRealAtStart:trs.annualBenefitNominal;
    $('trsEstimateInline').textContent=`Estimated maximum benefit: ${formatMoney(pensionDisplay)}/yr`;
    $('trsEstimateDetail').textContent=`Tier ${trs.tier}; ${trs.serviceAtStop.toFixed(1)} projected service years; average final salary about ${formatMoney(trs.averageFinalSalary)}; pension starts ${formatDate(trs.pensionStart)}. ${trs.eligibilityText} No automatic COLA is assumed.`;
  }

  function renderIncome(result){
    $('primarySocialSecurityResult').textContent=result.socialSecurity.enabled?`${formatMoney(displayAnnualReal(result.socialSecurity.annualBenefitReal,result))}/yr`:'$0/yr';
    $('spouseSsIncomeRow').hidden=!result.spouse;
    $('spouseSocialSecurityResult').textContent=result.spouseSocialSecurity.enabled?`${formatMoney(displayAnnualReal(result.spouseSocialSecurity.annualBenefitReal,result))}/yr`:'$0/yr';
    $('trsIncomeRow').hidden=!(result.spouse&&result.trs.eligible);
    const trsReal=result.trs.eligible?result.trs.annualBenefitRealAtStart:0;
    $('trsIncomeResult').textContent=result.trs.eligible?`${formatMoney(displayAnnualReal(trsReal,result))}/yr`:'$0/yr';
    $('otherIncomeResult').textContent=`${formatMoney(displayAnnualReal(result.input.otherRetirementIncome,result))}/yr`;
    $('portfolioGapResult').textContent=`${formatMoney(displayAnnualReal(result.portfolioGapAfterAllIncomeReal,result))}/yr`;
  }

  function renderRules(result){
    const limits=result.currentIrsLimits; $('irsLimitLabel').textContent=`${limits.year} employee deferral limit${limits.catchupAllowed?` incl. ${formatMoney(limits.catchupAllowed)} catch-up`:''}`;$('irsLimitValue').textContent=formatMoney(limits.employeeDeferralMax);
    if(result.firstContributionCapEvent){const e=result.firstContributionCapEvent;$('rulesTitle').textContent='A contribution cap is projected to apply';$('rulesText').textContent=`${e.person} first reaches a modeled IRS contribution ceiling in ${e.year}. The calculator automatically caps the contribution at the applicable projected limit instead of letting the percentage over-contribute.`;}
    else{$('rulesTitle').textContent='Current rules applied automatically';$('rulesText').textContent='Your modeled contribution percentages remain below the projected IRS annual ceilings. Future ceilings are estimated from historical indexed-limit growth.';}
  }

  function renderDetails(result){
    const primaryRet=Model.addYears(result.primary.birth,result.primary.retirementAge); const spouseRet=result.spouse?Model.addYears(result.spouse.birth,result.spouse.retirementAge):null;
    $('retirementDatesResult').textContent=result.spouse?`${formatDate(primaryRet)} / ${formatDate(spouseRet)}`:formatDate(primaryRet);
    $('retirementDatesDetail').textContent=result.spouse?`You retire at ${formatAge(result.primary.retirementAge)}; spouse at ${formatAge(result.spouse.retirementAge)}. Household retirement spending starts with the first retirement.`:`Retirement begins at age ${result.primary.retirementAge}.`;
    if(result.spouse&&result.trs.enabled){$('trsDetailResult').textContent=result.trs.eligible?`${formatMoney(result.trs.monthlyBenefitNominal)}/mo`:'Not vested in model';$('trsDetailText').textContent=result.trs.eligible?`Maximum-benefit estimate at pension start; Tier ${result.trs.tier}, ${result.trs.serviceAtStop.toFixed(1)} years of service. No automatic COLA assumed.`:result.trs.eligibilityText;}
    else{$('trsDetailResult').textContent='Not included';$('trsDetailText').textContent='Enable spouse/TRS to model the University of Montevallo pension.';}
    if(result.firstContributionCapEvent){const e=result.firstContributionCapEvent;$('contributionCapResult').textContent=`${e.person}: ${e.year}`;$('contributionCapDetail').textContent=`Planned ${formatMoney(e.desiredEmployeeContribution)}; capped to ${formatMoney(e.employeeContribution)} for the modeled period.`;}
    else{$('contributionCapResult').textContent='No cap reached yet';$('contributionCapDetail').textContent='The current savings percentages stay below modeled IRS annual limits throughout the contribution periods.';}
    $('realReturnResult').textContent=formatPercent(result.realRetirementReturn);
  }

  function niceMax(value){if(!(value>0))return 1;const e=Math.floor(Math.log10(value));const b=10**e;const n=value/b;return(n<=1?1:n<=2?2:n<=5?5:10)*b;}
  function renderChart(result){
    const svg=$('projectionChart'),width=1000,height=360,pad={left:72,right:28,top:28,bottom:48},plotW=width-pad.left-pad.right,plotH=height-pad.top-pad.bottom;
    const data=result.timeline.map(p=>({...p,value:displayState.mode==='real'?p.realBalance:p.nominalBalance})); const maxX=Math.max(...data.map(d=>d.yearsFromNow),1);const maxValue=niceMax(Math.max(...data.map(d=>d.value),1)*1.05);
    const x=t=>pad.left+(t/maxX)*plotW;const y=v=>pad.top+plotH-(Math.max(v,0)/maxValue)*plotH;
    const grid=[];for(let i=0;i<=4;i++){const val=maxValue*(1-i/4),yy=pad.top+plotH*i/4;grid.push(`<line x1="${pad.left}" y1="${yy}" x2="${width-pad.right}" y2="${yy}" stroke="#dfe7e3"/><text x="${pad.left-10}" y="${yy+4}" text-anchor="end" fill="#74817b" font-size="12">${compactCurrency.format(val)}</text>`);}
    const ticks=[];const count=7;const startYear=result.asOfDate.getUTCFullYear();for(let i=0;i<=count;i++){const t=maxX*i/count;ticks.push(`<text x="${x(t)}" y="${height-14}" text-anchor="middle" fill="#74817b" font-size="12">${startYear+Math.round(t)}</text>`);}
    const pts=data.map(d=>`${x(d.yearsFromNow).toFixed(2)},${y(d.value).toFixed(2)}`).join(' ');const area=`${x(0)},${pad.top+plotH} ${pts} ${x(maxX)},${pad.top+plotH}`;
    function marker(date,label,color,dash){const t=Model.yearsBetween(result.asOfDate,date);if(t<0||t>maxX)return'';const xx=x(t);return `<line x1="${xx}" y1="${pad.top}" x2="${xx}" y2="${pad.top+plotH}" stroke="${color}" stroke-width="2" stroke-dasharray="${dash}"/><text x="${Math.min(xx+7,width-120)}" y="${pad.top+14}" fill="${color}" font-size="11" font-weight="700">${label}</text>`;}
    let markers=marker(Model.addYears(result.primary.birth,result.primary.retirementAge),'You retire','#b37b22','6 6');
    if(result.spouse)markers+=marker(Model.addYears(result.spouse.birth,result.spouse.retirementAge),'Spouse retires','#d8a34a','6 6');
    if(result.socialSecurity.enabled)markers+=marker(result.socialSecurity.claimDate,'Your SS','#4f7da6','2 6');
    if(result.spouse&&result.spouseSocialSecurity.enabled)markers+=marker(result.spouseSocialSecurity.claimDate,'Spouse SS','#6c91b1','2 6');
    const targetX=x(Math.max(Model.yearsBetween(result.asOfDate,result.firstRetirementDate),0));const targetValue=displayState.mode==='real'?result.requiredNestEggReal:result.requiredNestEggNominal;
    svg.innerHTML=`<title id="chartTitle">Household retirement portfolio projection</title><desc id="chartDesc">Combined portfolio with separate retirement and Social Security dates.</desc><defs><linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#0e6755" stop-opacity="0.24"/><stop offset="100%" stop-color="#0e6755" stop-opacity="0.02"/></linearGradient></defs>${grid.join('')}<polygon points="${area}" fill="url(#areaGradient)"/>${markers}${result.requiredNestEggReal>0?`<circle cx="${targetX}" cy="${y(targetValue)}" r="5" fill="#d8a34a" stroke="#fff" stroke-width="2"/><text x="${Math.min(targetX+8,width-130)}" y="${Math.max(y(targetValue)-8,18)}" fill="#8a5a10" font-size="11">Target ${compactCurrency.format(targetValue)}</text>`:''}<polyline points="${pts}" fill="none" stroke="#0e6755" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${ticks.join('')}`;
    $('chartDescription').textContent=`Estimated combined invested balance in ${displayState.mode==='real'?'today’s purchasing power':'nominal future dollars'}. Working-spouse salary, Social Security, and TRS pension offset the household spending goal as they become available.`;
    $('chartFooterLeft').textContent=`First retirement: ${formatDate(result.firstRetirementDate)}${result.spouse?`; both retired by ${formatDate(result.bothRetiredDate)}`:''}.`;
    $('chartFooterRight').textContent=result.depletionDate?`Portfolio reaches $0 around ${formatDate(result.depletionDate)}.`:`Modeled ending balance: ${formatMoney(displayState.mode==='real'?result.endingBalanceReal:result.endingBalanceNominal)}.`;
  }

  function calculateAndRender(){
    syncVisibility(); const result=Model.analyze(getFormValues()); const invalid=renderValidation(result); setResultsDimmed(invalid); if(invalid)return;
    renderAgeNotes(result);renderStatus(result);renderSocialSecurity(result);renderTrs(result);renderIncome(result);renderRules(result);renderDetails(result);renderChart(result);
  }

  function attachListeners(){
    inputIds.forEach(id=>{const el=$(id);if(!el)return;el.addEventListener('input',calculateAndRender);el.addEventListener('change',calculateAndRender);});
    document.querySelectorAll('[data-display-mode]').forEach(btn=>btn.addEventListener('click',()=>{displayState.mode=btn.dataset.displayMode;document.querySelectorAll('[data-display-mode]').forEach(b=>b.classList.toggle('is-active',b===btn));calculateAndRender();}));
    $('resetButton').addEventListener('click',()=>{setFormValues(Model.DEFAULTS);displayState.mode='real';document.querySelectorAll('[data-display-mode]').forEach(b=>b.classList.toggle('is-active',b.dataset.displayMode==='real'));calculateAndRender();});
  }

  setFormValues(Model.DEFAULTS);attachListeners();calculateAndRender();
})();
