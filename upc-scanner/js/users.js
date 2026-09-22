import { state, $, busy, toast, esc, closeModal } from "./state.js";

import { api } from "./api.js";

let users = [];

export async function loadUsers() {
    if (state.me?.role !== "ADMIN") {
        return;
    }

    busy(true);

    try {
        const r = await api("getUsers");

        if (!r.success) {
            throw new Error(r.message || "Gagal memuat data pengguna.");
        }

        users = Array.isArray(r.rows) ? r.rows : Array.isArray(r.users) ? r.users : [];

        renderUsers();
    } catch (e) {
        toast(e.message || "Gagal memuat data pengguna.", true);
    } finally {
        busy(false);
    }
}

function renderUsers() {
    const container = $("userRows");

    if (!container) {
        return;
    }

    if (!users.length) {
        container.innerHTML = `
            <div class="empty">
                Data pengguna kosong.
            </div>
        `;

        return;
    }

    container.innerHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th>Username</th>
                    <th>Nama Petugas</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th></th>
                </tr>
            </thead>

            <tbody>
                ${users
                    .map((user) => {
                        const username = String(user.username || "").trim();

                        const name = String(user.name || "").trim();

                        const role = String(user.role || "").trim();

                        const status = user.active === false ? "Nonaktif" : "Aktif";

                        const isCurrentUser = username === String(state.me?.username || "").trim();

                        return `
                            <tr>
                                <td>
                                    <b>${esc(username)}</b>
                                </td>

                                <td>
                                    ${esc(name)}
                                </td>

                                <td>
                                    ${esc(role)}
                                </td>

                                <td>
                                    ${esc(status)}
                                </td>

                                <td>
                                    ${
                                        !isCurrentUser
                                            ? `
                                                <button
                                                    class="btn btn-danger"
                                                    type="button"
                                                    data-user-action="delete"
                                                    data-username="${esc(username)}"
                                                >
                                                    Hapus
                                                </button>
                                            `
                                            : ""
                                    }
                                </td>
                            </tr>
                        `;
                    })
                    .join("")}
            </tbody>
        </table>
    `;
}

export function openUser() {
    const modal = $("modal");
    const content = $("modalContent");

    if (!modal || !content) {
        return;
    }

    content.innerHTML = `
        <div class="modal-head">
            <h3>Tambah Petugas</h3>

            <button
                class="close"
                data-action="close-modal"
                type="button"
                aria-label="Tutup"
            >
                ×
            </button>
        </div>

        <label for="uUsername">
            Username
        </label>

        <input
            id="uUsername"
            class="input"
            type="text"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
        >

        <label for="uName">
            Nama
        </label>

        <input
            id="uName"
            class="input"
            type="text"
            autocomplete="off"
        >

        <label for="uPassword">
            Password
        </label>

        <input
            id="uPassword"
            class="input"
            type="password"
            autocomplete="new-password"
        >

        <label for="uRole">
            Role
        </label>

        <select
            id="uRole"
            class="input"
        >
            <option value="PETUGAS">
                PETUGAS
            </option>

            <option value="ADMIN">
                ADMIN
            </option>
        </select>

        <button
            id="saveUserBtn"
            class="btn btn-primary full"
            type="button"
        >
            Simpan
        </button>
    `;

    modal.classList.remove("hidden");

    $("saveUserBtn")?.addEventListener("click", saveUser);

    setTimeout(() => {
        $("uUsername")?.focus();
    }, 100);
}

async function saveUser() {
    const username = $("uUsername")?.value.trim() || "";

    const name = $("uName")?.value.trim() || "";

    const password = $("uPassword")?.value || "";

    const role = $("uRole")?.value || "PETUGAS";

    if (!username || !name || !password) {
        toast("Username, nama, dan password wajib diisi.", true);

        return;
    }

    busy(true);

    try {
        const r = await api("saveUser", {
            username,
            name,
            password,
            role,
        });

        if (!r.success) {
            throw new Error(r.message || "Gagal menyimpan pengguna.");
        }

        closeModal();

        toast(r.message || "Pengguna berhasil disimpan.");

        await loadUsers();
    } catch (e) {
        toast(e.message || "Gagal menyimpan pengguna.", true);
    } finally {
        busy(false);
    }
}

export function bindUserActions() {
    const container = $("userRows");

    if (!container) {
        return;
    }

    container.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-user-action]");

        if (!button) {
            return;
        }

        const action = button.dataset.userAction;

        const username = button.dataset.username;

        if (action !== "delete" || !username) {
            return;
        }

        if (username === String(state.me?.username || "").trim()) {
            toast("Akun yang sedang digunakan tidak dapat dihapus.", true);

            return;
        }

        const confirmed = window.confirm(`Hapus pengguna "${username}"?`);

        if (!confirmed) {
            return;
        }

        busy(true);

        try {
            const r = await api("deleteUser", {
                username,
            });

            if (!r.success) {
                throw new Error(r.message || "Gagal menghapus pengguna.");
            }

            toast(r.message || "Pengguna berhasil dihapus.");

            await loadUsers();
        } catch (e) {
            toast(e.message || "Gagal menghapus pengguna.", true);
        } finally {
            busy(false);
        }
    });
}
