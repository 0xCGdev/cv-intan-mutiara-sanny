import { $, state, busy, toast } from "./state.js";

import { startSession, login, logout, showLogin } from "./auth.js";

import { applyData, refreshToday } from "./dashboard.js";

import { bindScanner, closeModal } from "./scanner.js";

import { loadMaster, renderMaster, openMaster, deleteMaster } from "./master.js";

import { loadUsers, openUser, bindUserActions } from "./users.js";

import { loadLog } from "./logs.js";

import { bindPacking, loadPacking } from "./packing.js";

import { bindLoading, loadLoading } from "./loading.js";

function closeMenu() {
    document.body.classList.remove("menu-open");
    $("menuBtn")?.setAttribute("aria-expanded", "false");
}

function showPage(page) {
    const pages = ["scan", "packing", "loading", "matching", "shipments", "master", "log", "users"];

    pages.forEach((p) => {
        const el = $("page-" + p);
        if (el) {
            el.classList.toggle("hidden", p !== page);
        }
    });

    document.querySelectorAll(".nav button").forEach((b) => {
        b.classList.toggle("active", b.dataset.page === page);
    });

    // =========================
    // LOAD HALAMAN
    // =========================

    if (page === "scan") {
        window.setTimeout(() => {
            $("scanInput")?.focus();
        }, 80);
    }

    if (page === "packing") {
        loadPacking();
    }

    if (page === "loading") {
        loadLoading();
    }

    if (page === "shipments") {
        refreshToday();
    }

    if (page === "master" && state.me?.role === "ADMIN") {
        loadMaster();
    }

    if (page === "log" && state.me?.role === "ADMIN") {
        loadLog();
    }

    if (page === "users" && state.me?.role === "ADMIN") {
        loadUsers();
    }

    closeMenu();
}

function bindEvents() {
    // =========================
    // LOGIN
    // =========================

    $("loginBtn")?.addEventListener("click", login);

    $("loginPass")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            login();
        }
    });

    // =========================
    // LOGOUT
    // =========================

    $("logoutBtn")?.addEventListener("click", () => {
        logout();
    });

    // =========================
    // NAVIGATION
    // =========================

    document.querySelectorAll(".nav button").forEach((btn) => {
        btn.addEventListener("click", () => {
            showPage(btn.dataset.page);
        });
    });

    // =========================
    // MOBILE MENU
    // =========================

    $("menuBtn")?.addEventListener("click", () => {
        const open = document.body.classList.toggle("menu-open");

        $("menuBtn")?.setAttribute("aria-expanded", String(open));
    });

    $("menuOverlay")?.addEventListener("click", closeMenu);

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeMenu();
        }
    });

    // =========================
    // MASTER DATA
    // =========================

    $("masterSearch")?.addEventListener("input", renderMaster);

    $("addMasterBtn")?.addEventListener("click", openMaster);

    $("masterRows")?.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-delete-master]");

        if (btn) {
            deleteMaster(btn.dataset.deleteMaster);
        }
    });

    // =========================
    // PETUGAS
    // =========================

    $("addUserBtn")?.addEventListener("click", openUser);

    // =========================
    // LOG
    // =========================

    $("logSearch")?.addEventListener("input", () => loadLog());

    $("logPetugas")?.addEventListener("change", () => loadLog());

    // =========================
    // MODAL
    // =========================

    $("modal")?.addEventListener("click", (e) => {
        if (e.target.id === "modal" || e.target.closest('[data-action="close-modal"]')) {
            closeModal();
        }
    });
}

// =========================
// APP READY
// =========================

window.addEventListener("app:ready", (e) => {
    applyData(e.detail);

    showPage("scan");
});

// =========================
// INITIALIZE
// =========================

bindEvents();

bindUserActions();

bindScanner();

bindPacking();

bindLoading();

showLogin();

startSession();
