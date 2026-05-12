const STORE_KEY = 'myapt_inventory_searcher_v1';
const ENDPOINT_KEY = 'myapt_inventory_endpoint_v1';
const DEFAULT_ENDPOINT = '';

let state = loadState();
let filtered = [];

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function money(n){ const x = Number(String(n ?? '').replace(/[^0-9.]/g,'')); return x ? `$${Math.round(x).toLocaleString()}` : 'Price TBD'; }
function num(n){ const x = Number(String(n ?? '').replace(/[^0-9.]/g,'')); return Number.isFinite(x) ? x : 0; }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }

function normalizeUnit(raw, idx=0){
  const pick = (...keys) => keys.map(k => raw?.[k]).find(v => v !== undefined && v !== null && String(v).trim() !== '');
  const building = pick('building_name','property_name','property','building','name','Building Name','Property Name') || '';
  const unit = pick('unit_number','unit','unit_name','Unit','Unit Number','name') || '';
  const neighborhood = pick('neighborhood','Neighborhood','area','Area') || '';
  return {
    id: String(pick('id','unit_id','Unit ID') || `${building}-${unit}-${idx}`),
    building_key: pick('building_key','Building Key') || '',
    building_name: building || 'Unknown property',
    neighborhood,
    unit_number: unit,
    beds: pick('beds','bed','bedrooms','Bed','Beds','Bedrooms') ?? '',
    baths: pick('baths','bath','bathrooms','Bath','Baths','Bathrooms') ?? '',
    sqft: pick('sqft','square_feet','Sqft','SQFT','Square Feet') ?? '',
    price: pick('price','rent','market_rent','effective_rent','Price','Rent','Market Rent','Effective Rent') ?? '',
    available_date: pick('available_date','availability_date','move_date','available','Available Date','Move Date','Available') ?? '',
    floorplan_name: pick('floorplan_name','floorplan','Floorplan','Floor Plan') ?? '',
    address: pick('address','Address') ?? '',
    url: pick('url','website','link','URL','Website','Link') ?? '',
    raw,
  };
}
function loadState(){
  const stored = localStorage.getItem(STORE_KEY);
  if(stored){ try { return JSON.parse(stored); } catch(e){} }
  return { units: (window.MYAPT_INVENTORY_SEED || []).map(normalizeUnit), updated_at: null, source: 'sample' };
}
function save(){ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function dateValue(s){ const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; }
function formatDate(s){ const d = dateValue(s); return d ? d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : 'Move date TBD'; }
function bedLabel(v){ const n = Number(v); return n === 0 ? 'Studio' : n ? `${n} bed` : 'Beds TBD'; }
function bathLabel(v){ const n = Number(v); return n ? `${Number.isInteger(n) ? n : n.toFixed(1)} bath` : 'Baths TBD'; }
function badge(label, cls=''){ return `<span class="badge ${cls}">${esc(label)}</span>`; }

function populateFilters(){
  const units = state.units || [];
  const beds = [...new Set(units.map(u=>String(u.beds)).filter(v=>v!==''))].sort((a,b)=>Number(a)-Number(b));
  const baths = [...new Set(units.map(u=>String(u.baths)).filter(v=>v!==''))].sort((a,b)=>Number(a)-Number(b));
  const hood = [...new Set(units.map(u=>u.neighborhood).filter(Boolean))].sort();
  $('bedsFilter').innerHTML = '<option value="any">Any beds</option>' + beds.map(v=>`<option value="${esc(v)}">${esc(Number(v)===0?'Studio':`${v} bed`)}</option>`).join('');
  $('bathsFilter').innerHTML = '<option value="any">Any baths</option>' + baths.map(v=>`<option value="${esc(v)}">${esc(v)} bath</option>`).join('');
  $('neighborhoodFilter').innerHTML = '<option value="any">Any neighborhood</option>' + hood.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
}

function applyFilters(){
  const q = $('searchInput').value.trim().toLowerCase();
  const beds = $('bedsFilter').value;
  const baths = $('bathsFilter').value;
  const hood = $('neighborhoodFilter').value;
  const min = num($('minPriceFilter').value);
  const max = num($('maxPriceFilter').value);
  const moveBy = $('moveDateFilter').value ? new Date($('moveDateFilter').value + 'T23:59:59') : null;
  filtered = (state.units || []).filter(u => {
    if(beds !== 'any' && String(u.beds) !== beds) return false;
    if(baths !== 'any' && String(u.baths) !== baths) return false;
    if(hood !== 'any' && u.neighborhood !== hood) return false;
    const price = num(u.price);
    if(min && (!price || price < min)) return false;
    if(max && (!price || price > max)) return false;
    if(moveBy){ const d = dateValue(u.available_date); if(!d || d > moveBy) return false; }
    if(q){ const hay = [u.building_name,u.unit_number,u.neighborhood,u.floorplan_name,u.address,u.building_key].join(' ').toLowerCase(); if(!hay.includes(q)) return false; }
    return true;
  });
  sortFiltered();
  render();
}
function sortFiltered(){
  const sort = $('sortSelect').value;
  filtered.sort((a,b)=>{
    if(sort==='dateAsc') return (dateValue(a.available_date)?.getTime() || Infinity) - (dateValue(b.available_date)?.getTime() || Infinity);
    if(sort==='bedsDesc') return Number(b.beds || -1) - Number(a.beds || -1);
    if(sort==='sqftDesc') return num(b.sqft) - num(a.sqft);
    return (num(a.price) || Infinity) - (num(b.price) || Infinity);
  });
}
function renderStats(){
  const prices = filtered.map(u=>num(u.price)).filter(Boolean);
  const soonest = filtered.map(u=>dateValue(u.available_date)).filter(Boolean).sort((a,b)=>a-b)[0];
  const hoods = new Set(filtered.map(u=>u.neighborhood).filter(Boolean)).size;
  $('statsGrid').innerHTML = [
    ['Matches', filtered.length],
    ['Avg price', prices.length ? money(prices.reduce((a,b)=>a+b,0)/prices.length) : '—'],
    ['Neighborhoods', hoods],
    ['Soonest', soonest ? soonest.toLocaleDateString(undefined,{month:'short',day:'numeric'}) : '—'],
  ].map(([l,v])=>`<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
}
function unitCard(u){
  const meta = [u.neighborhood, u.floorplan_name, u.sqft ? `${u.sqft} sqft` : '', u.unit_number ? `Unit ${u.unit_number}` : ''].filter(Boolean).join(' · ');
  return `<article class="card" data-unit="${esc(u.id)}"><div><div class="card-title">${esc(u.building_name)}</div><div class="card-sub">${esc(meta)}</div><div class="badges">${badge(bedLabel(u.beds),'blue')}${badge(bathLabel(u.baths),'gold')}${badge(formatDate(u.available_date),'green')}</div></div><div class="price-pill">${esc(money(u.price))}</div></article>`;
}
function render(){
  renderStats();
  $('resultsTitle').textContent = `${filtered.length.toLocaleString()} available unit${filtered.length===1?'':'s'}`;
  $('resultsSub').textContent = state.source === 'live' ? `Synced ${state.updated_at ? new Date(state.updated_at).toLocaleString() : 'recently'} from Inventory LIVE.` : 'Sample data shown. Add the Apps Script endpoint in Settings to pull Inventory LIVE.';
  $('inventoryList').innerHTML = filtered.length ? filtered.map(unitCard).join('') : '<div class="empty">No units match those filters.</div>';
  document.querySelectorAll('[data-unit]').forEach(el=>el.onclick=()=>openUnit(el.dataset.unit));
}
function openUnit(id){
  const u = (state.units || []).find(x=>x.id===id); if(!u) return;
  const rawRows = Object.entries(u.raw || {}).filter(([,v])=>v !== '' && v != null).slice(0,40).map(([k,v])=>`<div class="detail-row"><label>${esc(k)}</label><div>${esc(v)}</div></div>`).join('');
  $('unitDetail').innerHTML = `<div class="eyebrow">${esc(u.neighborhood || 'Inventory')}</div><h2>${esc(u.building_name)}${u.unit_number ? ` · Unit ${esc(u.unit_number)}` : ''}</h2><div class="unit-meta">${badge(money(u.price),'gold')}${badge(bedLabel(u.beds),'blue')}${badge(bathLabel(u.baths),'blue')}${badge(formatDate(u.available_date),'green')}</div><div class="detail-grid">${rawRows}</div>${u.url ? `<div class="actions"><a class="primary-btn" href="${esc(u.url)}" target="_blank" rel="noopener">Open listing</a></div>` : ''}`;
  openDrawer('unitDrawer');
}
async function sync(){
  const endpoint = localStorage.getItem(ENDPOINT_KEY) || DEFAULT_ENDPOINT;
  if(!endpoint){ openDrawer('settingsDrawer'); toast('Add the inventory endpoint first'); return; }
  $('syncBtn').disabled = true; $('syncBtn').textContent = 'Refreshing…';
  try{
    const res = await fetch(endpoint, { cache:'no-store' });
    const json = await res.json();
    const rows = Array.isArray(json) ? json : (json.data?.units || json.units || json.inventory || []);
    if(!rows.length) throw new Error('No inventory rows returned');
    state = { units: rows.map(normalizeUnit), updated_at: new Date().toISOString(), source: 'live' };
    save(); populateFilters(); applyFilters(); toast(`Loaded ${state.units.length.toLocaleString()} units`);
  }catch(err){ toast('Sync failed: ' + err.message); }
  finally{ $('syncBtn').disabled = false; $('syncBtn').textContent = 'Refresh'; }
}
function clearFilters(){ ['searchInput','minPriceFilter','maxPriceFilter','moveDateFilter'].forEach(id=>$(id).value=''); ['bedsFilter','bathsFilter','neighborhoodFilter'].forEach(id=>$(id).value='any'); applyFilters(); }
function exportCsv(){
  const cols = ['building_name','unit_number','neighborhood','beds','baths','sqft','price','available_date','floorplan_name','address','url'];
  const csv = [cols.join(','), ...filtered.map(u=>cols.map(c=>`"${String(u[c] ?? '').replace(/"/g,'""')}"`).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download = `myapt-inventory-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
}
function openDrawer(id){ $(id).classList.add('open'); $(id).setAttribute('aria-hidden','false'); }
function closeDrawer(id){ $(id).classList.remove('open'); $(id).setAttribute('aria-hidden','true'); }
function bind(){
  ['searchInput','bedsFilter','bathsFilter','neighborhoodFilter','minPriceFilter','maxPriceFilter','moveDateFilter','sortSelect'].forEach(id=>$(id).addEventListener('input', applyFilters));
  $('syncBtn').onclick = sync; $('clearFiltersBtn').onclick = clearFilters; $('exportCsvBtn').onclick = exportCsv;
  $('settingsBtn').onclick = ()=>{ $('endpointInput').value = localStorage.getItem(ENDPOINT_KEY) || DEFAULT_ENDPOINT; openDrawer('settingsDrawer'); };
  $('saveEndpointBtn').onclick = ()=>{ localStorage.setItem(ENDPOINT_KEY, $('endpointInput').value.trim()); closeDrawer('settingsDrawer'); toast('Endpoint saved'); };
  $('loadSampleBtn').onclick = ()=>{ state={units:(window.MYAPT_INVENTORY_SEED||[]).map(normalizeUnit),updated_at:null,source:'sample'}; save(); populateFilters(); applyFilters(); closeDrawer('settingsDrawer'); };
  document.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>closeDrawer(btn.dataset.close));
  document.querySelectorAll('.drawer').forEach(d=>d.addEventListener('click',e=>{ if(e.target===d) closeDrawer(d.id); }));
}
bind(); populateFilters(); applyFilters();
