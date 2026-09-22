import { $, state } from "./state.js";

import { startSession, login, logout, showLogin } from "./auth.js";

import { loadMaster, renderMaster, openMaster, deleteMaster } from "./master.js";

import { loadUsers, openUser, bindUserActions } from "./users.js";

import { loadLog } from "./logs.js";

import { bindPacking, loadPacking } from "./packing.js";

import { bindLoading, loadLoading } from "./loading.js";

import { bindMatching, loadMatching } from "./matching.js";

import { bindDPV, loadDPV } from "./dpv.js";

function closeMenu() {
    document.body.classList.remove("menu-open");

    $("menuBtn")?.setAttribute("aria-expanded", "false");
}

function showPage(page) {
    const pages = ["scan", "packing", "loading", "matching", "shipments", "master", "log", "users"];

    pages.forEach((name) => {
        const element = $("page-" + name);

        if (element) {
            element.classList.toggle("hidden", name !== page);
        }
    });

    document.querySelectorAll(".nav button").forEach((button) => {
        button.classList.toggle("active", button.dataset.page === page);
    });

    switch (page) {
        case "scan":
            window.setTimeout(() => {
                $("scanInput")?.focus();
            }, 80);

            break;

        case "packing":
            loadPacking();

            break;

        case "loading":
            loadLoading();

            break;

        case "matching":
            loadMatching();

            break;

        case "shipments":
            loadDPV();

            break;

        case "master":
            if (state.me?.role === "ADMIN") {
                loadMaster();
            }

            break;

        case "log":
            if (state.me?.role === "ADMIN") {
                loadLog();
            }

            break;

        case "users":
            if (state.me?.role === "ADMIN") {
                loadUsers();
            }

            break;
    }

    closeMenu();
}

function bindEvents() {
    $("loginBtn")?.addEventListener("click", login);

    $("loginPass")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            login();
        }
    });

    $("logoutBtn")?.addEventListener("click", logout);

    document.querySelectorAll(".nav button").forEach((button) => {
        button.addEventListener("click", () => {
            showPage(button.dataset.page);
        });
    });

    $("menuBtn")?.addEventListener("click", () => {
        const isOpen = document.body.classList.toggle("menu-open");

        $("menuBtn")?.setAttribute("aria-expanded", String(isOpen));
    });

    $("menuOverlay")?.addEventListener("click", closeMenu);

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMenu();
        }
    });

    $("masterSearch")?.addEventListener("input", renderMaster);

    $("addMasterBtn")?.addEventListener("click", openMaster);

    $("masterRows")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-delete-master]");

        if (button) {
            deleteMaster(button.dataset.deleteMaster);
        }
    });

    $("addUserBtn")?.addEventListener("click", openUser);

    $("logSearch")?.addEventListener("input", loadLog);

    $("logPetugas")?.addEventListener("change", loadLog);

    $("modal")?.addEventListener("click", (event) => {
        if (event.target.id === "modal" || event.target.closest('[data-action="close-modal"]')) {
            const modal = $("modal");

            const content = $("modalContent");

            modal?.classList.add("hidden");

            if (content) {
                content.innerHTML = "";
            }
        }
    });
}

window.addEventListener("app:ready", () => {
    showPage("scan");
});

bindEvents();

bindUserActions();

bindPacking();

bindLoading();

bindMatching();

bindDPV();

showLogin();

startSession();
