import { $, state, busy, toast } from './state.js';
import { startSession, login, logout, showLogin } from './auth.js';
import { applyData, refreshToday } from './dashboard.js';
import { bindScanner, closeModal } from './scanner.js';
import { loadMaster, renderMaster, openMaster, deleteMaster } from './master.js';
import { loadUsers, openUser, bindUserActions } from './users.js';
import { loadLog } from './logs.js';

function closeMenu(){ document.body.classList.remove('menu-open'); $('menuBtn')?.setAttribute('aria-expanded','false'); }

function showPage(page){
  ['scan','shipments','master','log','users'].forEach(p=>$('page-'+p).classList.toggle('hidden',p!==page));
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  if(page==='master' && state.me?.role==='ADMIN')loadMaster();
  if(page==='log' && state.me?.role==='ADMIN')loadLog();
  if(page==='users' && state.me?.role==='ADMIN')loadUsers();
  if(page==='shipments')refreshToday();
  if(page==='scan')window.setTimeout(()=>$('scanInput')?.focus(),80);
  closeMenu();
}

function bindEvents(){
  $('loginBtn').addEventListener('click',login);$('loginPass').addEventListener('keydown',e=>{if(e.key==='Enter')login();});$('logoutBtn').addEventListener('click',()=>logout());
  document.querySelectorAll('.nav button').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page)));
  $('menuBtn')?.addEventListener('click',()=>{ const open=document.body.classList.toggle('menu-open'); $('menuBtn').setAttribute('aria-expanded',String(open)); });
  $('menuOverlay')?.addEventListener('click',closeMenu);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
  $('masterSearch').addEventListener('input',renderMaster);$('addMasterBtn').addEventListener('click',openMaster);$('addUserBtn').addEventListener('click',openUser);
  $('logSearch').addEventListener('input',()=>loadLog());$('logPetugas').addEventListener('change',()=>loadLog());
  $('modal').addEventListener('click',e=>{if(e.target.id==='modal'||e.target.closest('[data-action="close-modal"]'))closeModal();const btn=e.target.closest('[data-delete-master]');if(btn)deleteMaster(btn.dataset.deleteMaster);});
}
window.addEventListener('app:ready',e=>{applyData(e.detail);showPage('scan');});

bindEvents();bindUserActions();bindScanner();showLogin();startSession();
