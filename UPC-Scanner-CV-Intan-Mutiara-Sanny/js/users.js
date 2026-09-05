import { state, $, busy, toast, esc } from './state.js';
import { api } from './api.js';
import { closeModal } from './scanner.js';

export async function loadUsers(){
  busy(true);
  try{
    const r=await api('getUsers');
    if(!r.success) throw new Error(r.message||'Gagal memuat petugas.');
    state.userRows=r.rows||[];
    renderUsers();
  }catch(e){
    console.error(e);
    toast(e.message||'Gagal memuat petugas.',true);
  }finally{busy(false);}
}

function renderUsers(){
  const rows=state.userRows||[];
  $('userRows').innerHTML=rows.length
    ? `<table class="table"><thead><tr><th>Username</th><th>Nama Petugas</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.username)}</b></td><td>${esc(x.name)}</td><td>${esc(x.role)}</td><td>${esc(x.status)}</td><td><button class="btn btn-soft" data-edit-user="${esc(x.id)}">Edit</button></td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">Belum ada petugas.</div>';
}

export function openUser(id=''){
  const existing=state.userRows.find(x=>x.id===id);
  $('modalContent').innerHTML=`<div class="modal-head"><h3>${existing?'Edit Petugas':'Tambah Petugas'}</h3><button class="close" data-action="close-modal">×</button></div><label>Username</label><input id="uUser" class="input" value="${esc(existing?.username||'')}"><label>Nama Petugas</label><input id="uName" class="input" value="${esc(existing?.name||'')}"><label>Password ${existing?'(kosong = tetap)':''}</label><input id="uPass" class="input" type="password"><label>Role</label><select id="uRole" class="input"><option ${existing?.role==='PETUGAS'?'selected':''}>PETUGAS</option><option ${existing?.role==='ADMIN'?'selected':''}>ADMIN</option></select><label>Status</label><select id="uStatus" class="input"><option ${existing?.status==='AKTIF'?'selected':''}>AKTIF</option><option ${existing?.status==='NONAKTIF'?'selected':''}>NONAKTIF</option></select><button id="saveUserBtn" class="btn btn-primary full">Simpan</button>`;
  $('modal').classList.remove('hidden');
  $('saveUserBtn').addEventListener('click',()=>saveUser(id));
  setTimeout(()=>$('uUser').focus(),100);
}

async function saveUser(id){
  busy(true);
  try{
    const r=await api('saveUser',{id,username:$('uUser').value,name:$('uName').value,password:$('uPass').value,role:$('uRole').value,status:$('uStatus').value});
    if(!r.success) throw new Error(r.message||'Gagal menyimpan petugas.');
    closeModal(); toast(r.message||'Petugas tersimpan.'); await loadUsers();
  }catch(e){toast(e.message||'Gagal menyimpan petugas.',true);}
  finally{busy(false);}
}

export function bindUserActions(){
  $('userRows').addEventListener('click',e=>{
    const btn=e.target.closest('[data-edit-user]');
    if(btn) openUser(btn.dataset.editUser);
  });
}
