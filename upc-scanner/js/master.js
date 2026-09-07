import { state, $, busy, toast, esc } from "./state.js";
import { api } from "./api.js";
import { closeModal } from "./scanner.js";

export async function loadMaster() {
    busy(true);

    try {
        const r = await api("getMaster");

        if (!r.success) {
            throw new Error(r.message);
        }

        state.masterRows = r.rows || [];
        renderMaster();
    } catch (e) {
        toast(e.message || "Gagal memuat Master Data.", true);
    } finally {
        busy(false);
    }
}

export function renderMaster() {
    const q = ($("masterSearch").value || "").toLowerCase();

    const rows = state.masterRows.filter((r) => (r.upc + " " + r.sku + " " + r.name).toLowerCase().includes(q));

    $("masterRows").innerHTML = rows.length
        ? `
    <table class="table">
        <thead>
            <tr>
                <th>UPC</th>
                <th>SKU</th>
                <th>Nama Barang</th>
                <th></th>
            </tr>
        </thead>

        <tbody>
        ${rows
            .map(
                (r) => `
        <tr>
            <td>${esc(r.upc)}</td>
            <td>${esc(r.sku)}</td>
            <td>${esc(r.name)}</td>
            <td>
                <button class="btn btn-danger" data-delete-master="${esc(r.upc)}">Hapus</button>
            </td>
        </tr>
        `,
            )
            .join("")}
        </tbody>
    </table>
    `
        : '<div class="empty">Master Data kosong.</div>';
}

export function openMaster() {
    $("modalContent").innerHTML = `
        <div class="modal-head">
            <h3>Tambah Barang</h3>
            <button class="close" data-action="close-modal">×</button>
        </div>

        <label>UPC</label>
            <input id="mUpc" class="input" inputmode="numeric">

        <label>SKU</label>
            <input id="mSku" class="input">

        <label>Nama Barang</label>
            <input id="mName" class="input">

        <button id="saveMasterBtn" class="btn btn-primary full">Simpan</button>
`;

    $("modal").classList.remove("hidden");

    $("saveMasterBtn").addEventListener("click", saveMaster);

    setTimeout(() => {
        $("mUpc").focus();
    }, 100);
}

async function saveMaster() {
    busy(true);

    try {
        const r = await api("saveMaster", {
            upc: $("mUpc").value,
            sku: $("mSku").value,
            name: $("mName").value,
        });

        if (!r.success) {
            throw new Error(r.message);
        }

        closeModal();

        toast(r.message);

        await loadMaster();
    } catch (e) {
        toast(e.message || "Gagal menyimpan.", true);
    } finally {
        busy(false);
    }
}

export async function deleteMaster(upc) {
    const row = state.masterRows.find((r) => String(r.upc) === String(upc));

    if (!row) {
        toast("Data barang tidak ditemukan.", true);
        return;
    }

    const result = await Swal.fire({
        title: "Hapus Barang?",
        text: "Data yang dihapus tidak dapat dikembalikan.",
        icon: "warning",

        showCancelButton: true,

        confirmButtonText: "Ya, Hapus!",
        cancelButtonText: "Batal",

        confirmButtonColor: "#d33",
        cancelButtonColor: "#6c757d",

        reverseButtons: true,

        allowOutsideClick: false,
    });

    if (!result.isConfirmed) {
        return;
    }

    busy(true);

    try {
        const r = await api("deleteMaster", { upc });

        if (!r.success) {
            throw new Error(r.message);
        }

        await loadMaster();

        Swal.fire({
            title: "Berhasil!",
            text: r.message || "Data barang berhasil dihapus.",
            icon: "success",
            confirmButtonText: "OK",
            confirmButtonColor: "#198754",
        });
    } catch (e) {
        Swal.fire({
            title: "Gagal!",
            text: e.message || "Gagal menghapus data.",
            icon: "error",
            confirmButtonText: "OK",
            confirmButtonColor: "#d33",
        });
    } finally {
        busy(false);
    }
}
