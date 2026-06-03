const STORE_KEY = 'myapt_field_ops_v1';
const DAILY_KEY = 'myapt_daily_capture_v1';
const SYNC_ENDPOINT_KEY = 'myapt_sync_endpoint_v1';
const PARTNER_QUEUE_KEY = 'myapt_partner_queue_today_v1';
const DEFAULT_SYNC_ENDPOINT = 'https://script.google.com/macros/s/AKfycby0WreQ1kvsm2dxG8RBlFIly2r5_hsXgTc6AowaXC_XWySuo2s5Jh1DTvi6m-38UcaY/exec';
const APP_VERSION = '20260603-inventory-live';
const OLD_SYNC_ENDPOINTS = ['https://script.google.com/macros/s/AKfycbz91SkhM-rYSR48XHjEpzp6bw1gWveVMtPM5Y1vLZw2t9tqzzL5nFVPybjZVwJ0lDEDOg/exec'];

const statusColors = {
  'No coverage — film needed': 'red',
  'Partial coverage — capture needed': 'gold',
  'Leasing follow-up needed': 'blue',
  'Needs Review': '',
  'YouTube usable for MVP': 'green',
  'Complete': 'green',
};

let state = loadState();
let ui = { tab: 'today', mediaNeighborhood: 'all' };

function clone(x){ return JSON.parse(JSON.stringify(x)); }
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }

function loadState(){
  const stored = localStorage.getItem(STORE_KEY);
  if(stored){ try { return JSON.parse(stored); } catch(e){} }
  return {
    buildings: clone(window.MYAPT_SEED.buildings),
    partners: clone(window.MYAPT_SEED.partners),
    captures: [],
    daily: JSON.parse(localStorage.getItem(DAILY_KEY) || '[]'),
    updated_at: new Date().toISOString(),
  };
}
function save(){ state.updated_at = new Date().toISOString(); localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

function setTab(tab){
  ui.tab = tab;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  $(tab+'Panel').classList.add('active');
  render();
}

function derivedToday(){
  if(state.daily && state.daily.length) return state.daily;
  return state.buildings
    .filter(b => !b.mute_alerts)
    .filter(b => ['No coverage — film needed','Partial coverage — capture needed','Leasing follow-up needed','Needs Review'].includes(b.media_status))
    .filter(b => b.priority === 'A' || b.status?.startsWith('P1'))
    .sort((a,b)=>scoreBuilding(b)-scoreBuilding(a))
    .slice(0,40)
    .map(b => ({...b, generated_from_master:true}));
}
function scoreBuilding(b){
  const fp = Number(b.floorplan_count || b.known_floorplan_count || b.distinct_unfilmed_floorplans || 0);
  const statusScore = {'No coverage — film needed':50,'Partial coverage — capture needed':35,'Leasing follow-up needed':25,'Needs Review':15}[b.media_status] || 0;
  return statusScore + (b.priority==='A'?10:0) + Math.min(fp,80)/4 - (b.dnp?8:0);
}
function badgesFor(b){
  const raw = b.badges;
  const arr = Array.isArray(raw) ? [...raw] : String(raw || '').split(/\s*[|·,]\s*/).filter(Boolean);
  if((b.dnp || b.dnp_flag) && !arr.includes('DNP')) arr.push('DNP');
  if((b.mute_alerts === true || String(b.mute_alerts).toLowerCase()==='true') && !arr.includes('Muted alerts')) arr.push('Muted alerts');
  return arr;
}
function normKey(k){ return String(k || '').trim().toUpperCase(); }
function findBuilding(key){ return state.buildings.find(x=>normKey(x.building_key)===normKey(key)); }
function findDaily(key){ return (state.daily || []).find(x=>normKey(x.building_key)===normKey(key)); }
function findDailyForBuilding(b){ return findDaily(b?.building_key) || (state.daily || []).find(x=>String(x.building_name||'').toLowerCase()===String(b?.building_name||'').toLowerCase()); }
function parseUnitsByFloorplan(b){
  const raw = b.units_by_floorplan || b.units_by_floorplan_json;
  if(!raw) return {};
  if(typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch(e) { return {}; }
}
function floorplanOpportunitiesHtml(b){
  const fps = parseUnitsByFloorplan(b);
  const rows = Object.entries(fps).map(([id, fp])=>({ id, ...fp, units: Array.isArray(fp.units) ? fp.units : String(fp.units || '').split(/[|,]/).map(x=>x.trim()).filter(Boolean) }))
    .sort((a,b)=>(Number(b.beds)-Number(a.beds)) || (Number(b.sqft)-Number(a.sqft)));
  if(!rows.length) return '<div class="empty">No available floorplan/unit details were included in this daily row.</div>';
  return rows.map(fp=>`<div class="detail-row"><b>${esc(fp.beds==0?'Studio':`${fp.beds || '?'} bed`)} / ${esc(fp.baths || '?')} bath / ${esc(fp.sqft || '?')} sqft</b><div class="muted">${esc(fp.id)}</div><div><b>Units:</b> ${esc(fp.units.length ? fp.units.join(' · ') : 'Unit numbers not listed')}</div></div>`).join('');
}
function badgeHtml(label, cls=''){ return `<span class="badge ${cls}">${esc(label)}</span>`; }
function statusBadge(s){ return badgeHtml(s || 'Unclassified', statusColors[s] || ''); }

function render(){
  if(ui.tab==='today') renderToday();
  if(ui.tab==='media') renderMedia();
  if(ui.tab==='partners') renderPartners();
  if(ui.tab==='capture') renderCaptures();
}

function renderToday(){
  const today = derivedToday();
  const counts = countBy(state.buildings, 'media_status');
  $('todayStats').innerHTML = [
    ['Need film', counts['No coverage — film needed']||0],
    ['Partial', counts['Partial coverage — capture needed']||0],
    ['Leasing', state.buildings.filter(b=>b.floorplan_visibility?.startsWith('Only shows')).length],
    ['Partners YES', state.partners.filter(p=>p.Status==='YES').length],
  ].map(([l,v])=>`<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  $('todayList').innerHTML = today.length ? today.map(buildingCard).join('') : `<div class="empty">No current opportunities.</div>`;
  wireBuildingCards('todayList');
}
function renderMedia(){
  const neighborhoods = ['all', ...Array.from(new Set(state.buildings.map(b=>b.neighborhood).filter(Boolean))).sort()];
  $('mediaNeighborhoods').innerHTML = neighborhoods.map(n=>`<button class="chip ${ui.mediaNeighborhood===n?'active':''}" data-neighborhood="${esc(n)}">${esc(n==='all'?'All':n)}</button>`).join('');
  document.querySelectorAll('[data-neighborhood]').forEach(b=>b.onclick=()=>{ui.mediaNeighborhood=b.dataset.neighborhood; renderMedia();});
  const q = $('mediaSearch').value.trim().toLowerCase();
  const f = $('mediaStatusFilter').value;
  let list = state.buildings.filter(b => {
    if(ui.mediaNeighborhood!=='all' && b.neighborhood!==ui.mediaNeighborhood) return false;
    if(f==='urgent' && !['No coverage — film needed','Partial coverage — capture needed','Leasing follow-up needed','Needs Review'].includes(b.media_status)) return false;
    if(f!=='all' && f!=='urgent' && b.media_status!==f) return false;
    if(q){ const hay=[b.building_name,b.neighborhood,b.management_company,b.media_status,b.website].join(' ').toLowerCase(); if(!hay.includes(q)) return false; }
    return true;
  }).sort((a,b)=>scoreBuilding(b)-scoreBuilding(a));
  $('mediaList').innerHTML = list.length ? list.map(buildingCard).join('') : `<div class="empty">No buildings match.</div>`;
  wireBuildingCards('mediaList');
}
function buildingCard(b){
  const fp = b.distinct_unfilmed_floorplans ? `${b.distinct_unfilmed_floorplans} unfilmed FPs · ${b.total_available_units || 0} units` : (b.floorplan_count ? `${b.floorplan_count} FPs` : (b.floorplan_visibility || 'FP count unknown'));
  const sub = [b.neighborhood, b.management_company, fp].filter(Boolean).join(' · ');
  const badges = [statusBadge(b.media_status), ...badgesFor(b).slice(0,5).map(x=>badgeHtml(x, x==='DNP'?'red':x==='Tour24'?'blue':''))].join('');
  return `<article class="card" data-building="${esc(b.building_key)}"><div><div class="card-title">${esc(b.building_name)}</div><div class="card-sub">${esc(sub)}</div><div class="badges">${badges}</div></div><div class="status-pill">${esc(b.priority || '')}<br>${esc(b.status || b.building_status || '')}</div></article>`;
}
function wireBuildingCards(id){ document.querySelectorAll(`#${id} [data-building]`).forEach(el=>el.onclick=()=>openBuilding(el.dataset.building)); }

function getPartnerQueue(){
  try { return JSON.parse(localStorage.getItem(PARTNER_QUEUE_KEY) || '[]').map(String); } catch(e) { return []; }
}
function savePartnerQueue(ids){ localStorage.setItem(PARTNER_QUEUE_KEY, JSON.stringify([...new Set(ids.map(String))])); }
function isPartnerQueued(id){ return getPartnerQueue().includes(String(id)); }
function togglePartnerQueue(id){
  const sid = String(id);
  const q = getPartnerQueue();
  const next = q.includes(sid) ? q.filter(x=>x!==sid) : [...q, sid];
  savePartnerQueue(next); renderPartners(); toast(q.includes(sid) ? 'Removed from today’s queue' : 'Added to today’s queue');
}
function clearPartnerQueue(){ if(confirm('Clear today’s partner queue?')){ savePartnerQueue([]); renderPartners(); toast('Queue cleared'); } }
function renderPartnerQueue(){
  const q = getPartnerQueue();
  const queued = q.map(id=>state.partners.find(p=>String(p.id)===id)).filter(Boolean);
  $('partnerQueue').innerHTML = queued.length ? queued.map(p=>`
    <article class="card queued-partner" data-partner="${esc(p.id)}">
      <div><div class="card-title">${esc(p['Business Name'])}</div><div class="card-sub">${esc([p.Category,p.Neighborhood,p.Address].filter(Boolean).join(' · '))}</div><div class="badges">${badgeHtml(p.Status,p.Status==='YES'?'green':p.Status==='NO'?'red':p.Status==='REVISIT'?'gold':'')}${badgeHtml('Queued today','blue')}</div></div>
      <button class="small-btn" data-queue-partner="${esc(p.id)}">Remove</button>
    </article>`).join('') : `<div class="empty">No businesses queued yet. Tap “Queue today” on partner cards below.</div>`;
  document.querySelectorAll('#partnerQueue [data-partner]').forEach(el=>el.onclick=()=>openPartner(Number(el.dataset.partner)));
  document.querySelectorAll('#partnerQueue [data-queue-partner]').forEach(btn=>btn.onclick=e=>{ e.stopPropagation(); togglePartnerQueue(btn.dataset.queuePartner); });
}
function bindPartnerQueueButtons(scope=document){ scope.querySelectorAll('[data-queue-partner]').forEach(btn=>btn.onclick=e=>{ e.stopPropagation(); togglePartnerQueue(btn.dataset.queuePartner); }); }

function ensurePartnerQueueDom(){
  if($('partnerQueue') && $('clearPartnerQueueBtn')) return;
  const list = $('partnerList');
  if(!list) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="section-head"><div><h3>Today’s partner queue</h3><p class="muted">Businesses you plan to approach today.</p></div><button class="small-btn" id="clearPartnerQueueBtn">Clear queue</button></div><div class="list" id="partnerQueue"></div><div class="section-head"><h3>Partner list</h3></div>`;
  list.parentNode.insertBefore(wrap, list);
  $('clearPartnerQueueBtn').onclick=clearPartnerQueue;
}

function renderPartners(){
  ensurePartnerQueueDom();
  renderPartnerQueue();
  const q=$('partnerSearch').value.trim().toLowerCase(); const f=$('partnerFilter').value;
  const yes=state.partners.filter(p=>p.Status==='YES').map(p=>p['Business Name']);
  $('partnerYesStrip').style.display = yes.length?'block':'none';
  $('partnerYesStrip').innerHTML = yes.length ? `<b>Social proof:</b> ${esc(yes.join(' · '))}` : '';
  let list=state.partners.filter(p=>{
    if(f==='tier1' && !(p.Tier==='1' && p.Status==='Not Approached')) return false;
    if(f==='REVISIT' && !['REVISIT'].includes(p.Status)) return false;
    if(!['all','tier1','REVISIT'].includes(f) && p.Status!==f) return false;
    if(q){ const hay=[p['Business Name'],p.Neighborhood,p.Category,p.Notes].join(' ').toLowerCase(); if(!hay.includes(q)) return false; }
    return true;
  }).sort((a,b)=>(Number(a.Tier)-Number(b.Tier)) || (Number(b.Score)-Number(a.Score)));
  $('partnerList').innerHTML = list.length ? list.map(partnerCard).join('') : `<div class="empty">No partners match.</div>`;
  document.querySelectorAll('#partnerList [data-partner]').forEach(el=>el.onclick=()=>openPartner(Number(el.dataset.partner)));
  bindPartnerQueueButtons($('partnerList'));
}
function partnerCard(p){
  const queued = isPartnerQueued(p.id);
  return `<article class="card" data-partner="${p.id}"><div><div class="card-title">${esc(p['Business Name'])}</div><div class="card-sub">${esc([p.Category,p.Neighborhood,`Score ${p.Score}`].filter(Boolean).join(' · '))}</div><div class="badges">${badgeHtml(p.Status,p.Status==='YES'?'green':p.Status==='NO'?'red':p.Status==='REVISIT'?'gold':'')}${queued?badgeHtml('Queued today','blue'):''}</div></div><div class="status-pill">Tier ${esc(p.Tier)}<br><button class="small-btn" data-queue-partner="${esc(p.id)}">${queued?'Unqueue':'Queue today'}</button></div></article>`;
}

function renderCaptures(){
  const caps=[...state.captures].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
  $('captureList').innerHTML = caps.length ? caps.map(c=>{
    const b=state.buildings.find(x=>x.building_key===c.building_key);
    return `<article class="card capture-item"><div><div class="card-title">${esc(b?.building_name || c.building_key)} · Unit ${esc(c.unit_number)}</div><div class="card-sub">${esc([c.bed_count,c.floorplan_name,c.direction].filter(Boolean).join(' · '))}</div><div class="card-sub">${esc(c.notes||'')}</div></div><button class="small-btn" data-edit-capture="${esc(c.id)}">Edit</button></article>`;
  }).join('') : `<div class="empty">No captured units yet.</div>`;
  document.querySelectorAll('[data-edit-capture]').forEach(b=>b.onclick=()=>openCaptureForm(b.dataset.editCapture));
}

function openBuilding(key){
  const master=findBuilding(key);
  const daily=findDailyForBuilding(master || { building_key:key });
  const b={...(master || {}), ...(daily || {})}; if(!b.building_key) return;
  if(!(b.units_by_floorplan_json || b.units_by_floorplan)){
    refreshFromSheetsQuiet().then(ok=>{
      const freshMaster=findBuilding(key);
      const freshDaily=findDailyForBuilding(freshMaster || b);
      if(ok && freshDaily && (freshDaily.units_by_floorplan_json || freshDaily.units_by_floorplan)){
        toast('Loaded latest floorplans from Sheets');
        openBuilding(freshDaily.building_key || key);
      }
    }).catch(()=>{});
  }
  const caps=state.captures.filter(c=>normKey(c.building_key)===normKey(key));
  const showLeasing = /^Only shows On Market FP/i.test(b.floorplan_visibility || '');
  const leasingHtml = showLeasing ? `
  <h3 style="margin-top:18px">Leasing floorplan follow-up</h3>
  <div class="form">
    <label>Outreach status<select id="leasingStatus">${['','Not Started','Reached out to leasing','Available on YGL','Received','Denied'].map(v=>`<option ${v===(b.leasing_outreach_status||'')?'selected':''}>${v}</option>`).join('')}</select></label>
    <label>Notes<textarea id="leasingNotes">${esc(b.leasing_notes||'')}</textarea></label>
    <label>Floorplan docs link<input id="floorplanDocsLink" value="${esc(b.floorplan_docs_link||'')}" /></label>
    <button class="primary-btn" id="saveLeasingBtn">Save leasing follow-up</button>
  </div>` : '';
  $('buildingDetail').innerHTML = `<h2>${esc(b.building_name)}</h2><p class="muted">${esc([b.neighborhood,b.management_company,b.status].filter(Boolean).join(' · '))}</p><div class="badges">${statusBadge(b.media_status)}${badgesFor(b).map(x=>badgeHtml(x, x==='DNP'?'red':x==='Tour24'?'blue':'')).join('')}</div>
  <div class="actions"><button class="primary-btn" data-add-capture-for="${esc(key)}">Add captured unit</button><button class="small-btn" data-edit-building="${esc(key)}">Edit building info</button>${b.website?`<a class="small-btn" href="${esc(b.website)}" target="_blank" rel="noopener">Website</a>`:''}${b.units_by_floorplan_json || b.units_by_floorplan ? `<button class="small-btn" id="jumpFloorplansBtn">Jump to FPs</button>` : ''}</div>
  <div class="detail-grid two-col">
    ${detail('Floorplans on website', b.floorplan_visibility || 'Unknown')}
    ${detail('# of floorplans', b.floorplan_count_raw || 'Unknown')}
    ${detail('Last filmed', b.last_filmed_date || 'Never / unknown')}
    ${detail('Filmed floorplans', b.filmed_floorplans || 'None logged')}
    ${detail('YouTube notes', b.youtube_notes || b.youtube_status || 'None')}
    ${detail('Notes', b.notes || 'None')}
    ${b.distinct_unfilmed_floorplans ? detail('Daily opportunity', `${b.distinct_unfilmed_floorplans} unfilmed floorplans · ${b.total_available_units || 0} available units · threshold ${b.threshold_required || ''}`) : ''}
  </div>
  ${b.units_by_floorplan_json || b.units_by_floorplan ? `<h3 id="availableFloorplans" style="margin-top:18px">Available floorplans + units to capture</h3><div class="list">${floorplanOpportunitiesHtml(b)}</div>` : ''}
  ${leasingHtml}
  <h3 style="margin-top:18px">Captured units (${caps.length})</h3><div class="list">${caps.length?caps.map(c=>`<div class="detail-row"><b>Unit ${esc(c.unit_number)}</b><div class="muted">${esc([c.bed_count,c.floorplan_name,c.direction].filter(Boolean).join(' · '))}</div><div>${esc(c.notes||'')}</div></div>`).join(''):'<div class="empty">No captured units for this building.</div>'}</div>`;
  openDrawer('buildingDrawer');
  document.querySelector('[data-add-capture-for]')?.addEventListener('click', e=>openCaptureForm(null, e.target.dataset.addCaptureFor));
  document.querySelector('[data-edit-building]')?.addEventListener('click', e=> master ? openBuildingEdit(e.target.dataset.editBuilding) : toast('Pull/update building master first'));
  $('jumpFloorplansBtn')?.addEventListener('click', ()=> $('availableFloorplans')?.scrollIntoView({behavior:'smooth', block:'start'}));
  if(showLeasing){
    $('saveLeasingBtn').onclick=()=>{ b.leasing_outreach_status=$('leasingStatus').value; b.leasing_notes=$('leasingNotes').value; b.floorplan_docs_link=$('floorplanDocsLink').value; save(); toast('Leasing follow-up saved'); render(); };
  }
}
function detail(label,value){ return `<div class="detail-row"><label>${esc(label)}</label><div>${linkify(value)}</div></div>`; }
function linkify(v){ const s=esc(v); return s.replace(/(https?:\/\/[^\s]+)/g,'<a class="link" href="$1" target="_blank" rel="noopener">$1</a>'); }

function setPartnerStatus(id, status){
  const p = state.partners.find(x=>String(x.id)===String(id));
  if(!p) return;
  p.Status = status;
  if(!p['Pitch Date'] && status !== 'Not Approached') p['Pitch Date'] = new Date().toLocaleDateString();
  p.updated_at = new Date().toISOString();
  save();
  renderPartners();
  openPartner(id);
  syncRecordSoon('partners', p, 'Partner status saved');
}

function openPartner(id){
  const p=state.partners.find(x=>x.id===id); if(!p) return;
  $('partnerDetail').innerHTML = `<h2>${esc(p['Business Name'])}</h2><p class="muted">${esc([p.Category,p.Neighborhood,`Tier ${p.Tier}`,`Score ${p.Score}`].join(' · '))}</p><div class="badges">${badgeHtml(p.Status,p.Status==='YES'?'green':p.Status==='NO'?'red':p.Status==='REVISIT'?'gold':'')}${isPartnerQueued(p.id)?badgeHtml('Queued today','blue'):''}</div>
  <div class="actions"><button class="primary-btn" data-queue-partner="${p.id}">${isPartnerQueued(p.id)?'Remove from queue':'Queue today'}</button><button class="primary-btn" data-edit-partner="${p.id}">Edit partner</button>${['YES','NO','REVISIT','Pending','Not Approached'].map(s=>`<button type="button" class="small-btn" data-partner-status="${s}">${s}</button>`).join('')}</div>
  <div class="detail-grid">${detail('Nearby buildings',p['Nearby Buildings']||'')}${detail('Hours',p.Hours||'')}${detail('Phone',p.Phone||'')}${detail('Notes',p.Notes||'')}</div>
  <div class="form"><label>Spoke to<input id="partnerSpoke" value="${esc(p['Spoke To']||'')}" /></label><label>Field notes<textarea id="partnerNotes">${esc(p['Field Notes']||'')}</textarea></label><h3>Owner / next step</h3><label>Owner name<input id="partnerOwnerNameDetail" value="${esc(p['Owner Name']||'')}" /></label><label>Owner contact<input id="partnerOwnerContactDetail" value="${esc(p['Owner Contact']||'')}" /></label><label>Next action<select id="partnerNextActionDetail">${['','Reach Out','Come back','Placement'].map(v=>`<option ${v===(p['Next Action']||'')?'selected':''}>${v}</option>`).join('')}</select></label><button class="primary-btn" id="savePartnerBtn">Save partner</button></div>`;
  openDrawer('partnerDrawer');
  document.querySelector('[data-edit-partner]')?.addEventListener('click', ()=>openPartnerForm(id));
  bindPartnerQueueButtons($('partnerDetail'));
  $('partnerDetail').onclick=e=>{ const btn=e.target.closest('[data-partner-status]'); if(!btn) return; e.preventDefault(); e.stopPropagation(); setPartnerStatus(id, btn.dataset.partnerStatus); };
  $('savePartnerBtn').onclick=()=>{p['Spoke To']=$('partnerSpoke').value;p['Field Notes']=$('partnerNotes').value;p['Owner Name']=$('partnerOwnerNameDetail').value;p['Owner Contact']=$('partnerOwnerContactDetail').value;p['Next Action']=$('partnerNextActionDetail').value;p.updated_at=new Date().toISOString();save();renderPartners();syncRecordSoon('partners', p, 'Partner saved');};
}

function fillBuildingSelect(selected=''){
  $('captureBuilding').innerHTML = state.buildings.slice().sort((a,b)=>a.building_name.localeCompare(b.building_name)).map(b=>`<option value="${esc(b.building_key)}" ${selected===b.building_key?'selected':''}>${esc(b.building_name)} — ${esc(b.neighborhood)}</option>`).join('');
}
function openCaptureForm(id=null, buildingKey=''){
  const c=id ? state.captures.find(x=>x.id===id) : null;
  fillBuildingSelect(c?.building_key || buildingKey);
  $('captureId').value = c?.id || '';
  $('captureUnit').value = c?.unit_number || '';
  $('captureBeds').value = c?.bed_count || '';
  $('captureFloorplan').value = c?.floorplan_name || '';
  $('captureDirection').value = c?.direction || '';
  $('captureNotes').value = c?.notes || '';
  $('captureFormTitle').textContent = c ? 'Edit captured unit' : 'Add captured unit';
  openDrawer('captureDrawer');
}

function openPartnerForm(id=null){
  const p = id ? state.partners.find(x=>x.id===id) : null;
  $('partnerFormTitle').textContent = p ? 'Edit partner' : 'Add partner';
  $('partnerFormId').value = p?.id || '';
  $('partnerBusinessName').value = p?.['Business Name'] || '';
  $('partnerCategory').value = p?.Category || '';
  $('partnerNeighborhood').value = p?.Neighborhood || '';
  $('partnerAddress').value = p?.Address || '';
  $('partnerPhone').value = p?.Phone || '';
  $('partnerTier').value = p?.Tier || '1';
  $('partnerScore').value = p?.Score || '';
  $('partnerStatus').value = p?.Status || 'Not Approached';
  $('partnerNearbyBuildings').value = p?.['Nearby Buildings'] || '';
  $('partnerSeedNotes').value = p?.Notes || '';
  $('partnerOwnerName').value = p?.['Owner Name'] || '';
  $('partnerOwnerContact').value = p?.['Owner Contact'] || '';
  $('partnerNextAction').value = p?.['Next Action'] || '';
  openDrawer('partnerFormDrawer');
}

function savePartnerForm(){
  const rawId = $('partnerFormId').value;
  const id = rawId ? Number(rawId) : nextPartnerId();
  const existing = state.partners.find(p=>p.id===id);
  const rec = existing || { id, 'Spoke To':'', 'Pitch Date':'', Hours:'', 'Field Notes':'', 'Owner Name':'', 'Owner Contact':'', 'Next Action':'' };
  Object.assign(rec, {
    id,
    Status: $('partnerStatus').value,
    Tier: $('partnerTier').value,
    Score: $('partnerScore').value,
    'Business Name': $('partnerBusinessName').value.trim(),
    Category: $('partnerCategory').value.trim(),
    Neighborhood: $('partnerNeighborhood').value.trim(),
    Address: $('partnerAddress').value.trim(),
    Phone: $('partnerPhone').value.trim(),
    'Nearby Buildings': $('partnerNearbyBuildings').value.trim(),
    Notes: $('partnerSeedNotes').value.trim(),
    'Owner Name': $('partnerOwnerName').value.trim(),
    'Owner Contact': $('partnerOwnerContact').value.trim(),
    'Next Action': $('partnerNextAction').value,
  });
  rec.updated_at = new Date().toISOString();
  if(!existing) state.partners.push(rec);
  save(); closeDrawer('partnerFormDrawer'); renderPartners(); syncRecordSoon('partners', rec, 'Partner saved');
}

function nextPartnerId(){ return Math.max(0, ...state.partners.map(p=>Number(p.id)||0)) + 1; }

function openBuildingEdit(key){
  const b = state.buildings.find(x=>x.building_key===key); if(!b) return;
  $('editBuildingKey').value = b.building_key;
  $('editBuildingName').value = b.building_name || '';
  $('editBuildingNeighborhood').value = b.neighborhood || '';
  $('editManagementCompany').value = b.management_company || '';
  $('editWebsite').value = b.website || '';
  $('editMediaStatus').value = b.media_status || 'Needs Review';
  $('editFloorplanVisibility').value = b.floorplan_visibility || '';
  $('editFloorplanCount').value = b.floorplan_count_raw || b.floorplan_count || '';
  $('editMediaStrategy2').value = b.media_strategy_2_raw || '';
  $('editBuildingNotes').value = b.notes || '';
  $('editDnp').checked = !!b.dnp;
  $('editMuteAlerts').checked = !!b.mute_alerts;
  openDrawer('buildingEditDrawer');
}

function saveBuildingEdit(){
  const b = state.buildings.find(x=>x.building_key===$('editBuildingKey').value); if(!b) return;
  b.building_name = $('editBuildingName').value.trim();
  b.neighborhood = $('editBuildingNeighborhood').value.trim();
  b.management_company = $('editManagementCompany').value.trim();
  b.website = $('editWebsite').value.trim();
  b.media_status = $('editMediaStatus').value;
  b.floorplan_visibility = $('editFloorplanVisibility').value;
  b.floorplan_count_raw = $('editFloorplanCount').value.trim();
  b.floorplan_count = /^\d+$/.test(b.floorplan_count_raw) ? Number(b.floorplan_count_raw) : null;
  b.media_strategy_2_raw = $('editMediaStrategy2').value.trim();
  b.notes = $('editBuildingNotes').value.trim();
  b.dnp = $('editDnp').checked;
  b.mute_alerts = $('editMuteAlerts').checked;
  b.badges = badgesFor(b).filter(x=>!['DNP','Muted alerts'].includes(x));
  b.updated_at = new Date().toISOString();
  save(); closeDrawer('buildingEditDrawer'); render(); openBuilding(b.building_key); syncRecordSoon('buildings', b, 'Building saved');
}

function countBy(arr,key){ return arr.reduce((m,x)=>{m[x[key]||'']=(m[x[key]||'']||0)+1; return m;},{}); }
function openDrawer(id){
  const drawer = $(id);
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden','false');
  document.body.classList.add('drawer-open');
  const card = drawer.querySelector('.drawer-card');
  if(card) card.scrollTop = 0;
}
function closeDrawer(id){
  $(id).classList.remove('open');
  $(id).setAttribute('aria-hidden','true');
  if(!document.querySelector('.drawer.open')) document.body.classList.remove('drawer-open');
}

function exportBackup(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=`myapt-field-ops-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href);
}
function csvEscape(v){
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
function downloadText(filename, text, type='text/csv;charset=utf-8'){
  const blob=new Blob([text],{type}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=filename; a.click(); URL.revokeObjectURL(a.href);
}
function exportCsv(filename, rows, cols){
  const lines = [cols.join(',')].concat(rows.map(r=>cols.map(c=>csvEscape(r[c])).join(',')));
  downloadText(filename, lines.join('\n'));
}
function exportBuildingsCsv(){
  const cols=['building_key','building_name','neighborhood','building_size','priority','status','dnp','mute_alerts','floorplan_visibility','floorplan_count_raw','media_status','management_company','website','media_strategy_2_raw','last_filmed_date','filmed_floorplans','leasing_outreach_status','leasing_notes','floorplan_docs_link','notes'];
  exportCsv(`myapt-building-updates-${new Date().toISOString().slice(0,10)}.csv`, state.buildings, cols);
}
function exportPartnersCsv(){
  const cols=['id','Status','Tier','Score','Business Name','Category','Neighborhood','Address','Phone','Hours','Spoke To','Pitch Date','Nearby Buildings','Notes','Field Notes','Owner Name','Owner Contact','Next Action'];
  exportCsv(`myapt-partner-updates-${new Date().toISOString().slice(0,10)}.csv`, state.partners, cols);
}
function exportCapturesCsv(){
  const rows = state.captures.map(c=>({
    ...c,
    building_name: state.buildings.find(b=>b.building_key===c.building_key)?.building_name || '',
  }));
  exportCsv(`myapt-captured-units-${new Date().toISOString().slice(0,10)}.csv`, rows, ['id','building_key','building_name','unit_number','bed_count','floorplan_name','direction','notes','created_at','updated_at']);
}
function exportAllCsvs(){ exportBuildingsCsv(); setTimeout(exportPartnersCsv,150); setTimeout(exportCapturesCsv,300); }
function getSyncEndpoint(){
  const saved = (localStorage.getItem(SYNC_ENDPOINT_KEY) || '').trim();
  if(!saved) return DEFAULT_SYNC_ENDPOINT;
  if(OLD_SYNC_ENDPOINTS.includes(saved)){
    localStorage.setItem(SYNC_ENDPOINT_KEY, DEFAULT_SYNC_ENDPOINT);
    return DEFAULT_SYNC_ENDPOINT;
  }
  return saved;
}
function saveSyncEndpoint(){ localStorage.setItem(SYNC_ENDPOINT_KEY, $('syncEndpoint').value.trim()); toast('Sync endpoint saved'); }
function hasMeaningfulPartnerData(p){
  return ['Status','Spoke To','Pitch Date','Field Notes','Owner Name','Owner Contact','Next Action'].some(k=>String(p?.[k]||'').trim()) || String(p?.Status||'') !== 'Not Approached';
}
function mergeByKey(remote=[], local=[], key='id'){
  const map = new Map();
  remote.forEach(r=>map.set(String(r[key]), {...r}));
  local.forEach(l=>{
    const k=String(l[key]);
    if(!k || k==='undefined') return;
    const r=map.get(k);
    if(!r) map.set(k, {...l});
    else map.set(k, {...r, ...Object.fromEntries(Object.entries(l).filter(([_,v])=>v!=='' && v!=null))});
  });
  return [...map.values()];
}
async function syncRecord(type, record){
  const url = getSyncEndpoint();
  if(!url || !record) return false;
  const res = await fetch(url, { method:'POST', body: JSON.stringify({ action:'upsert', type, record }) });
  const payload = await res.json();
  if(!payload.ok) throw new Error(payload.error || `${type} sync failed`);
  return true;
}
function syncRecordSoon(type, record, label='Saved'){
  syncRecord(type, record).then(()=>toast(`${label} + synced`)).catch(err=>toast(`${label} locally — sync failed`));
}
async function pullFromSheets(){
  const url = getSyncEndpoint();
  if(!url){ toast('Add sync endpoint first'); return; }
  const res = await fetch(url, { method:'GET' });
  const payload = await res.json();
  if(!payload.ok) throw new Error(payload.error || 'Pull failed');
  const data = payload.data || {};
  state.buildings = data.buildings?.length ? mergeByKey(data.buildings, state.buildings, 'building_key') : state.buildings;
  state.partners = data.partners?.length ? mergeByKey(data.partners, state.partners, 'id') : state.partners;
  state.captures = mergeByKey(data.captures || [], state.captures || [], 'id');
  state.daily = data.daily || [];
  localStorage.setItem(DAILY_KEY, JSON.stringify(state.daily));
  save(); render(); toast('Pulled + merged Sheets data');
}
async function pushToSheets(){
  const url = getSyncEndpoint();
  if(!url){ toast('Add sync endpoint first'); return; }
  const res = await fetch(url, { method:'POST', body: JSON.stringify({ action:'replaceAll', data: state }) });
  const payload = await res.json();
  if(!payload.ok) throw new Error(payload.error || 'Push failed');
  toast('Pushed data to Sheets');
}
async function refreshFromSheetsQuiet(){
  const url = getSyncEndpoint();
  if(!url) return false;
  const res = await fetch(url, { method:'GET' });
  const payload = await res.json();
  if(!payload.ok) return false;
  const data = payload.data || {};
  if(data.buildings?.length) state.buildings = mergeByKey(data.buildings, state.buildings, 'building_key');
  if(data.partners?.length) state.partners = mergeByKey(data.partners, state.partners, 'id');
  state.captures = mergeByKey(data.captures || [], state.captures || [], 'id');
  state.daily = data.daily || [];
  localStorage.setItem(DAILY_KEY, JSON.stringify(state.daily));
  save();
  return true;
}
async function refreshStaticDailySnapshot(){
  const res = await fetch(`daily-opportunities.json?v=${APP_VERSION}`, { cache: 'no-store' });
  const payload = await res.json();
  const rows = payload.data || payload.daily || [];
  if(!payload.ok || !rows.length) return false;
  const currentTs = new Date((state.daily || [])[0]?.generated_at || 0).getTime() || 0;
  const nextTs = new Date(rows[0]?.generated_at || payload.generated_at || 0).getTime() || 0;
  if(!state.daily?.length || nextTs >= currentTs){
    state.daily = rows;
    localStorage.setItem(DAILY_KEY, JSON.stringify(rows));
    save();
  }
  return true;
}
function parseCsv(text){
  const rows=[]; let cur='', row=[], q=false;
  for(let i=0;i<text.length;i++){ const ch=text[i], next=text[i+1]; if(ch==='"'&&q&&next==='"'){cur+='"';i++;} else if(ch==='"'){q=!q;} else if(ch===','&&!q){row.push(cur);cur='';} else if((ch==='\n'||ch==='\r')&&!q){ if(ch==='\r'&&next==='\n')i++; row.push(cur); if(row.some(v=>v!=='')) rows.push(row); row=[]; cur=''; } else cur+=ch; }
  row.push(cur); if(row.some(v=>v!=='')) rows.push(row); const headers=rows.shift()||[]; return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]||''])));
}

function refreshTodayOnLaunch(){
  // iOS Home Screen apps have separate storage from Safari, so always hydrate Daily rows on launch.
  refreshFromSheetsQuiet()
    .catch(()=>false)
    .then(ok => ok ? true : refreshStaticDailySnapshot())
    .then(ok=>{ if(ok){ render(); } })
    .catch(()=>{});
}

function init(){
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
  document.querySelectorAll('[data-tab-jump]').forEach(b=>b.onclick=()=>setTab(b.dataset.tabJump));
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeDrawer(b.dataset.close));
  ['mediaSearch','mediaStatusFilter','partnerSearch','partnerFilter'].forEach(id=>$(id).addEventListener('input', render));
  $('settingsBtn').onclick=()=>{ $('syncEndpoint').value=getSyncEndpoint(); openDrawer('settingsDrawer'); };
  $('saveSyncEndpointBtn').onclick=saveSyncEndpoint;
  $('pullSheetsBtn').onclick=()=>pullFromSheets().catch(err=>toast(err.message));
  $('pushSheetsBtn').onclick=()=>pushToSheets().catch(err=>toast(err.message));
  $('quickCaptureBtn').onclick=()=>openCaptureForm();
  $('clearPartnerQueueBtn') && ($('clearPartnerQueueBtn').onclick=clearPartnerQueue);
  $('addPartnerBtn').onclick=()=>openPartnerForm();
  $('exportStateBtn').onclick=exportBackup; $('exportJsonBtn').onclick=exportBackup;
  $('exportBuildingsCsvBtn').onclick=exportBuildingsCsv;
  $('exportPartnersCsvBtn').onclick=exportPartnersCsv;
  $('exportAllCsvBtn').onclick=exportAllCsvs;
  $('partnerForm').onsubmit=e=>{ e.preventDefault(); savePartnerForm(); };
  $('buildingEditForm').onsubmit=e=>{ e.preventDefault(); saveBuildingEdit(); };
  $('captureForm').onsubmit=e=>{ e.preventDefault(); const id=$('captureId').value || `cap-${Date.now()}`; const existing=state.captures.find(c=>c.id===id); const rec={id,building_key:$('captureBuilding').value,unit_number:$('captureUnit').value,bed_count:$('captureBeds').value,floorplan_name:$('captureFloorplan').value,direction:$('captureDirection').value,notes:$('captureNotes').value,created_at:existing?.created_at||new Date().toISOString(),updated_at:new Date().toISOString()}; if(existing) Object.assign(existing,rec); else state.captures.push(rec); save(); closeDrawer('captureDrawer'); render(); syncRecordSoon('captures', rec, 'Capture saved'); };
  $('resetBtn').onclick=()=>{ if(confirm('Reset local myAPT Field Ops data to seed?')){ localStorage.removeItem(STORE_KEY); state=loadState(); toast('Reset complete'); closeDrawer('settingsDrawer'); render(); }};
  $('restoreJson').onchange=async e=>{ const f=e.target.files[0]; if(!f)return; state=JSON.parse(await f.text()); save(); toast('Backup restored'); render(); };
  $('dailyImport').onchange=async e=>{ const f=e.target.files[0]; if(!f)return; const text=await f.text(); let data=f.name.endsWith('.json')?JSON.parse(text):parseCsv(text); state.daily=data; localStorage.setItem(DAILY_KEY, JSON.stringify(data)); save(); toast('Daily opportunities imported'); renderToday(); };
  render();
  refreshTodayOnLaunch();
}
init();
