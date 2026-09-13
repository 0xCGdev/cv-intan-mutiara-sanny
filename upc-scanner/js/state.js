export const state = { token: localStorage.getItem('upc_token') || '', me: null, todayRows: [], masterRows: [], logRows: [], cameraScanner: null, cameraRunning: false };
export const $ = id => document.getElementById(id);
export function setToken(token){ state.token = token || ''; if(token) localStorage.setItem('upc_token', token); else localStorage.removeItem('upc_token'); }
export function busy(value){ $('loader')?.classList.toggle('hidden', !value); }
export function toast(message, error=false){ const el=$('toast'); if(!el)return; el.textContent=message; el.className='toast'+(error?' error':''); el.classList.remove('hidden'); clearTimeout(window.__toastTimer); window.__toastTimer=setTimeout(()=>el.classList.add('hidden'),2400); }
export function esc(value){ return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
