/**
 * myAPT Field Ops Tracker — Google Sheets sync endpoint
 *
 * Deploy as a Google Apps Script Web App attached to the myAPT tracker sheet.
 * The static web app can pull/push three tabs:
 *   - Buildings
 *   - Partners
 *   - Captures
 *
 * Deployment settings:
 *   Execute as: Me
 *   Who has access: Anyone with the link, or your Google Workspace only if the app is used signed-in.
 *
 * Security note: this endpoint is for operational tracker data only. Do not store passwords/secrets here.
 */

const SHEET_ID = '145Oo8qAjU-tSNGzpPnyNgjsdRbdngg2yHotlqOv6Jh4';

const SHEETS = {
  buildings: {
    name: 'Buildings',
    key: 'building_key',
    columns: ['building_key','building_name','neighborhood','building_size','priority','status','dnp','mute_alerts','floorplan_visibility','floorplan_count_raw','media_status','management_company','website','media_strategy_2_raw','last_filmed_date','filmed_floorplans','leasing_outreach_status','leasing_notes','floorplan_docs_link','notes']
  },
  partners: {
    name: 'Partners',
    key: 'id',
    columns: ['id','Status','Tier','Score','Business Name','Category','Neighborhood','Address','Phone','Hours','Spoke To','Pitch Date','Nearby Buildings','Notes','Field Notes','Last Updated']
  },
  captures: {
    name: 'Captures',
    key: 'id',
    columns: ['id','building_key','unit_number','bed_count','floorplan_name','direction','notes','created_at','updated_at']
  },
  daily: {
    name: 'Daily Capture Opportunities',
    key: 'building_key',
    columns: ['generated_at','building_key','building_name','neighborhood','priority','building_status','dnp_flag','mute_alerts','building_size','media_status','badges','floorplan_visibility','known_floorplan_count','different_tier_finishes','distinct_unfilmed_floorplans','threshold_required','total_available_units','units_by_floorplan_json','last_filmed_date','filmed_floorplans','leasing_outreach_status','leasing_notes','floorplan_docs_link','website','management_company','notes','diagnostic_type','diagnostic_message']
  }
};

function doGet() {
  try {
    return jsonOutput({ ok: true, data: readAll() });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'replaceAll') {
      replaceAll(body.data || {});
      return jsonOutput({ ok: true, action: 'replaceAll' });
    }
    if (body.action === 'upsert') {
      upsert(body.type, body.record || {});
      return jsonOutput({ ok: true, action: 'upsert', type: body.type });
    }
    return jsonOutput({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err) });
  }
}

function readAll() {
  return {
    buildings: readSheet('buildings'),
    partners: readSheet('partners'),
    captures: readSheet('captures'),
    daily: readSheet('daily')
  };
}

function replaceAll(data) {
  writeSheet('buildings', data.buildings || []);
  writeSheet('partners', data.partners || []);
  writeSheet('captures', data.captures || []);
  if (data.daily) writeSheet('daily', data.daily || []);
}

function readSheet(type) {
  const cfg = SHEETS[type];
  const sheet = getSheet(cfg);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(row => row.some(v => v !== '')).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function writeSheet(type, rows) {
  const cfg = SHEETS[type];
  const sheet = getSheet(cfg);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, cfg.columns.length).setValues([cfg.columns]);
  if (rows.length) {
    const values = rows.map(row => cfg.columns.map(col => row[col] == null ? '' : row[col]));
    sheet.getRange(2, 1, values.length, cfg.columns.length).setValues(values);
  }
  formatHeader(sheet, cfg.columns.length);
}

function upsert(type, record) {
  const cfg = SHEETS[type];
  if (!cfg) throw new Error('Bad type: ' + type);
  const sheet = getSheet(cfg);
  ensureHeader(sheet, cfg);
  if (type === 'partners') record['Last Updated'] = new Date().toISOString();
  const row = cfg.columns.map(col => record[col] == null ? '' : record[col]);
  const keyValue = String(record[cfg.key] || '');
  const lastRow = sheet.getLastRow();
  if (keyValue && lastRow >= 2) {
    const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === keyValue) {
        sheet.getRange(i + 2, 1, 1, cfg.columns.length).setValues([row]);
        return;
      }
    }
  }
  sheet.appendRow(row);
}

function getSheet(cfg) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(cfg.name);
  if (!sheet) sheet = ss.insertSheet(cfg.name);
  ensureHeader(sheet, cfg);
  return sheet;
}

function ensureHeader(sheet, cfg) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, cfg.columns.length).setValues([cfg.columns]);
    formatHeader(sheet, cfg.columns.length);
    return;
  }
  const firstCell = sheet.getRange(1, 1).getValue();
  if (String(firstCell) !== cfg.columns[0]) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, cfg.columns.length).setValues([cfg.columns]);
    formatHeader(sheet, cfg.columns.length);
  }
}

function formatHeader(sheet, width) {
  sheet.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#303030').setFontColor('#FAF6EE');
  sheet.setFrozenRows(1);
}

function jsonOutput(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
