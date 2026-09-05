const SHEETS = {
  USERS: 'USERS',
  MASTER: 'MASTER_DATA',
  LOG: 'LOG_SCAN'
};

const HEADERS = {
  USERS: ['ID', 'USERNAME', 'PASSWORD_HASH', 'NAMA_PETUGAS', 'ROLE', 'STATUS'],
  MASTER: ['UPC', 'SKU', 'NAMA_BARANG'],
  LOG: ['TIMESTAMP', 'UPC', 'SKU', 'NAMA_BARANG', 'PETUGAS', 'USER_ID']
};

/**
 * API backend.
 * Frontend is hosted separately, so doPost() receives JSON requests.
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    const action = String(body.action || '');
    const token = body.token || '';
    const data = body.data;

    const handlers = {
      login: () => login(data?.username, data?.password),
      logout: () => logout(token),
      getAppData: () => getAppData(token),
      scanUPC: () => scanUPC(token, data?.upc),
      getMaster: () => getMaster(token),
      saveMaster: () => saveMaster(token, data),
      deleteMaster: () => deleteMaster(token, data?.upc),
      getUsers: () => getUsers(token),
      saveUser: () => saveUser(token, data),
      getLog: () => getLog(token, data)
    };

    if (!handlers[action]) return json_({ success: false, code: 'BAD_ACTION', message: 'Aksi API tidak dikenal.' });
    return json_(handlers[action]());
  } catch (err) {
    return json_({ success: false, code: 'SERVER_ERROR', message: String(err && err.message || err) });
  }
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      service: 'UPC Scanner API',
      message: 'API aktif.'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, SHEETS.USERS, HEADERS.USERS);
  ensureSheet_(ss, SHEETS.MASTER, HEADERS.MASTER);
  ensureSheet_(ss, SHEETS.LOG, HEADERS.LOG);

  const master = ss.getSheetByName(SHEETS.MASTER);
  master.getRange('A:A').setNumberFormat('@');

  const users = ss.getSheetByName(SHEETS.USERS);
  users.getRange('A:F').setVerticalAlignment('middle');

  if (users.getLastRow() < 2) {
    users.appendRow([
      'USR-001',
      'admin',
      hashPassword_('admin123'),
      'Administrator',
      'ADMIN',
      'AKTIF'
    ]);
  }

  return 'Setup selesai. Login awal: admin / admin123. Segera ganti password.';
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sh;
}

function login(username, password) {
  username = String(username || '').trim();
  password = String(password || '');
  if (!username || !password) return fail_('LOGIN_INVALID', 'Username dan password wajib diisi.');

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.USERS);
  const rows = getRows_(sh);
  const found = rows.find(r => String(r.USERNAME).toLowerCase() === username.toLowerCase());

  if (!found ||
      String(found.STATUS).toUpperCase() !== 'AKTIF' ||
      String(found.PASSWORD_HASH) !== hashPassword_(password)) {
    return fail_('LOGIN_INVALID', 'Username atau password salah.');
  }

  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    'session_' + token,
    JSON.stringify({
      id: String(found.ID),
      username: String(found.USERNAME),
      name: String(found.NAMA_PETUGAS),
      role: String(found.ROLE).toUpperCase()
    }),
    21600
  );

  return ok_({
    token,
    user: {
      id: String(found.ID),
      username: String(found.USERNAME),
      name: String(found.NAMA_PETUGAS),
      role: String(found.ROLE).toUpperCase()
    }
  });
}

function logout(token) {
  if (token) CacheService.getScriptCache().remove('session_' + token);
  return ok_();
}

function getAppData(token) {
  const user = requireSession_(token);
  return ok_({
    user,
    today: getTodayName_(),
    summary: getTodaySummary_(),
    rows: getTodayRows_()
  });
}

function scanUPC(token, upc) {
  const user = requireSession_(token);
  upc = normalizeUPC_(upc);

  if (!upc) return fail_('UPC_EMPTY', 'UPC kosong.');
  if (upc.length > 80) return fail_('UPC_INVALID', 'UPC terlalu panjang.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.getActive();
    const master = ss.getSheetByName(SHEETS.MASTER);
    if (!master) return fail_('MASTER_NOT_FOUND', 'Sheet MASTER_DATA tidak ditemukan.');

    // Baca nilai yang tampil di Google Sheets agar leading zero UPC tetap terbaca.
    const masterValues = master.getDataRange().getDisplayValues();
    if (masterValues.length < 2) {
      return fail_('UPC_NOT_FOUND', 'UPC belum terdaftar di Master Data.', { upc });
    }
    const headers = masterValues[0].map(String);
    const masterRows = masterValues.slice(1).map(function(row) {
      const obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i]; });
      return obj;
    });
    const item = masterRows.find(function(row) {
      return normalizeUPC_(row.UPC) === upc;
    });

    if (!item) {
      return fail_('UPC_NOT_FOUND', 'UPC belum terdaftar di Master Data.', { upc });
    }

    const sheetName = getTodayName_();
    const day = ensureSheet_(ss, sheetName, [
      'UPC', 'SKU', 'NAMA_BARANG', 'QTY', 'PETUGAS', 'LAST_SCAN'
    ]);
    day.getRange('A:A').setNumberFormat('@');

    const values = day.getDataRange().getValues();
    let rowIndex = -1;

    for (let i = 1; i < values.length; i++) {
      if (normalizeUPC_(values[i][0]) === upc) {
        rowIndex = i + 1;
        break;
      }
    }

    let qty;
    let operators = [];

    if (rowIndex === -1) {
      qty = 1;
      operators = [user.name];
      day.appendRow([
        upc,
        String(item.SKU || ''),
        String(item.NAMA_BARANG || ''),
        qty,
        operators.join(', '),
        new Date()
      ]);
      rowIndex = day.getLastRow();
    } else {
      const old = day.getRange(rowIndex, 1, 1, 6).getValues()[0];
      qty = (Number(old[3]) || 0) + 1;

      operators = String(old[4] || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      if (!operators.includes(user.name)) operators.push(user.name);

      day.getRange(rowIndex, 1, 1, 6).setValues([[
        upc,
        String(item.SKU || ''),
        String(item.NAMA_BARANG || ''),
        qty,
        operators.join(', '),
        new Date()
      ]]);
    }

    const log = ss.getSheetByName(SHEETS.LOG);
    log.appendRow([
      new Date(),
      upc,
      String(item.SKU || ''),
      String(item.NAMA_BARANG || ''),
      user.name,
      user.id
    ]);
    log.getRange('B:B').setNumberFormat('@');

    return ok_({
      item: {
        upc,
        sku: String(item.SKU || ''),
        name: String(item.NAMA_BARANG || ''),
        qty,
        operators
      },
      today: sheetName,
      summary: getTodaySummary_(),
      rows: getTodayRows_()
    });
  } finally {
    lock.releaseLock();
  }
}

function getTodayRowsForUser(token) {
  requireSession_(token);
  return ok_({ rows: getTodayRows_() });
}

function getTodayRows_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(getTodayName_());
  if (!sh || sh.getLastRow() < 2) return [];

  return sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().map(r => ({
    upc: String(r[0] ?? ''),
    sku: String(r[1] ?? ''),
    name: String(r[2] ?? ''),
    qty: Number(r[3]) || 0,
    operators: String(r[4] ?? ''),
    lastScan: formatDate_(r[5])
  }));
}

function getTodaySummary_() {
  const rows = getTodayRows_();
  return {
    totalSku: rows.length,
    totalQty: rows.reduce((s, r) => s + r.qty, 0),
    totalScan: rows.reduce((s, r) => s + r.qty, 0),
    operators: [...new Set(
      rows.flatMap(r => r.operators.split(',').map(x => x.trim()).filter(Boolean))
    )].length
  };
}

function getMaster(token) {
  requireRole_(token, 'ADMIN');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.MASTER);

  const rows = getRows_(sh).map(r => ({
    upc: normalizeUPC_(r.UPC),
    sku: String(r.SKU || ''),
    name: String(r.NAMA_BARANG || '')
  }));

  return ok_({ rows });
}

function saveMaster(token, data) {
  requireRole_(token, 'ADMIN');
  data = data || {};
  const upc = normalizeUPC_(data.upc);
  const sku = String(data.sku || '').trim();
  const name = String(data.name || '').trim();

  if (!upc || !sku || !name) {
    return fail_('VALIDATION', 'UPC, SKU, dan Nama Barang wajib diisi.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.MASTER);
    sh.getRange('A:A').setNumberFormat('@');
    const rows = getRows_(sh);
    const index = rows.findIndex(r => normalizeUPC_(r.UPC) === upc);

    if (index >= 0) {
      sh.getRange(index + 2, 1, 1, 3).setValues([[upc, sku, name]]);
      return ok_({ message: 'Master Data diperbarui.' });
    }

    sh.appendRow([upc, sku, name]);
    return ok_({ message: 'Master Data ditambahkan.' });
  } finally {
    lock.releaseLock();
  }
}

function deleteMaster(token, upc) {
  requireRole_(token, 'ADMIN');
  upc = normalizeUPC_(upc);

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.MASTER);
  const rows = getRows_(sh);
  const index = rows.findIndex(r => normalizeUPC_(r.UPC) === upc);

  if (index < 0) return fail_('NOT_FOUND', 'Data Master tidak ditemukan.');

  sh.deleteRow(index + 2);
  return ok_({ message: 'Data Master dihapus.' });
}

function getUsers(token) {
  requireRole_(token, 'ADMIN');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.USERS);
  if (!sh) return ok_({ rows: [] });

  const rows = getRows_(sh).map(r => ({
    id: String(r.ID || ''),
    username: String(r.USERNAME || ''),
    name: String(r.NAMA_PETUGAS || ''),
    role: String(r.ROLE || '').toUpperCase(),
    status: String(r.STATUS || '').toUpperCase()
  }));

  return ok_({ rows });
}

function saveUser(token, data) {
  requireRole_(token, 'ADMIN');
  data = data || {};

  const id = String(data.id || '').trim();
  const username = String(data.username || '').trim();
  const password = String(data.password || '');
  const name = String(data.name || '').trim();
  const role = String(data.role || 'PETUGAS').toUpperCase();
  const status = String(data.status || 'AKTIF').toUpperCase();

  if (!username || !name ||
      !['ADMIN', 'PETUGAS'].includes(role) ||
      !['AKTIF', 'NONAKTIF'].includes(status)) {
    return fail_('VALIDATION', 'Data petugas tidak valid.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.USERS);
    const rows = getRows_(sh);
    const duplicate = rows.find(r =>
      String(r.USERNAME).toLowerCase() === username.toLowerCase() &&
      String(r.ID) !== id
    );

    if (duplicate) return fail_('DUPLICATE', 'Username sudah digunakan.');

    if (id) {
      const index = rows.findIndex(r => String(r.ID) === id);
      if (index < 0) return fail_('NOT_FOUND', 'User tidak ditemukan.');

      const oldHash = rows[index].PASSWORD_HASH;
      sh.getRange(index + 2, 1, 1, 6).setValues([[
        id,
        username,
        password ? hashPassword_(password) : oldHash,
        name,
        role,
        status
      ]]);
      return ok_({ message: 'Petugas diperbarui.' });
    }

    if (!password) return fail_('VALIDATION', 'Password wajib diisi untuk user baru.');

    const newId = 'USR-' + Utilities.getUuid().slice(0, 8).toUpperCase();
    sh.appendRow([newId, username, hashPassword_(password), name, role, status]);
    return ok_({ message: 'Petugas ditambahkan.' });
  } finally {
    lock.releaseLock();
  }
}

function getLog(token, filters) {
  requireRole_(token, 'ADMIN');
  filters = filters || {};

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.LOG);
  if (!sh) return ok_({ rows: [] });

  const rows = getRows_(sh);
  const q = String(filters.q || '').toLowerCase().trim();
  const petugas = String(filters.petugas || '').toLowerCase().trim();

  const result = rows
    .filter(r => {
      const hay = [r.UPC, r.SKU, r.NAMA_BARANG, r.PETUGAS].join(' ').toLowerCase();
      return (!q || hay.includes(q)) &&
             (!petugas || String(r.PETUGAS || '').toLowerCase() === petugas);
    })
    .reverse()
    .slice(0, 1000)
    .map(r => ({
      timestamp: formatDate_(r.TIMESTAMP),
      upc: normalizeUPC_(r.UPC),
      sku: String(r.SKU || ''),
      name: String(r.NAMA_BARANG || ''),
      petugas: String(r.PETUGAS || ''),
      userId: String(r.USER_ID || '')
    }));

  // Return the list of active/inactive operators separately so the filter
  // is populated even when a petugas has not scanned anything yet.
  const usersSh = SpreadsheetApp.getActive().getSheetByName(SHEETS.USERS);
  const petugasList = usersSh ? getRows_(usersSh)
    .filter(r => String(r.NAMA_PETUGAS || '').trim())
    .map(r => String(r.NAMA_PETUGAS).trim())
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a.localeCompare(b)) : [];

  return ok_({ rows: result, petugas: petugasList });
}

function requireSession_(token) {
  if (!token) throw new Error('UNAUTHORIZED');

  const raw = CacheService.getScriptCache().get('session_' + token);
  if (!raw) throw new Error('SESSION_EXPIRED');

  return JSON.parse(raw);
}

function requireRole_(token, role) {
  const user = requireSession_(token);
  if (user.role !== role) throw new Error('FORBIDDEN');
  return user;
}

function getRows_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];

  const values = sh.getRange(
    1, 1, sh.getLastRow(), sh.getLastColumn()
  ).getValues();

  const headers = values[0].map(String);

  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function getTodayName_() {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone() ||
             Session.getScriptTimeZone() ||
             'Asia/Jakarta';

  return Utilities.formatDate(new Date(), tz, 'dd-MM-yyyy');
}

function formatDate_(value) {
  if (!value) return '';

  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone() ||
             'Asia/Jakarta';

  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);

  return Utilities.formatDate(d, tz, 'dd-MM-yyyy HH:mm:ss');
}

function normalizeUPC_(value) {
  return String(value ?? '').trim();
}

function hashPassword_(password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(password),
    Utilities.Charset.UTF_8
  );

  return bytes
    .map(b => ('0' + (b & 0xFF).toString(16)).slice(-2))
    .join('');
}

function ok_(data) {
  return { success: true, ...(data || {}) };
}

function fail_(code, message, extra) {
  return { success: false, code, message, ...(extra || {}) };
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
