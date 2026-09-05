import { state, $, busy, toast, esc } from './state.js';
import { api } from './api.js';

export async function loadLog(){
  busy(true);
  try{
    const selected=$('logPetugas').value;
    const r=await api('getLog',{q:$('logSearch').value,petugas:selected});
    if(!r.success) throw new Error(r.message||'Gagal memuat log.');
    state.logRows=r.rows||[];

    $('logRows').innerHTML=state.logRows.length
      ? `<table class="table"><thead><tr><th>Waktu</th><th>UPC</th><th>Barang</th><th>Petugas</th></tr></thead><tbody>${state.logRows.map(x=>`<tr><td>${esc(x.timestamp)}</td><td>${esc(x.upc)}</td><td><b>${esc(x.name)}</b><br><span class="muted">${esc(x.sku)}</span></td><td>${esc(x.petugas)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">Belum ada log scan.</div>';

    const names=Array.isArray(r.petugas)?r.petugas:[];
    $('logPetugas').innerHTML='<option value="">Semua petugas</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
    $('logPetugas').value=names.includes(selected)?selected:'';
  }catch(e){
    console.error(e);
    toast(e.message||'Gagal memuat log.',true);
  }finally{busy(false);}
}
