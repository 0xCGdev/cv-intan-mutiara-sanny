import { state, setToken } from './state.js';

// PHP proxy berada di hosting yang sama dengan HTML.
// PHP yang meneruskan request ke Google Apps Script sehingga browser
// tidak terkena masalah CORS dari Apps Script.
const API_URL = './api/api.php';

export async function api(action, data = {}, useToken = true) {
  let response;

  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        action,
        token: useToken ? state.token : '',
        data
      })
    });
  } catch (e) {
    throw new Error('Tidak dapat terhubung ke API PHP. Periksa hosting dan koneksi internet.');
  }

  const text = await response.text();
  let result;

  try {
    result = JSON.parse(text);
  } catch (e) {
    console.error('Respons API bukan JSON:', text);
    throw new Error('Server mengembalikan respons yang bukan JSON. Periksa api/api.php.');
  }

  if (!response.ok) {
    throw new Error(result.message || ('HTTP ' + response.status));
  }

  if (!result.success && result.code === 'SESSION_EXPIRED') {
    setToken('');
  }

  return result;
}
