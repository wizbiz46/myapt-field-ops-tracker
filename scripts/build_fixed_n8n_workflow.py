import json, copy, pathlib, textwrap

ROOT = pathlib.Path('/Users/ncsniper./.openclaw/workspace')
orig_path = pathlib.Path('/Users/ncsniper./.openclaw/media/inbound/myAPT_-_Daily_Filming_Alert---c2c7c1d2-bb93-43c7-8992-2bed64c0f153.json')
out_path = ROOT/'myapt-unified-tracker-v1'/'n8n'/'myAPT_Daily_Filming_Alert_FIXED_Daily_Capture_Opportunities.json'
out_path.parent.mkdir(exist_ok=True)
w=json.load(open(orig_path))
w['name']='myAPT - Daily Filming Alert + Daily Capture Opportunities'
w['active']=False

normalize_code = r"""
const masters = $('Get Building Master').all();
const today = new Date().toISOString().split('T')[0];
const generatedAt = new Date().toISOString();
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() + 2);

function norm(v) { return (v ?? '').toString().trim(); }
function isTrue(v) { return v === true || norm(v).toUpperCase() === 'TRUE'; }
function includesAny(s, needles) { const x = norm(s).toLowerCase(); return needles.some(n => x.includes(n)); }
function normalizeMedia(master) {
  const strategy2 = norm(master['Media Strategy 2']).toLowerCase();
  const raw = [master['Media Strategy 2'], master['Media Strategy'], master['Does building have youtube channel'], master['Youtube Notes']]
    .map(norm).join(' ').toLowerCase();
  const badges = [];
  const fpVisibility = norm(master['Availble FPs on website']);
  if (norm(master.DNP) === 'DNP' || norm(master.Status).includes('DNP')) badges.push('DNP');
  if (isTrue(master.skip_building)) badges.push('Muted alerts');
  if (raw.includes('tour24')) badges.push('Tour24');
  if (/only shows on market/i.test(fpVisibility)) badges.push('On-market FPs only');
  if (/all fp shown/i.test(fpVisibility)) badges.push('All FPs shown');
  if (norm(master['Different tiers finishes']).toLowerCase() === 'yes') badges.push('Different tier finishes');

  let mediaStatus;
  if (!strategy2) mediaStatus = 'Needs Review';
  else if (strategy2.includes('complete')) mediaStatus = 'Complete';
  else if (strategy2.includes('partial') || strategy2.includes('youtube + noi')) mediaStatus = 'Partial coverage — capture needed';
  else if (strategy2.includes('reach out') || strategy2.includes('ask')) mediaStatus = 'Leasing follow-up needed';
  else if (strategy2.includes('youtube')) mediaStatus = 'YouTube usable for MVP';
  else if (strategy2.includes('need to film') || strategy2.includes('noi') || raw.includes('yo chicago') || raw.includes('voiced') || raw.includes('tour24')) mediaStatus = 'No coverage — film needed';
  else mediaStatus = 'Needs Review';
  if (badges.includes('Tour24') && mediaStatus !== 'Complete') mediaStatus = 'No coverage — film needed';
  return { mediaStatus, badges };
}
function parseAvailDate(availStr) {
  if (!availStr) return null;
  if (availStr instanceof Date) return availStr;
  const s = norm(availStr);
  const slash = s.split('/').map(Number);
  if (slash.length === 3 && slash.every(n => !Number.isNaN(n))) return new Date(slash[2], slash[0] - 1, slash[1]);
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;
  return null;
}

const masterLookup = {};
masters.forEach(m => {
  if (m.json.building_key) masterLookup[norm(m.json.building_key).toUpperCase()] = m.json;
});

const buildingAgg = {};
const unmappedBuildings = new Set();

const inventoryItems = $('Get Today\'s Inventory').all();
for (const item of inventoryItems) {
  const unit = item.json;
  const availDate = parseAvailDate(unit.available_date);
  if (!availDate || availDate > cutoff) continue;

  const bk = norm(unit.building_key).toUpperCase();
  if (!bk) continue;
  const master = masterLookup[bk];
  if (!master) { unmappedBuildings.add(bk); continue; }
  if (master.cooldown_until && new Date(master.cooldown_until) > new Date(today)) continue;

  const beds = parseInt(unit.beds) || 0;
  const baths = parseFloat(unit.baths) || 0;
  const sqft = parseInt(unit.sqft) || 0;
  if (!sqft) continue;
  const unitNumber = norm(unit.unit_number || unit.unit || unit.name);
  const fpId = `${bk}-${beds}BR${baths}BA-${sqft}`;

  if (!buildingAgg[bk]) {
    const filmedSet = new Set(norm(master.filmed_floorplans).split('|').map(f => f.trim().toUpperCase()).filter(Boolean));
    buildingAgg[bk] = { master, filmedFPs: filmedSet, unfilmedFPs: new Set(), unitsByFloorplan: {}, totalUnits: 0 };
  }

  const agg = buildingAgg[bk];
  agg.totalUnits++;
  if (agg.filmedFPs.has(fpId.toUpperCase())) continue;
  agg.unfilmedFPs.add(fpId);
  if (!agg.unitsByFloorplan[fpId]) agg.unitsByFloorplan[fpId] = { beds, baths, sqft, units: [], unit_count: 0 };
  if (unitNumber) agg.unitsByFloorplan[fpId].units.push(unitNumber);
  agg.unitsByFloorplan[fpId].unit_count = agg.unitsByFloorplan[fpId].units.length;
}

const qualifiers = [];
for (const buildingKey of Object.keys(buildingAgg)) {
  const agg = buildingAgg[buildingKey];
  const master = agg.master;
  const distinctUnfilmedFPs = agg.unfilmedFPs.size;
  const size = norm(master.building_size).toLowerCase();
  let threshold;
  if (size === 'large') threshold = 7;
  else if (size === 'small') threshold = 3;
  else continue;
  if (distinctUnfilmedFPs < threshold) continue;

  const media = normalizeMedia(master);
  qualifiers.push({
    generated_at: generatedAt,
    building_name: master.building_name,
    building_key: buildingKey,
    neighborhood: master.neighborhood || master.Neighborhood || '',
    building_size: master.building_size,
    priority: master.Priority || 'B',
    building_status: master.Status || '',
    dnp_flag: norm(master.DNP) === 'DNP' || norm(master.Status).includes('DNP'),
    mute_alerts: isTrue(master.skip_building),
    media_status: media.mediaStatus,
    badges: media.badges,
    floorplan_visibility: master['Availble FPs on website'] || '',
    known_floorplan_count: master['# of Floorplans'] || '',
    different_tier_finishes: master['Different tiers finishes'] || '',
    distinct_unfilmed_floorplans: distinctUnfilmedFPs,
    threshold_required: threshold,
    total_available_units: agg.totalUnits,
    units_by_floorplan: agg.unitsByFloorplan,
    last_filmed_date: master.last_filmed_date || 'Never',
    filmed_floorplans: master.filmed_floorplans || '',
    leasing_outreach_status: master.leasing_outreach_status || '',
    leasing_notes: master.leasing_notes || '',
    floorplan_docs_link: master.floorplan_docs_link || '',
    website: master.Website || '',
    management_company: master['Management Company'] || '',
    notes: master.notes || '',
  });
}

qualifiers.sort((a, b) => {
  const aTier = String(a.priority || 'Z');
  const bTier = String(b.priority || 'Z');
  if (aTier !== bTier) return aTier.localeCompare(bTier);
  return (b.distinct_unfilmed_floorplans - b.threshold_required) - (a.distinct_unfilmed_floorplans - a.threshold_required);
});

return [
  ...qualifiers.map(q => ({ json: q })),
  ...(unmappedBuildings.size > 0 ? [{ json: { generated_at: generatedAt, _diagnostic: true, diagnostic_type: 'unmapped_buildings', diagnostic_message: [...unmappedBuildings].join(', '), unmapped_buildings: [...unmappedBuildings].join(', '), unmapped_count: unmappedBuildings.size } }] : [])
];
""".strip()

format_code = r"""
const allItems = $input.all();
const urgentStatuses = new Set(['No coverage — film needed', 'Partial coverage — capture needed', 'Leasing follow-up needed', 'Needs Review']);
const qualifiers = allItems.filter(i => !i.json._diagnostic && !i.json.mute_alerts && urgentStatuses.has(i.json.media_status));
const diagnostic = allItems.find(i => i.json._diagnostic);
const TELEGRAM_LIMIT = 3800;
const bedLabel = (beds) => beds === 0 ? 'Studio' : beds === 1 ? '1 Bed' : `${beds} Bed`;
const blocks = qualifiers.map((i, idx) => {
  const q = i.json;
  const fpLines = Object.values(q.units_by_floorplan || {})
    .sort((a,b) => (b.beds - a.beds) || (b.sqft - a.sqft))
    .map(fp => `   ${bedLabel(fp.beds)} / ${fp.baths}BA / ${fp.sqft} sqft — ${fp.units.join(' | ')}`);
  const badges = Array.isArray(q.badges) && q.badges.length ? `\n   ${q.badges.join(' · ')}` : '';
  return `${idx + 1}. 🎬 <b>${q.building_name}</b> [${q.building_size}] — ${q.neighborhood}\n` +
    `   <b>${q.distinct_unfilmed_floorplans}</b> unfilmed floorplans (need ${q.threshold_required}) · ${q.media_status}${badges}\n` +
    `   Last filmed: ${q.last_filmed_date}\n\n` + fpLines.join('\n');
});
const header = `<b>myAPT Filming Alert</b> — ${qualifiers.length} building(s) ready`;
let diagnosticBlock = '';
if (diagnostic && diagnostic.json.unmapped_count > 0) diagnosticBlock = `\n\n⚠️ <b>${diagnostic.json.unmapped_count} buildings</b> in YGL not in master sheet:\n<code>${diagnostic.json.unmapped_buildings}</code>`;
const messages = [];
let currentMsg = header;
let partNum = 1;
for (const block of blocks) {
  const candidate = currentMsg + '\n\n' + block;
  if (candidate.length > TELEGRAM_LIMIT) { messages.push(currentMsg); partNum++; currentMsg = `<b>myAPT Filming Alert (cont. ${partNum})</b>\n\n` + block; }
  else currentMsg = candidate;
}
if (diagnosticBlock) {
  if ((currentMsg + diagnosticBlock).length <= TELEGRAM_LIMIT) currentMsg += diagnosticBlock;
  else { messages.push(currentMsg); currentMsg = `<b>myAPT Alert — Unmapped Buildings</b>${diagnosticBlock}`; }
}
messages.push(currentMsg);
return messages.map(msg => ({ json: { message: msg } }));
""".strip()

prepare_rows_code = r"""
const rows = $input.all().map(i => {
  const q = i.json;
  if (q._diagnostic) {
    return { json: {
      generated_at: q.generated_at,
      diagnostic_type: q.diagnostic_type || 'diagnostic',
      diagnostic_message: q.diagnostic_message || q.unmapped_buildings || '',
    }};
  }
  return { json: {
    generated_at: q.generated_at,
    building_key: q.building_key,
    building_name: q.building_name,
    neighborhood: q.neighborhood,
    priority: q.priority,
    building_status: q.building_status,
    dnp_flag: q.dnp_flag,
    mute_alerts: q.mute_alerts,
    building_size: q.building_size,
    media_status: q.media_status,
    badges: Array.isArray(q.badges) ? q.badges.join(' | ') : q.badges,
    floorplan_visibility: q.floorplan_visibility,
    known_floorplan_count: q.known_floorplan_count,
    different_tier_finishes: q.different_tier_finishes,
    distinct_unfilmed_floorplans: q.distinct_unfilmed_floorplans,
    threshold_required: q.threshold_required,
    total_available_units: q.total_available_units,
    units_by_floorplan_json: JSON.stringify(q.units_by_floorplan || {}),
    last_filmed_date: q.last_filmed_date,
    filmed_floorplans: q.filmed_floorplans,
    leasing_outreach_status: q.leasing_outreach_status,
    leasing_notes: q.leasing_notes,
    floorplan_docs_link: q.floorplan_docs_link,
    website: q.website,
    management_company: q.management_company,
    notes: q.notes,
    diagnostic_type: '',
    diagnostic_message: '',
  }};
});
return rows;
""".strip()

# Update existing code nodes
for n in w['nodes']:
    if n['name']=='Normalize & Score':
        n['parameters']['jsCode']=normalize_code
    if n['name']=='Format Alert Message':
        n['parameters']['jsCode']=format_code

# Find master sheet document fields to reuse
doc = None
for n in w['nodes']:
    if n['name']=='Get Building Master':
        doc = copy.deepcopy(n['parameters']['documentId'])
        creds = copy.deepcopy(n.get('credentials'))
        break
sheet_daily = {"__rl": True, "value": "Daily Capture Opportunities", "mode": "name", "cachedResultName": "Daily Capture Opportunities"}

clear_node={
 "parameters": {"operation":"clear", "documentId": doc, "sheetName": sheet_daily, "range":"A:AD"},
 "id":"fixed-clear-daily-capture-opportunities",
 "name":"Clear Daily Capture Opportunities",
 "type":"n8n-nodes-base.googleSheets",
 "typeVersion":4.5,
 "position":[32,240],
 "credentials": creds,
 "notes":"Clears current snapshot before writing fresh Daily Capture Opportunities rows. If import asks, select the Alerts Sheet 2 spreadsheet and the Daily Capture Opportunities tab."
}
prepare_node={
 "parameters":{"jsCode":prepare_rows_code},
 "id":"fixed-prepare-daily-capture-rows",
 "name":"Prepare Daily Capture Rows",
 "type":"n8n-nodes-base.code",
 "typeVersion":2,
 "position":[256,240]
}
append_node={
 "parameters": {"operation":"append", "documentId": doc, "sheetName": sheet_daily, "columns":{"mappingMode":"autoMapInputData","value":{},"matchingColumns":[],"schema":[],"attemptToConvertTypes":False,"convertFieldsToString":False}, "options":{}},
 "id":"fixed-append-daily-capture-opportunities",
 "name":"Append Daily Capture Opportunities",
 "type":"n8n-nodes-base.googleSheets",
 "typeVersion":4.5,
 "position":[480,240],
 "credentials": creds,
 "notes":"Appends normalized opportunity rows after Clear Daily Capture Opportunities."
}
# Remove if exists then add
w['nodes']=[n for n in w['nodes'] if n['name'] not in ['Clear Daily Capture Opportunities','Prepare Daily Capture Rows','Append Daily Capture Opportunities']]
w['nodes'].extend([clear_node,prepare_node,append_node])
# Rewire: Get Building Master -> Clear -> Normalize. Normalize branches to IF and Prepare. Prepare -> Append.
conn=w['connections']
conn['Get Building Master']={"main":[[{"node":"Clear Daily Capture Opportunities","type":"main","index":0}]]}
conn['Clear Daily Capture Opportunities']={"main":[[{"node":"Normalize & Score","type":"main","index":0}]]}
conn['Normalize & Score']={"main":[[{"node":"Any Qualifiers?","type":"main","index":0},{"node":"Prepare Daily Capture Rows","type":"main","index":0}]]}
conn['Prepare Daily Capture Rows']={"main":[[{"node":"Append Daily Capture Opportunities","type":"main","index":0}]]}
# Leave existing IF->Format->Telegram
w['versionId']='fixed-daily-capture-opportunities-v1'
json.dump(w, open(out_path,'w'), indent=2)
print(out_path)
