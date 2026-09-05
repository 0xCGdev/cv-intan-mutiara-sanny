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
 * Web App endpoint.
 * Frontend/PHP sends POST JSON:
 * {
 *   action: 'login',
 *   token: '',
 *   data: {...}
 * }
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({
        success: false,
        code: 'EMPTY_REQUEST',
        message: 'Request kosong.'
      });
    }

    const body = JSON.parse(e.postData.contents);
    const action = String(body.action || '').trim();
    const token = String(body.token || '');
    const data = body.data || {};

    let result;

    switch (action) {
      case 'login':
        result = login(data.username, data.password);
        break;

      case 'logout':
        result = logout(token);
        break;

      case 'getAppData':
        result = getAppData(token);
        break;

      case 'scanUPC':
        result = scanUPC(token, data.upc);
        break;

      case 'getTodayRowsForUser':
        result = getTodayRowsForUser(token);
        break;

      case 'getMaster':
        result = getMaster(token);
        break;

      case 'saveMaster':
        result = saveMaster(token, data);
        break;

      case 'deleteMaster':
        result = deleteMaster(token, data.upc);
        break;

      case 'getUsers':
        result = getUsers(token);
        break;

      case 'saveUser':
        result = saveUser(token, data);
        break;

      case 'getLog':
        result = getLog(token, data);
        break;

      default:
        result = fail_('UNKNOWN_ACTION', 'Action tidak dikenali: ' + action);
    }

    return json_(result);

  } catch (err) {
    console.error(err);

    let message = 'Terjadi kesalahan pada server.';
    let code = 'SERVER_ERROR';

    if (err && err.message) {
      if (err.message === 'UNAUTHORIZED') {
        code = 'UNAUTHORIZED';
        message = 'Sesi tidak valid. Silakan login kembali.';
      } else if (err.message === 'SESSION_EXPIRED') {
        code = 'SESSION_EXPIRED';
        message = 'Sesi telah berakhir. Silakan login kembali.';
      } else if (err.message === 'FORBIDDEN') {
        code = 'FORBIDDEN';
        message = 'Anda tidak memiliki izin untuk melakukan tindakan ini.';
      } else {
        message = err.message;
      }
    }

    return json_({
      success: false,
      code: code,
      message: message
    });
  }
}


/**
 * GET hanya untuk mengecek apakah Web App aktif.
 */
function doGet() {
  return json_({
    success: true,
    service: 'UPC Scanner API',
    message: 'API aktif.'
  });
}


/**
 * Jalankan sekali dari Apps Script untuk membuat sheet awal.
 */
function setup() {
  const ss = SpreadsheetApp.getActive();

  ensureSheet_(ss, SHEETS.USERS, HEADERS.USERS);
  ensureSheet_(ss, SHEETS.MASTER, HEADERS.MASTER);
  ensureSheet_(ss, SHEETS.LOG, HEADERS.LOG);

  const master = ss.getSheetByName(SHEETS.MASTER);
  master.getRange('A:A').setNumberFormat('@');

  const log = ss.getSheetByName(SHEETS.LOG);
  log.getRange('B:B').setNumberFormat('@');

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

  return 'Setup selesai.';
}


function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);

  if (!sh) {
    sh = ss.insertSheet(name);
  }

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

  if (!username || !password) {
    return fail_(
      'LOGIN_INVALID',
      'Username dan password wajib diisi.'
    );
  }

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.USERS);

  if (!sh) {
    return fail_(
      'USERS_NOT_FOUND',
      'Sheet USERS tidak ditemukan.'
    );
  }

  const rows = getRows_(sh);

  const found = rows.find(function(r) {
    return String(r.USERNAME || '').trim().toLowerCase() ===
      username.toLowerCase();
  });

  if (
    !found ||
    String(found.STATUS || '').trim().toUpperCase() !== 'AKTIF' ||
    String(found.PASSWORD_HASH || '') !== hashPassword_(password)
  ) {
    return fail_(
      'LOGIN_INVALID',
      'Username atau password salah.'
    );
  }

  const token = Utilities.getUuid();

  const user = {
    id: String(found.ID || ''),
    username: String(found.USERNAME || ''),
    name: String(found.NAMA_PETUGAS || ''),
    role: String(found.ROLE || '').toUpperCase()
  };

  CacheService.getScriptCache().put(
    'session_' + token,
    JSON.stringify(user),
    21600
  );

  return ok_({
    token: token,
    user: user
  });
}


function logout(token) {
  if (token) {
    CacheService.getScriptCache().remove('session_' + token);
  }

  return ok_();
}


function getAppData(token) {
  const user = requireSession_(token);

  return ok_({
    user: user,
    today: getTodayName_(),
    summary: getTodaySummary_(),
    rows: getTodayRows_()
  });
}


/**
 * Scan:
 * - cari UPC di MASTER_DATA
 * - jika belum ada di sheet hari ini => QTY 1
 * - jika sudah ada => QTY + 1
 * - PETUGAS dibuat unik
 * - setiap scan masuk LOG_SCAN
 */
function scanUPC(token, upc) {
  const user = requireSession_(token);

  upc = normalizeUPC_(upc);

  if (!upc) {
    return fail_('UPC_EMPTY', 'UPC kosong.');
  }

  if (upc.length > 80) {
    return fail_('UPC_INVALID', 'UPC terlalu panjang.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.getActive();
    const master = ss.getSheetByName(SHEETS.MASTER);

    if (!master) {
      return fail_(
        'MASTER_NOT_FOUND',
        'Sheet MASTER_DATA tidak ditemukan.'
      );
    }

    /*
     * PENTING:
     * Gunakan getDisplayValues() agar UPC yang memiliki leading zero
     * tetap dibandingkan sebagai teks sesuai tampilan spreadsheet.
     */
    const masterValues = master.getDataRange().getDisplayValues();

    if (masterValues.length < 2) {
      return fail_(
        'UPC_NOT_FOUND',
        'UPC belum terdaftar di Master Data.',
        { upc: upc }
      );
    }

    const headers = masterValues[0].map(function(h) {
      return String(h).trim();
    });

    const masterRows = masterValues.slice(1).map(function(row) {
      const obj = {};

      headers.forEach(function(header, index) {
        obj[header] = row[index];
      });

      return obj;
    });

    const item = masterRows.find(function(row) {
      return normalizeUPC_(row.UPC) === upc;
    });

    if (!item) {
      return fail_(
        'UPC_NOT_FOUND',
        'UPC belum terdaftar di Master Data.',
        { upc: upc }
      );
    }

    const sheetName = getTodayName_();

    const day = ensureSheet_(
      ss,
      sheetName,
      ['UPC', 'SKU', 'NAMA_BARANG', 'QTY', 'PETUGAS', 'LAST_SCAN']
    );

    day.getRange('A:A').setNumberFormat('@');

    const values = day.getDataRange().getDisplayValues();

    let rowIndex = -1;

    for (let i = 1; i < values.length; i++) {
      if (normalizeUPC_(values[i][0]) === upc) {
        rowIndex = i + 1;
        break;
      }
    }

    let qty = 0;
    let operators = [];

    const sku = String(item.SKU || '');
    const name = String(item.NAMA_BARANG || '');

    if (rowIndex === -1) {
      qty = 1;
      operators = [user.name];

      day.appendRow([
        upc,
        sku,
        name,
        qty,
        operators.join(', '),
        new Date()
      ]);

      rowIndex = day.getLastRow();

    } else {
      const old = day
        .getRange(rowIndex, 1, 1, 6)
        .getDisplayValues()[0];

      qty = Number(old[3]) || 0;
      qty += 1;

      operators = String(old[4] || '')
        .split(',')
        .map(function(s) {
          return s.trim();
        })
        .filter(Boolean);

      if (user.name && !operators.includes(user.name)) {
        operators.push(user.name);
      }

      day.getRange(rowIndex, 1, 1, 6).setValues([[
        upc,
        sku,
        name,
        qty,
        operators.join(', '),
        new Date()
      ]]);
    }

    const log = ss.getSheetByName(SHEETS.LOG);

    if (!log) {
      return fail_(
        'LOG_NOT_FOUND',
        'Sheet LOG_SCAN tidak ditemukan.'
      );
    }

    log.appendRow([
      new Date(),
      upc,
      sku,
      name,
      user.name,
      user.id
    ]);

    log.getRange('B:B').setNumberFormat('@');

    return ok_({
      item: {
        upc: upc,
        sku: sku,
        name: name,
        qty: qty,
        operators: operators
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

  return ok_(getTodayRows_());
}


function getTodayRows_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(getTodayName_());

  if (!sh || sh.getLastRow() < 2) {
    return [];
  }

  const values = sh
    .getRange(2, 1, sh.getLastRow() - 1, 6)
    .getDisplayValues();

  return values.map(function(r) {
    return {
      upc: normalizeUPC_(r[0]),
      sku: String(r[1] || ''),
      name: String(r[2] || ''),
      qty: Number(r[3]) || 0,
      operators: String(r[4] || ''),
      lastScan: String(r[5] || '')
    };
  });
}


function getTodaySummary_() {
  const rows = getTodayRows_();

  const operators = new Set();

  rows.forEach(function(row) {
    String(row.operators || '')
      .split(',')
      .map(function(x) {
        return x.trim();
      })
      .filter(Boolean)
      .forEach(function(name) {
        operators.add(name);
      });
  });

  return {
    totalSku: rows.length,
    totalQty: rows.reduce(function(sum, r) {
      return sum + r.qty;
    }, 0),
    totalScan: rows.reduce(function(sum, r) {
      return sum + r.qty;
    }, 0),
    operators: operators.size
  };
}


/**
 * Master Data selalu dibaca sebagai display text
 * supaya UPC leading zero tidak hilang.
 */
function getMaster(token) {
  requireRole_(token, 'ADMIN');

  const sh = SpreadsheetApp
    .getActive()
    .getSheetByName(SHEETS.MASTER);

  if (!sh) {
    return fail_(
      'MASTER_NOT_FOUND',
      'Sheet MASTER_DATA tidak ditemukan.'
    );
  }

  const values = sh.getDataRange().getDisplayValues();

  if (values.length < 2) {
    return ok_({ rows: [] });
  }

  const headers = values[0].map(function(h) {
    return String(h).trim();
  });

  const rows = values.slice(1).map(function(row) {
    const obj = {};

    headers.forEach(function(header, index) {
      obj[header] = row[index];
    });

    return {
      upc: normalizeUPC_(obj.UPC),
      sku: String(obj.SKU || ''),
      name: String(obj.NAMA_BARANG || '')
    };
  });

  return ok_({
    rows: rows
  });
}


function saveMaster(token, data) {
  requireRole_(token, 'ADMIN');

  data = data || {};

  const upc = normalizeUPC_(data.upc);
  const sku = String(data.sku || '').trim();
  const name = String(data.name || '').trim();

  if (!upc || !sku || !name) {
    return fail_(
      'VALIDATION',
      'UPC, SKU, dan Nama Barang wajib diisi.'
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const sh = SpreadsheetApp
      .getActive()
      .getSheetByName(SHEETS.MASTER);

    if (!sh) {
      return fail_(
        'MASTER_NOT_FOUND',
        'Sheet MASTER_DATA tidak ditemukan.'
      );
    }

    sh.getRange('A:A').setNumberFormat('@');

    const values = sh.getDataRange().getDisplayValues();

    let index = -1;

    for (let i = 1; i < values.length; i++) {
      if (normalizeUPC_(values[i][0]) === upc) {
        index = i - 1;
        break;
      }
    }

    if (index >= 0) {
      sh.getRange(index + 2, 1, 1, 3).setValues([[
        upc,
        sku,
        name
      ]]);

      return ok_({
        message: 'Master Data diperbarui.'
      });
    }

    sh.appendRow([
      upc,
      sku,
      name
    ]);

    return ok_({
      message: 'Master Data ditambahkan.'
    });

  } finally {
    lock.releaseLock();
  }
}


function deleteMaster(token, upc) {
  requireRole_(token, 'ADMIN');

  upc = normalizeUPC_(upc);

  if (!upc) {
    return fail_(
      'VALIDATION',
      'UPC wajib diisi.'
    );
  }

  const sh = SpreadsheetApp
    .getActive()
    .getSheetByName(SHEETS.MASTER);

  if (!sh) {
    return fail_(
      'MASTER_NOT_FOUND',
      'Sheet MASTER_DATA tidak ditemukan.'
    );
  }

  const values = sh.getDataRange().getDisplayValues();

  let rowNumber = -1;

  for (let i = 1; i < values.length; i++) {
    if (normalizeUPC_(values[i][0]) === upc) {
      rowNumber = i + 1;
      break;
    }
  }

  if (rowNumber < 0) {
    return fail_(
      'NOT_FOUND',
      'Data Master tidak ditemukan.'
    );
  }

  sh.deleteRow(rowNumber);

  return ok_({
    message: 'Data Master dihapus.'
  });
}


function getUsers(token) {
  requireRole_(token, 'ADMIN');

  const sh = SpreadsheetApp
    .getActive()
    .getSheetByName(SHEETS.USERS);

  if (!sh) {
    return fail_(
      'USERS_NOT_FOUND',
      'Sheet USERS tidak ditemukan.'
    );
  }

  return ok_(
    getRows_(sh).map(function(r) {
      return {
        id: String(r.ID || ''),
        username: String(r.USERNAME || ''),
        name: String(r.NAMA_PETUGAS || ''),
        role: String(r.ROLE || ''),
        status: String(r.STATUS || '')
      };
    })
  );
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

  if (
    !username ||
    !name ||
    !['ADMIN', 'PETUGAS'].includes(role) ||
    !['AKTIF', 'NONAKTIF'].includes(status)
  ) {
    return fail_(
      'VALIDATION',
      'Data petugas tidak valid.'
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const sh = SpreadsheetApp
      .getActive()
      .getSheetByName(SHEETS.USERS);

    if (!sh) {
      return fail_(
        'USERS_NOT_FOUND',
        'Sheet USERS tidak ditemukan.'
      );
    }

    const rows = getRows_(sh);

    const duplicate = rows.find(function(r) {
      return (
        String(r.USERNAME || '').toLowerCase() ===
          username.toLowerCase() &&
        String(r.ID || '') !== id
      );
    });

    if (duplicate) {
      return fail_(
        'DUPLICATE',
        'Username sudah digunakan.'
      );
    }

    if (id) {
      const index = rows.findIndex(function(r) {
        return String(r.ID || '') === id;
      });

      if (index < 0) {
        return fail_(
          'NOT_FOUND',
          'User tidak ditemukan.'
        );
      }

      const oldHash = String(
        rows[index].PASSWORD_HASH || ''
      );

      sh.getRange(index + 2, 1, 1, 6).setValues([[
        id,
        username,
        password ? hashPassword_(password) : oldHash,
        name,
        role,
        status
      ]]);

      return ok_({
        message: 'Petugas diperbarui.'
      });
    }

    if (!password) {
      return fail_(
        'VALIDATION',
        'Password wajib diisi untuk user baru.'
      );
    }

    const newId =
      'USR-' +
      Utilities.getUuid()
        .slice(0, 8)
        .toUpperCase();

    sh.appendRow([
      newId,
      username,
      hashPassword_(password),
      name,
      role,
      status
    ]);

    return ok_({
      message: 'Petugas ditambahkan.'
    });

  } finally {
    lock.releaseLock();
  }
}


function getLog(token, filters) {
  requireRole_(token, 'ADMIN');

  filters = filters || {};

  const sh = SpreadsheetApp
    .getActive()
    .getSheetByName(SHEETS.LOG);

  if (!sh) {
    return fail_(
      'LOG_NOT_FOUND',
      'Sheet LOG_SCAN tidak ditemukan.'
    );
  }

  const rows = getRows_(sh);

  const q = String(filters.q || '')
    .toLowerCase()
    .trim();

  const petugas = String(filters.petugas || '')
    .toLowerCase()
    .trim();

  return ok_(
    rows
      .filter(function(r) {
        const hay = [
          r.UPC,
          r.SKU,
          r.NAMA_BARANG
        ]
          .join(' ')
          .toLowerCase();

        return (
          (!q || hay.includes(q)) &&
          (
            !petugas ||
            String(r.PETUGAS || '')
              .toLowerCase() === petugas
          )
        );
      })
      .reverse()
      .slice(0, 1000)
      .map(function(r) {
        return {
          timestamp: formatDate_(r.TIMESTAMP),
          upc: normalizeUPC_(r.UPC),
          sku: String(r.SKU || ''),
          name: String(r.NAMA_BARANG || ''),
          petugas: String(r.PETUGAS || '')
        };
      })
  );
}


function requireSession_(token) {
  if (!token) {
    throw new Error('UNAUTHORIZED');
  }

  const raw = CacheService
    .getScriptCache()
    .get('session_' + token);

  if (!raw) {
    throw new Error('SESSION_EXPIRED');
  }

  return JSON.parse(raw);
}


function requireRole_(token, role) {
  const user = requireSession_(token);

  if (
    String(user.role || '').toUpperCase() !==
    String(role || '').toUpperCase()
  ) {
    throw new Error('FORBIDDEN');
  }

  return user;
}


/**
 * Generic reader.
 *
 * Sengaja menggunakan getDisplayValues(), bukan getValues(),
 * agar UPC dibaca sebagai teks sesuai yang terlihat di Sheets.
 */
function getRows_(sh) {
  if (!sh || sh.getLastRow() < 2) {
    return [];
  }

  const values = sh
    .getRange(
      1,
      1,
      sh.getLastRow(),
      sh.getLastColumn()
    )
    .getDisplayValues();

  const headers = values[0].map(function(h) {
    return String(h).trim();
  });

  return values.slice(1).map(function(row) {
    const obj = {};

    headers.forEach(function(header, index) {
      obj[header] = row[index];
    });

    return obj;
  });
}


function getTodayName_() {
  const ss = SpreadsheetApp.getActive();

  const tz =
    ss.getSpreadsheetTimeZone() ||
    Session.getScriptTimeZone() ||
    'Asia/Jakarta';

  return Utilities.formatDate(
    new Date(),
    tz,
    'dd-MM-yyyy'
  );
}


function formatDate_(value) {
  if (!value) {
    return '';
  }

  const ss = SpreadsheetApp.getActive();

  const tz =
    ss.getSpreadsheetTimeZone() ||
    Session.getScriptTimeZone() ||
    'Asia/Jakarta';

  const d =
    value instanceof Date
      ? value
      : new Date(value);

  if (isNaN(d.getTime())) {
    return String(value);
  }

  return Utilities.formatDate(
    d,
    tz,
    'dd-MM-yyyy HH:mm:ss'
  );
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
    .map(function(b) {
      return (
        '0' +
        (b & 0xFF).toString(16)
      ).slice(-2);
    })
    .join('');
}


function ok_(data) {
  return {
    success: true,
    ...(data || {})
  };
}


function fail_(code, message, extra) {
  return {
    success: false,
    code: code,
    message: message,
    ...(extra || {})
  };
}


function json_(data) {
  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}
