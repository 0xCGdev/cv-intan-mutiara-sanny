import { state, $, esc, busy, toast } from './state.js';
import { api } from './api.js';

export function applyData(data){
  state.todayRows = Array.isArray(data?.rows) ? data.rows : [];
  updateStats(data?.summary || {});
  renderToday();
  if($('todayLabel')) $('todayLabel').textContent = data?.today ? 'Tanggal: ' + data.today : '';
}

export function updateStats(s){
  $('statSku').textContent=s.totalSku||0;
  $('statQty').textContent=s.totalQty||0;
  $('statScan').textContent=s.totalScan||0;
  $('statOps').textContent=s.operators||0;
}

export function showLast(x){
  $('lastResult').innerHTML=`<div class="last-title">SCAN BERHASIL</div><div class="last-name">${esc(x.name)}</div><div class="last-meta">SKU: ${esc(x.sku)} · UPC: ${esc(x.upc)}</div><div class="last-qty">Qty hari ini: ${x.qty} · Petugas: ${esc((x.operators||[]).join(', '))}</div>`;
}

export function showLastError(m){
  $('lastResult').innerHTML=`<div class="last-title" style="color:var(--danger)">SCAN GAGAL</div><div class="last-name" style="color:var(--danger)">UPC Tidak Ditemukan</div><div class="last-meta">${esc(m)}</div>`;
}

function tableHtml(){
  if(!state.todayRows.length) return '<div class="empty">Belum ada barang yang discan hari ini.</div>';
  return `<table class="table"><thead><tr><th>UPC</th><th>Barang</th><th>Qty</th><th>Petugas</th><th>Scan Terakhir</th></tr></thead><tbody>${state.todayRows.map(r=>`<tr><td>${esc(r.upc)}</td><td><b>${esc(r.name)}</b><br><span class="muted">${esc(r.sku)}</span></td><td class="qty">${r.qty}</td><td>${esc(r.operators)}</td><td>${esc(r.lastScan||'')}</td></tr>`).join('')}</tbody></table>`;
}

export function renderToday(){
  const html=tableHtml();
  $('miniRows').innerHTML=html;
  $('shipmentRows').innerHTML=html;
}

export async function refreshToday(){
  if(!state.token) return;
  busy(true);
  try{
    const r=await api('getAppData');
    if(!r.success) throw new Error(r.message||'Gagal memuat pengiriman hari ini.');
    state.me=r.user;
    applyData(r);
  }catch(e){
    toast(e.message||'Gagal memuat pengiriman hari ini.',true);
  }finally{busy(false);}
}
