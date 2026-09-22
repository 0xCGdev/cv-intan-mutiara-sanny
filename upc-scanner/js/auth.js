import { state, $, setToken, busy, toast } from "./state.js";
import { api } from "./api.js";

export function showLogin() {
    $("loginView").classList.remove("hidden");
    $("appView").classList.add("hidden");

    window.setTimeout(() => {
        $("loginUser")?.focus();
    }, 50);
}

export function enterApp() {
    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");

    $("sidebarUserName").textContent = state.me?.name || state.me?.username || "";

    $("sidebarUserRole").textContent = state.me?.role || "";

    document.querySelectorAll(".admin-only").forEach((element) => {
        element.classList.toggle("hidden", state.me?.role !== "ADMIN");
    });
}

export async function login() {
    const username = $("loginUser").value.trim();
    const password = $("loginPass").value;

    $("loginError").classList.add("hidden");

    if (!username || !password) {
        $("loginError").textContent = "Username dan password wajib diisi.";

        $("loginError").classList.remove("hidden");

        return;
    }

    busy(true);

    try {
        const response = await api(
            "login",
            {
                username,
                password,
            },
            false,
        );

        if (!response?.success) {
            throw new Error(response?.message || "Login gagal.");
        }

        setToken(response.token);
        state.me = response.user;

        const appData = await api("getAppData");

        if (!appData?.success) {
            throw new Error(appData?.message || "Gagal memuat aplikasi.");
        }

        $("loginPass").value = "";

        enterApp();

        window.dispatchEvent(
            new CustomEvent("app:ready", {
                detail: appData,
            }),
        );
    } catch (error) {
        $("loginError").textContent = error?.message || "Tidak dapat terhubung ke server.";

        $("loginError").classList.remove("hidden");
    } finally {
        busy(false);
    }
}

export async function logout(silent = false) {
    try {
        if (state.token) {
            await api("logout");
        }
    } catch {}

    setToken("");
    state.me = null;

    $("appView").classList.add("hidden");
    $("loginView").classList.remove("hidden");

    if (!silent) {
        toast("Anda telah keluar.");
    }

    window.setTimeout(() => {
        $("loginUser")?.focus();
    }, 50);
}

export async function startSession() {
    if (!state.token) {
        showLogin();
        return false;
    }

    busy(true);

    try {
        const response = await api("getAppData");

        if (!response?.success) {
            throw new Error(response?.message || "Sesi tidak valid.");
        }

        state.me = response.user;

        enterApp();

        window.dispatchEvent(
            new CustomEvent("app:ready", {
                detail: response,
            }),
        );

        return true;
    } catch {
        setToken("");
        state.me = null;
        showLogin();

        return false;
    } finally {
        busy(false);
    }
}
