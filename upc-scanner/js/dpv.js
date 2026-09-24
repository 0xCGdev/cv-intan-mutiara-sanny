import { $, busy, toast, esc } from "./state.js";
import { api } from "./api.js";

let dpvRows = [];
let activeDpvId = "";
let archiveMode = false;
let dpvTablePage = 1;
let dpvSearchQuery = "";

const DPV_TABLE_PAGE_SIZE = 10;
const XLSX_CDN = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";

const ICONS = {
    search: `
        <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="m20 20-3.5-3.5"></path>
        </svg>
    `,

    import: `
        <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true">
            <path d="M12 3v12"></path>
            <path d="m7 10 5 5 5-5"></path>
            <path d="M5 21h14"></path>
        </svg>
    `,

    archive: `
        <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true">
            <path d="M4 4h16v4H4z"></path>
            <path d="M5 8v12h14V8"></path>
            <path d="M9 12h6"></path>
        </svg>
    `,

    trash: `
        <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true">
            <path d="M4 7h16"></path>
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
            <path d="M6 7l1 14h10l1-14"></path>
            <path d="M9 7V4h6v3"></path>
        </svg>
    `,

    edit: `
        <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path>
        </svg>
    `,

    check: `
        <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true">
            <path d="m5 12 4 4L19 6"></path>
        </svg>
    `,

    chevron: `
        <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true">
            <path d="m6 9 6 6 6-6"></path>
        </svg>
    `,
};

export async function loadDPV() {
    await loadDPVList();

    const saved = localStorage.getItem("active_dpv");
    const savedId = String(saved || "").trim();

    if (savedId && dpvRows.some((row) => getDpvId(row) === savedId)) {
        activeDpvId = savedId;
    }

    renderDPVPage();

    if (activeDpvId) {
        await loadActiveDPV();
    }
}

async function loadDPVList() {
    try {
        busy(true);

        const result = await api("getShipments");

        if (!result?.success) {
            throw new Error(result?.message || "Gagal mengambil data DPV.");
        }

        dpvRows = Array.isArray(result.rows) ? result.rows : [];

        if (activeDpvId && !dpvRows.some((row) => getDpvId(row) === activeDpvId)) {
            activeDpvId = "";
            localStorage.removeItem("active_dpv");
        }
    } catch (error) {
        dpvRows = [];

        toast(error?.message || "Gagal memuat DPV.", true);
    } finally {
        busy(false);
    }
}

function getDpvId(row) {
    return String(row?.shipmentId || row?.SHIPMENT_ID || row?.dpvId || row?.DPV_ID || "").trim();
}

function getDpvStatus(row) {
    return String(row?.status || row?.STATUS || "PENDING").trim();
}

function getDpvDate(row) {
    return String(row?.date || row?.TANGGAL || "").trim();
}

function isDpvCompleted(row) {
    return String(getDpvStatus(row)).toUpperCase() === "SELESAI";
}

function isDpvImportLocked(row) {
    return String(getDpvStatus(row)).toUpperCase() !== "PENDING";
}

function renderDPVPage() {
    const page = $("page-shipments");

    if (!page) {
        return;
    }

    page.innerHTML = `
        <div class="page-head">
            <div>
                <h2>DPV</h2>
                <p>Kelola DPV dan data barang.</p>
            </div>
        </div>

        <section class="panel">
            <div class="dpv-toolbar">
                <div class="dpv-toolbar-left">
                    <button
                        id="dpvChooseBtn"
                        class="btn btn-soft dpv-choose-btn"
                        type="button">

                        <span>
                            ${activeDpvId ? esc(activeDpvId) : "Pilih DPV"}
                        </span>

                        ${ICONS.chevron}
                    </button>
                </div>

                <div class="dpv-toolbar-right">
                    <div class="dpv-search" role="search">
                        ${ICONS.search}

                        <input
                            id="dpvSearchInput"
                            type="search"
                            placeholder="Cari..."
                            autocomplete="off"
                            aria-label="Cari data DPV">
                    </div>

                    <button
                        id="dpvImportBtn"
                        class="btn btn-soft dpv-icon-btn"
                        type="button"
                        ${activeDpvId ? "" : "disabled"}
                        title="Import Data"
                        aria-label="Import Data">

                        ${ICONS.import}

                        <span class="dpv-action-label">
                            Import
                        </span>
                    </button>

                    <button
                        id="dpvArchiveBtn"
                        class="btn btn-soft dpv-icon-btn"
                        type="button"
                        title="${archiveMode ? "Kembali" : "Arsip"}"
                        aria-label="${archiveMode ? "Kembali" : "Arsip"}">

                        ${ICONS.archive}

                        <span class="dpv-action-label">
                            ${archiveMode ? "Kembali" : "Arsip"}
                        </span>
                    </button>

                    <button
                        id="dpvDeleteBtn"
                        class="btn btn-soft dpv-icon-btn dpv-delete-btn"
                        type="button"
                        ${canDeleteActiveDPV() ? "" : "disabled"}
                        title="Hapus DPV"
                        aria-label="Hapus DPV">

                        ${ICONS.trash}

                        <span class="dpv-action-label">
                            Hapus
                        </span>
                    </button>
                </div>
            </div>

            <input
                id="dpvImportInput"
                type="file"
                accept=".xlsx,.xls,.csv"
                hidden>

            <div
                id="shipmentRows"
                class="shipment-list">
            </div>
        </section>
    `;

    bindDPVPageEvents();

    if (activeDpvId) {
        renderActiveDPVPlaceholder();
    } else {
        renderDPVList();
    }
}

function bindDPVPageEvents() {
    $("dpvChooseBtn")?.addEventListener("click", openDPVSelector);

    $("dpvImportBtn")?.addEventListener("click", handleImportButton);

    $("dpvImportInput")?.addEventListener("change", handleImportFile);

    $("dpvArchiveBtn")?.addEventListener("click", toggleArchive);

    $("dpvDeleteBtn")?.addEventListener("click", handleDeleteDPV);

    $("dpvSearchInput")?.addEventListener("input", (event) => {
        dpvSearchQuery = String(event.target.value || "").trim();

        dpvTablePage = 1;

        renderCurrentDPVTable();
    });
}

function renderActiveDPVPlaceholder() {
    const box = $("shipmentRows");

    if (!box) {
        return;
    }

    box.className = "dpv-table-container";

    box.innerHTML = `
        <div class="shipment-empty">
            <div class="shipment-empty-title">
                Memuat DPV ${esc(activeDpvId)}...
            </div>

            <div class="shipment-empty-text">
                Mengambil data DPV.
            </div>
        </div>
    `;
}

function renderDPVError(message) {
    const box = $("shipmentRows");

    if (!box) {
        return;
    }

    box.className = "dpv-table-container";

    box.innerHTML = `
        <div class="shipment-empty">
            <div class="shipment-empty-title">
                Gagal memuat DPV
            </div>

            <div class="shipment-empty-text">
                ${esc(message)}
            </div>
        </div>
    `;
}

function renderDPVList() {
    const box = $("shipmentRows");

    if (!box || activeDpvId) {
        return;
    }

    box.className = "dpv-table-container";

    box.innerHTML = `
        <div class="shipment-empty">
            <div class="shipment-empty-title">
                Belum ada DPV yang dipilih
            </div>

            <div class="shipment-empty-text">
                Silakan pilih DPV terlebih dahulu untuk melihat data barang.
            </div>
        </div>
    `;
}

async function loadActiveDPV() {
    if (!activeDpvId) {
        return;
    }

    try {
        busy(true);

        const result = await api("getShipment", {
            shipmentId: activeDpvId,
        });

        if (!result?.success) {
            throw new Error(result?.message || "Gagal mengambil data DPV.");
        }

        const dpv = result?.shipment;

        if (!dpv) {
            throw new Error("Data DPV tidak ditemukan.");
        }

        dpvTablePage = 1;

        renderDPVTable(dpv);
    } catch (error) {
        toast(error?.message || "Gagal mengambil data DPV.", true);

        renderDPVError(error?.message || "Gagal mengambil data DPV.");
    } finally {
        busy(false);
    }
}

function getFilteredDPVItems(items) {
    const query = dpvSearchQuery.toLowerCase().trim();

    if (!query) {
        return items;
    }

    return items.filter((item) => {
        const sku = String(item?.sku || "").toLowerCase();

        const upc = String(item?.upc || "").toLowerCase();

        const name = String(item?.name || "").toLowerCase();

        return sku.includes(query) || upc.includes(query) || name.includes(query);
    });
}

function renderCurrentDPVTable() {
    const box = $("shipmentRows");

    if (!box || !activeDpvId) {
        return;
    }

    const dpv = box.__dpvData;

    if (!dpv) {
        return;
    }

    renderDPVTable(dpv, false);
}

function ensureDPVLabelStyles() {
    if (document.querySelector("style[data-dpv-label-style]")) {
        return;
    }

    const style = document.createElement("style");

    style.dataset.dpvLabelStyle = "true";
    style.textContent = `
        .dpv-label-cell {
            text-align: center;
        }

        .dpv-label-display {
            position: relative;
            display: block;
            width: 100%;
            min-height: 28px;
            line-height: 28px;
            text-align: center;
        }

        .dpv-label-value {
            display: block;
            width: 100%;
            text-align: center;
        }

        .dpv-label-edit {
            position: absolute;
            top: 50%;
            right: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            padding: 0;
            border: 0;
            background: transparent;
            color: inherit;
            cursor: pointer;
            opacity: 0;
            visibility: hidden;
            transform: translateY(-50%);
            transition: opacity 0.15s ease, visibility 0.15s ease;
        }

        .dpv-label-display:hover .dpv-label-edit,
        .dpv-label-edit:focus-visible {
            opacity: 1;
            visibility: visible;
        }

        .dpv-label-edit:hover {
            color: #166534;
        }

        .dpv-label-editing {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
        }

        .dpv-label-editing .dpv-label-input {
            width: 72px;
            height: 32px;
            min-height: 32px;
            padding: 4px 8px;
            text-align: center;
            border-radius: 7px;
        }

        .dpv-label-done {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 30px;
            height: 30px;
            padding: 0;
            border: 0;
            border-radius: 7px;
            background: #166534;
            color: #fff;
            cursor: pointer;
        }

        .dpv-label-done:hover {
            background: #14532d;
        }

        .dpv-table-container .table thead th {
            text-align: center;
            vertical-align: middle;
        }

        .dpv-table-container .table tbody td {
            text-align: center;
            vertical-align: middle;
        }

        .dpv-table-container .table tbody td:nth-child(3) {
            text-align: left;
        }
    `;

    document.head.appendChild(style);
}

function renderDPVTable(dpv, resetPage = true) {
    const box = $("shipmentRows");

    if (!box) {
        return;
    }

    ensureDPVLabelStyles();

    box.className = "dpv-table-container";
    box.__dpvData = dpv;

    if (resetPage) {
        dpvTablePage = 1;
    }

    const allItems = Array.isArray(dpv?.items) ? dpv.items : [];

    const items = getFilteredDPVItems(allItems);

    if (!allItems.length) {
        box.innerHTML = `
            <div class="shipment-empty">
                <div class="shipment-empty-title">
                    DPV ${esc(activeDpvId)} belum memiliki data.
                </div>

                <div class="shipment-empty-text">
                    Klik Import Data untuk memasukkan data barang.
                </div>
            </div>
        `;

        return;
    }

    if (dpvSearchQuery && !items.length) {
        box.innerHTML = `
            <div class="shipment-empty">
                <div class="shipment-empty-title">
                    Data tidak ditemukan
                </div>

                <div class="shipment-empty-text">
                    Tidak ada SKU, UPC, atau nama barang yang cocok dengan pencarian.
                </div>
            </div>
        `;

        return;
    }

    const totalPages = Math.max(1, Math.ceil(items.length / DPV_TABLE_PAGE_SIZE));

    if (dpvTablePage > totalPages) {
        dpvTablePage = totalPages;
    }

    const start = (dpvTablePage - 1) * DPV_TABLE_PAGE_SIZE;

    const pageItems = items.slice(start, start + DPV_TABLE_PAGE_SIZE);

    box.innerHTML = `
        <div class="table-wrap">
            <table class="table">
                <thead>
                    <tr>
                        <th>SKU</th>
                        <th>UPC</th>
                        <th>Nama Barang</th>
                        <th>Qty</th>
                        <th>Label Diserahkan</th>
                    </tr>
                </thead>

                <tbody>
                    ${pageItems
                        .map(
                            (item) => `
                                <tr>
                                    <td>
                                        ${esc(item?.sku || "-")}
                                    </td>

                                    <td>
                                        ${esc(item?.upc || "-")}
                                    </td>

                                    <td>
                                        ${esc(item?.name || "-")}
                                    </td>

                                    <td>
                                        <span class="qty">
                                            ${esc(item?.qtyTarget ?? item?.qty ?? 0)}
                                        </span>
                                    </td>

                                    <td class="dpv-label-cell">
                                        <div class="dpv-label-display">
                                            <span class="dpv-label-value">
                                                ${Number(item?.labelDiserahkan || 0) > 0 ? esc(item.labelDiserahkan) : "-"}
                                            </span>

                                            <button
                                                type="button"
                                                class="dpv-label-edit"
                                                data-label-sku="${esc(item?.sku || "")}"
                                                aria-label="Edit Label Diserahkan ${esc(item?.sku || "")}"
                                                title="Edit Label Diserahkan">
                                                ${ICONS.edit}
                                            </button>
                                        </div>
                                    </td>

                                </tr>
                            `,
                        )
                        .join("")}
                </tbody>
            </table>
        </div>

        ${totalPages > 1 ? renderDPVPagination(totalPages) : ""}
    `;

    bindDPVLabelActions();
    bindDPVPagination(totalPages);
}

function bindDPVLabelActions() {
    const box = $("shipmentRows");

    if (!box) {
        return;
    }

    box.querySelectorAll(".dpv-label-edit").forEach((button) => {
        if (button.dataset.labelBound === "true") {
            return;
        }

        button.dataset.labelBound = "true";

        button.addEventListener("click", () => {
            const sku = String(button.dataset.labelSku || "").trim();
            const cell = button.closest(".dpv-label-cell");

            if (!sku || !cell) {
                return;
            }

            box.querySelectorAll(".dpv-label-editing").forEach((editing) => {
                const editingCell = editing.closest(".dpv-label-cell");

                if (!editingCell || editingCell === cell) {
                    return;
                }

                const editingSku = String(editing.querySelector(".dpv-label-input")?.dataset.labelSku || "").trim();

                const currentValue = String(box.__dpvData?.items?.find((item) => String(item?.sku || "").trim() === editingSku)?.labelDiserahkan ?? 0).trim();

                editingCell.innerHTML = `
                    <div class="dpv-label-display">
                        <span class="dpv-label-value">
                            ${Number(currentValue || 0) > 0 ? esc(currentValue) : "-"}
                        </span>

                        <button
                            type="button"
                            class="dpv-label-edit"
                            data-label-sku="${esc(editingSku)}"
                            aria-label="Edit Label Diserahkan ${esc(editingSku)}"
                            title="Edit Label Diserahkan">
                            ${ICONS.edit}
                        </button>
                    </div>
                `;
            });

            bindDPVLabelActions();

            const currentValue = String(box.__dpvData?.items?.find((item) => String(item?.sku || "").trim() === sku)?.labelDiserahkan ?? "").trim();

            cell.innerHTML = `
                <div class="dpv-label-editing">
                    <input
                        class="input dpv-label-input"
                        type="number"
                        min="0"
                        step="1"
                        value="${currentValue && Number(currentValue) > 0 ? esc(currentValue) : ""}"
                        data-label-sku="${esc(sku)}"
                        aria-label="Label Diserahkan ${esc(sku)}">

                    <button
                        type="button"
                        class="dpv-label-done"
                        data-label-sku="${esc(sku)}"
                        aria-label="Selesai"
                        title="Selesai">
                        ${ICONS.check}
                    </button>
                </div>
            `;

            const input = cell.querySelector(".dpv-label-input");
            input?.focus();
            input?.select();

            const saveButton = cell.querySelector(".dpv-label-done");

            saveButton?.addEventListener("click", () => {
                saveDPVLabel(sku, input);
            });

            input?.addEventListener("keydown", (event) => {
                if (event.key !== "Enter") {
                    return;
                }

                event.preventDefault();
                saveDPVLabel(sku, input);
            });
        });
    });
}

async function saveDPVLabel(sku, input) {
    const valueText = String(input?.value || "").trim();
    const value = valueText === "" ? 0 : Number(valueText);
    const shipmentId = String(activeDpvId || localStorage.getItem("active_dpv") || "").trim();

    if (!shipmentId) {
        toast("DPV wajib dipilih.", true);
        return;
    }

    if (!sku) {
        toast("SKU wajib diisi.", true);
        return;
    }

    if (!Number.isInteger(value) || value < 0) {
        toast("Label Diserahkan harus berupa angka bulat 0 atau lebih.", true);
        return;
    }

    try {
        busy(true);

        const result = await api("updateLabelDiserahkan", {
            shipmentId,
            sku,
            labelDiserahkan: value,
        });

        if (!result?.success) {
            throw new Error(result?.message || "Gagal menyimpan Label Diserahkan.");
        }

        renderDPVTable(result.shipment, false);

        toast(result.message || "Label Diserahkan berhasil disimpan.");
    } catch (error) {
        toast(error?.message || "Gagal menyimpan Label Diserahkan.", true);
    } finally {
        busy(false);
    }
}

function renderDPVPagination(totalPages) {
    const pages = getPaginationPages(dpvTablePage, totalPages);

    return `
        <div class="pagination">
            <div class="pagination-controls">
                <button
                    type="button"
                    class="pagination-btn"
                    data-dpv-page="${dpvTablePage - 1}"
                    ${dpvTablePage <= 1 ? "disabled" : ""}
                    aria-label="Halaman sebelumnya">
                    ‹
                </button>

                ${pages
                    .map((page) => {
                        if (page === "...") {
                            return `
                                <span class="pagination-dots">
                                    …
                                </span>
                            `;
                        }

                        return `
                            <button
                                type="button"
                                class="pagination-btn ${page === dpvTablePage ? "active" : ""}"
                                data-dpv-page="${page}">
                                ${page}
                            </button>
                        `;
                    })
                    .join("")}

                <button
                    type="button"
                    class="pagination-btn"
                    data-dpv-page="${dpvTablePage + 1}"
                    ${dpvTablePage >= totalPages ? "disabled" : ""}
                    aria-label="Halaman berikutnya">
                    ›
                </button>
            </div>
        </div>
    `;
}

function getPaginationPages(currentPage, totalPages) {
    if (totalPages <= 5) {
        return Array.from(
            {
                length: totalPages,
            },
            (_, index) => index + 1,
        );
    }

    if (currentPage <= 3) {
        return [1, 2, 3, "...", totalPages];
    }

    if (currentPage >= totalPages - 2) {
        return [1, "...", totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, "...", currentPage, "...", totalPages];
}

function bindDPVPagination(totalPages) {
    const box = $("shipmentRows");

    if (!box) {
        return;
    }

    box.querySelectorAll("[data-dpv-page]").forEach((button) => {
        button.addEventListener("click", () => {
            const page = Number(button.dataset.dpvPage);

            if (!Number.isFinite(page) || page < 1 || page > totalPages || page === dpvTablePage) {
                return;
            }

            dpvTablePage = page;

            renderCurrentDPVTable();
        });
    });
}

function openDPVSelector() {
    $("dpvSelectorModal")?.remove();

    const modal = document.createElement("div");

    modal.id = "dpvSelectorModal";
    modal.className = "shipment-modal";

    const availableRows = Array.isArray(dpvRows) ? dpvRows.filter((row) => !isDpvCompleted(row)) : [];

    modal.innerHTML = `
        <div
            class="shipment-modal-backdrop"
            data-dpv-selector-close>
        </div>

        <div
            class="shipment-modal-dialog dpv-selector-dialog">

            <div class="shipment-modal-header">
                <div>
                    <h3>Pilih DPV</h3>

                    <p>
                        Pilih DPV yang akan digunakan.
                    </p>
                </div>

                <button
                    type="button"
                    class="shipment-modal-close"
                    data-dpv-selector-close
                    aria-label="Tutup">
                    ×
                </button>
            </div>

            <div class="shipment-modal-body">
                <div class="shipment-field">
                    <label for="dpvSelect">
                        Pilih DPV
                    </label>

                    <select
                        id="dpvSelect"
                        class="input dpv-select">

                        <option value="">
                            Pilih DPV
                        </option>

                        ${availableRows
                            .map((row) => {
                                const id = getDpvId(row);

                                return `
                                    <option
                                        value="${esc(id)}"
                                        ${id === activeDpvId ? "selected" : ""}>
                                        ${esc(id)}
                                    </option>
                                `;
                            })
                            .join("")}
                    </select>
                </div>

                <div class="dpv-or">
                    atau
                </div>

                <button
                    id="createDpvBtn"
                    class="btn btn-primary full"
                    type="button">

                    + Tambah DPV

                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll("[data-dpv-selector-close]").forEach((element) => {
        element.addEventListener("click", () => modal.remove());
    });

    $("dpvSelect")?.addEventListener("change", async (event) => {
        const id = event.target.value;

        if (!id) {
            return;
        }

        await selectDPV(id);

        modal.remove();
    });

    $("createDpvBtn")?.addEventListener("click", () => {
        modal.remove();
        openCreateDPVModal();
    });
}

async function selectDPV(id) {
    const value = String(id || "").trim();

    if (!value) {
        return;
    }

    const row = dpvRows.find((item) => getDpvId(item) === value);

    if (!row) {
        toast("DPV tidak ditemukan.", true);
        return;
    }

    activeDpvId = value;

    localStorage.setItem("active_dpv", activeDpvId);

    archiveMode = false;
    dpvTablePage = 1;
    dpvSearchQuery = "";

    renderDPVPage();

    await loadActiveDPV();
}

function openCreateDPVModal() {
    $("createDpvModal")?.remove();

    const modal = document.createElement("div");

    modal.id = "createDpvModal";
    modal.className = "shipment-modal";

    modal.innerHTML = `
        <div
            class="shipment-modal-backdrop"
            data-create-dpv-close>
        </div>

        <div
            class="shipment-modal-dialog dpv-selector-dialog">

            <div class="shipment-modal-header">
                <div>
                    <h3>Tambah DPV</h3>

                    <p>
                        Buat DPV baru.
                    </p>
                </div>

                <button
                    type="button"
                    class="shipment-modal-close"
                    data-create-dpv-close
                    aria-label="Kembali">
                    ×
                </button>
            </div>

            <div class="shipment-modal-body">
                <div class="shipment-field">
                    <label for="createDpvIdInput">
                        No. DPV
                    </label>

                    <input
                        id="createDpvIdInput"
                        class="input"
                        type="text"
                        placeholder="Contoh: DPV-610"
                        autocomplete="off">
                </div>

                <div
                    class="shipment-field"
                    style="margin-top:12px;">

                    <label for="createDpvDateInput">
                        Tanggal
                    </label>

                    <input
                        id="createDpvDateInput"
                        class="input"
                        type="date"
                        value="${getTodayInputValue()}">
                </div>
            </div>

            <div class="shipment-modal-footer">
                <button
                    class="btn btn-soft"
                    type="button"
                    data-create-dpv-close>

                    Kembali

                </button>

                <button
                    id="saveDpvBtn"
                    class="btn btn-primary"
                    type="button">

                    Buat DPV

                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeToSelector = () => {
        modal.remove();
        openDPVSelector();
    };

    modal.querySelectorAll("[data-create-dpv-close]").forEach((element) => {
        element.addEventListener("click", closeToSelector);
    });

    $("saveDpvBtn")?.addEventListener("click", createDPV);

    $("createDpvIdInput")?.focus();

    $("createDpvIdInput")?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();

        createDPV();
    });
}

async function createDPV() {
    const idInput = $("createDpvIdInput");
    const dateInput = $("createDpvDateInput");

    const shipmentId = String(idInput?.value || "").trim();

    const date = String(dateInput?.value || "").trim();

    if (!shipmentId) {
        toast("No. DPV wajib diisi.", true);
        idInput?.focus();
        return;
    }

    if (!date) {
        toast("Tanggal DPV wajib diisi.", true);
        dateInput?.focus();
        return;
    }

    const exists = dpvRows.some((row) => getDpvId(row).toLowerCase() === shipmentId.toLowerCase());

    if (exists) {
        toast(`DPV ${shipmentId} sudah ada.`, true);
        return;
    }

    try {
        busy(true);

        const result = await api("createShipment", {
            shipmentId,
            date,
        });

        if (!result?.success) {
            throw new Error(result?.message || "Gagal membuat DPV.");
        }

        $("createDpvModal")?.remove();

        activeDpvId = shipmentId;

        localStorage.setItem("active_dpv", activeDpvId);

        archiveMode = false;
        dpvTablePage = 1;
        dpvSearchQuery = "";

        await loadDPVList();

        renderDPVPage();

        await loadActiveDPV();

        toast(`DPV ${shipmentId} berhasil dibuat.`);
    } catch (error) {
        toast(error?.message || "Gagal membuat DPV.", true);
    } finally {
        busy(false);
    }
}

async function handleImportButton() {
    if (!activeDpvId) {
        openDPVSelector();
        return;
    }

    const activeRow = dpvRows.find((row) => getDpvId(row) === activeDpvId);

    if (activeRow && isDpvImportLocked(activeRow)) {
        toast("DPV sudah masuk proses dan tidak dapat direvisi.", true);

        return;
    }

    $("dpvImportInput")?.click();
}

async function handleImportFile(event) {
    const input = event.target;
    const file = input.files?.[0];

    input.value = "";

    if (!file) {
        return;
    }

    if (!activeDpvId) {
        toast("Pilih DPV terlebih dahulu.", true);

        return;
    }

    try {
        busy(true);

        const items = await parseImportFile(file);

        if (!items.length) {
            throw new Error("Tidak ditemukan data SKU dan Qty yang valid.");
        }

        const result = await api("importDPV", {
            shipmentId: activeDpvId,
            items,
        });

        if (!result?.success) {
            throw new Error(result?.message || "Gagal import data DPV.");
        }

        dpvTablePage = 1;
        dpvSearchQuery = "";

        await loadDPVList();

        renderDPVPage();

        await loadActiveDPV();

        toast(result?.message || `Data DPV ${activeDpvId} berhasil diimport.`);
    } catch (error) {
        toast(error?.message || "Gagal import data DPV.", true);
    } finally {
        busy(false);
    }
}

async function parseImportFile(file) {
    await ensureXLSX();

    const buffer = await file.arrayBuffer();

    const workbook = XLSX.read(buffer, {
        type: "array",
        cellDates: true,
        cellStyles: true,
    });

    if (!workbook.SheetNames.length) {
        throw new Error("File Excel tidak memiliki sheet.");
    }

    const sheetName = workbook.SheetNames.find((name) => String(name).trim().toUpperCase() === "K2");

    if (!sheetName) {
        throw new Error("Sheet K2 tidak ditemukan di file Excel.");
    }

    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: false,
        skipHidden: true,
    });

    if (rows.length < 2) {
        throw new Error("Sheet K2 tidak memiliki data barang.");
    }

    const items = [];

    for (let index = 1; index < rows.length; index++) {
        const row = rows[index];

        const sku = String(row?.[0] ?? "").trim();

        const name = String(row?.[1] ?? "").trim();

        const qty = parseQty(row?.[7]);

        if (!sku) {
            continue;
        }

        const skuLower = sku.toLowerCase();

        const nameLower = name.toLowerCase();

        if (skuLower === "pallet" || nameLower === "pallet" || skuLower.startsWith("pallet ") || nameLower.startsWith("pallet ")) {
            continue;
        }

        if (!Number.isFinite(qty) || qty <= 0) {
            continue;
        }

        if (skuLower === "item no" || skuLower === "item no." || nameLower === "description") {
            continue;
        }

        items.push({
            sku,
            name,
            qty,
        });
    }

    if (!items.length) {
        throw new Error("Tidak ditemukan data barang valid pada sheet K2.");
    }

    return items;
}

function parseQty(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    let text = String(value ?? "").trim();

    if (!text) {
        return 0;
    }

    text = text.replace(/[^\d,.-]/g, "");

    if (text.includes(",") && text.includes(".")) {
        const lastComma = text.lastIndexOf(",");

        const lastDot = text.lastIndexOf(".");

        if (lastComma > lastDot) {
            text = text.replace(/\./g, "").replace(",", ".");
        } else {
            text = text.replace(/,/g, "");
        }
    } else if (text.includes(",")) {
        text = text.replace(",", ".");
    }

    const number = Number(text);

    return Number.isFinite(number) ? number : 0;
}

function ensureXLSX() {
    if (window.XLSX) {
        return Promise.resolve();
    }

    if (window.__xlsxLoaderPromise) {
        return window.__xlsxLoaderPromise;
    }

    window.__xlsxLoaderPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-xlsx-loader="true"]');

        if (existing) {
            existing.addEventListener("load", () => {
                if (window.XLSX) {
                    resolve();
                } else {
                    reject(new Error("Library Excel berhasil dimuat tetapi tidak tersedia."));
                }
            });

            existing.addEventListener("error", () => reject(new Error("Gagal memuat library Excel.")));

            return;
        }

        const script = document.createElement("script");

        script.src = XLSX_CDN;
        script.async = true;
        script.dataset.xlsxLoader = "true";

        script.onload = () => {
            if (!window.XLSX) {
                reject(new Error("Library Excel berhasil dimuat tetapi tidak tersedia."));

                return;
            }

            resolve();
        };

        script.onerror = () => {
            reject(new Error("Gagal memuat library Excel. Periksa koneksi internet."));
        };

        document.head.appendChild(script);
    });

    return window.__xlsxLoaderPromise;
}

function canDeleteActiveDPV() {
    if (!activeDpvId || archiveMode) {
        return false;
    }

    const row = dpvRows.find((item) => getDpvId(item) === activeDpvId);

    if (!row) {
        return false;
    }

    return String(getDpvStatus(row)).toUpperCase() === "PENDING";
}

async function handleDeleteDPV() {
    if (!activeDpvId) {
        toast("Pilih DPV terlebih dahulu.", true);

        return;
    }

    const row = dpvRows.find((item) => getDpvId(item) === activeDpvId);

    if (!row) {
        toast("DPV tidak ditemukan.", true);

        return;
    }

    const status = String(getDpvStatus(row)).toUpperCase();

    if (status !== "PENDING") {
        toast("DPV yang sudah masuk proses tidak dapat dihapus.", true);

        return;
    }

    const shipmentId = activeDpvId;

    const confirmed = window.confirm(`Hapus DPV ${shipmentId}?\n\nData DPV dan data terkait akan dihapus. Tindakan ini tidak dapat dibatalkan.`);

    if (!confirmed) {
        return;
    }

    try {
        busy(true);

        const result = await api("deleteShipment", {
            shipmentId,
        });

        if (!result?.success) {
            throw new Error(result?.message || "Gagal menghapus DPV.");
        }

        activeDpvId = "";
        archiveMode = false;
        dpvTablePage = 1;
        dpvSearchQuery = "";

        localStorage.removeItem("active_dpv");

        await loadDPVList();

        renderDPVPage();

        toast(result?.message || `DPV ${shipmentId} berhasil dihapus.`);
    } catch (error) {
        toast(error?.message || "Gagal menghapus DPV.", true);
    } finally {
        busy(false);
    }
}

function toggleArchive() {
    archiveMode = !archiveMode;

    if (activeDpvId) {
        activeDpvId = "";
        localStorage.removeItem("active_dpv");
    }

    dpvTablePage = 1;
    dpvSearchQuery = "";

    renderDPVPage();
}

function getTodayInputValue() {
    const date = new Date();

    const year = date.getFullYear();

    const month = String(date.getMonth() + 1).padStart(2, "0");

    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export function bindDPV() {
    const page = $("page-shipments");

    if (!page) {
        return;
    }

    page.dataset.dpvBound = "true";
}
