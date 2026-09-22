import { $, busy, toast, esc } from "./state.js";
import { api } from "./api.js";

let matchingReady = false;

const MATCHING_ROWS_PER_PAGE = 5;

let matchingCurrentPage = 1;
let matchingSearch = "";
let matchingSort = "default";

let matchingRows = [];
let matchingShipments = [];
let matchingComparison = null;
let activeMatchingShipmentId = "";

function getShipmentId(row) {
    return String(row?.shipmentId ?? row?.SHIPMENT_ID ?? row?.id ?? "").trim();
}

function getShipmentName(row) {
    const id = getShipmentId(row);

    return String(row?.shipmentId ?? row?.name ?? row?.nama ?? row?.dpv ?? row?.DPV ?? id).trim();
}

function normalizeMatchingRow(row) {
    return {
        upc: String(row?.upc ?? row?.UPC ?? "").trim(),

        sku: String(row?.sku ?? row?.SKU ?? "-").trim(),

        name: String(row?.name ?? row?.NAMA_BARANG ?? "-").trim(),

        target: Number(row?.target ?? row?.TARGET_QTY ?? 0),

        packing: Number(row?.packed ?? row?.packing ?? row?.PACKING_QTY ?? 0),

        loading: Number(row?.loaded ?? row?.loading ?? row?.LOADING_QTY ?? 0),

        difference: Number(row?.difference ?? row?.selisih ?? row?.SELISIH ?? 0),

        status: String(row?.status ?? row?.STATUS ?? "").trim(),
    };
}

function getShipmentRows(response) {
    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.rows)) {
        return response.rows;
    }

    if (Array.isArray(response?.shipments)) {
        return response.shipments;
    }

    if (Array.isArray(response?.data?.rows)) {
        return response.data.rows;
    }

    if (Array.isArray(response?.data?.shipments)) {
        return response.data.shipments;
    }

    return [];
}

function prepareMatchingLayout() {
    const page = $("page-matching");

    if (!page || matchingReady) {
        return;
    }

    page.innerHTML = `
        <div class="page-head">
            <h2>Matching</h2>
            <p>
                Bandingkan hasil Packing dengan Loading.
            </p>
        </div>

        <section class="matching-top-bar">

            <div class="matching-shipment-selector">
                <select
                    id="matchingShipmentSelect"
                    class="input">

                    <option value="">
                        Pilih DPV
                    </option>

                </select>
            </div>

            <div class="matching-tools">

                <div class="matching-search">

                    <input
                        id="matchingSearchInput"
                        class="input"
                        type="search"
                        placeholder="Cari SKU, UPC, atau nama..."
                        autocomplete="off">

                </div>

                <button
                    id="matchingSortBtn"
                    class="matching-sort-btn"
                    type="button"
                    title="Urutkan"
                    aria-label="Urutkan">

                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round">

                        <path d="M8 6h13"></path>
                        <path d="M8 12h10"></path>
                        <path d="M8 18h7"></path>

                        <path d="M3 6h.01"></path>
                        <path d="M3 12h.01"></path>
                        <path d="M3 18h.01"></path>

                    </svg>

                </button>

            </div>

        </section>

        <section class="panel matching-table-card">

            <div class="table-wrap">

                <table class="matching-table">

                    <thead>
                        <tr>

                            <th>
                                SKU / UPC
                            </th>

                            <th>
                                Nama Barang
                            </th>

                            <th>
                                Target
                            </th>

                            <th>
                                Packing
                            </th>

                            <th>
                                Loading
                            </th>

                            <th>
                                Selisih
                            </th>

                        </tr>
                    </thead>

                    <tbody></tbody>

                </table>

            </div>

            <div
                id="matchingPagination"
                class="pagination hidden">
            </div>

        </section>

        <section class="panel matching-summary">

            <div class="matching-summary-title">
                Ringkasan DPV
            </div>

            <div class="matching-summary-grid">

                <div class="matching-summary-item">

                    <div class="matching-summary-label">
                        Total Item
                    </div>

                    <div
                        id="matchingTotalItem"
                        class="matching-summary-value">
                        0
                    </div>

                </div>

                <div class="matching-summary-item">

                    <div class="matching-summary-label">
                        Total Qty Target
                    </div>

                    <div
                        id="matchingTotalTarget"
                        class="matching-summary-value">
                        0
                    </div>

                </div>

                <div class="matching-summary-item">

                    <div class="matching-summary-label">
                        Total Packing
                    </div>

                    <div
                        id="matchingTotalPacking"
                        class="matching-summary-value">
                        0
                    </div>

                </div>

                <div class="matching-summary-item">

                    <div class="matching-summary-label">
                        Total Loading
                    </div>

                    <div
                        id="matchingTotalLoading"
                        class="matching-summary-value">
                        0
                    </div>

                </div>

                <div class="matching-summary-item">

                    <div class="matching-summary-label">
                        Selisih Packing / Loading
                    </div>

                    <div
                        id="matchingTotalDifference"
                        class="matching-summary-value">
                        0
                    </div>

                </div>

            </div>

            <div
                id="matchingWarning"
                class="matching-warning hidden">

                <span class="matching-warning-icon">
                    !
                </span>

                <span>
                    Masih ada barang yang belum sesuai.
                    Periksa kembali proses Packing atau Loading.
                </span>

            </div>

        </section>
    `;

    const select = $("matchingShipmentSelect");

    select?.addEventListener("change", async (event) => {
        const shipmentId = String(event.target.value || "").trim();

        activeMatchingShipmentId = shipmentId;

        matchingCurrentPage = 1;
        matchingSearch = "";
        matchingSort = "default";

        const searchInput = $("matchingSearchInput");

        if (searchInput) {
            searchInput.value = "";
        }

        if (!shipmentId) {
            matchingRows = [];
            matchingComparison = null;

            renderMatchingTable();
            renderMatchingSummary();

            return;
        }

        await loadMatchingData(shipmentId);
    });

    $("matchingSearchInput")?.addEventListener("input", (event) => {
        matchingSearch = event.target.value || "";

        matchingCurrentPage = 1;

        renderMatchingTable();
    });

    $("matchingSortBtn")?.addEventListener("click", () => {
        const sortOrder = ["default", "name", "sku", "difference"];

        const currentIndex = sortOrder.indexOf(matchingSort);

        matchingSort = sortOrder[(currentIndex + 1) % sortOrder.length];

        matchingCurrentPage = 1;

        renderMatchingTable();
    });

    page.addEventListener("click", handleMatchingClick);

    matchingReady = true;

    renderMatchingTable();
    renderMatchingSummary();
}

async function loadMatchingShipments() {
    const select = $("matchingShipmentSelect");

    if (!select) {
        return;
    }

    select.innerHTML = `
        <option value="">
            Memuat DPV...
        </option>
    `;

    try {
        const response = await api("getShipments", {});

        if (!response?.success) {
            throw new Error(response?.message || "Gagal memuat DPV.");
        }

        matchingShipments = getShipmentRows(response);

        /*
         * PENTING:
         * Jangan filter berdasarkan status.
         *
         * getShipments() dari Code.gs
         * mengembalikan semua DPV.
         *
         * Jadi DPV PENDING juga harus
         * tetap muncul di Matching.
         */

        const validRows = matchingShipments.filter((row) => getShipmentId(row));

        select.innerHTML = `
            <option value="">
                Pilih DPV
            </option>

            ${
                validRows.length
                    ? validRows
                          .map((row) => {
                              const id = getShipmentId(row);

                              const name = getShipmentName(row);

                              return `
                                <option
                                    value="${esc(id)}">

                                    ${esc(name)}

                                </option>
                            `;
                          })
                          .join("")
                    : ""
            }
        `;

        if (!validRows.length) {
            select.innerHTML = `
                <option value="">
                    Tidak ada DPV
                </option>
            `;
        }

        if (activeMatchingShipmentId && validRows.some((row) => getShipmentId(row) === activeMatchingShipmentId)) {
            select.value = activeMatchingShipmentId;
        }
    } catch (error) {
        console.error("Load Matching DPV error:", error);

        matchingShipments = [];

        select.innerHTML = `
            <option value="">
                Gagal memuat DPV
            </option>
        `;

        toast(error?.message || "Gagal memuat DPV.", true);
    }
}

async function loadMatchingData(shipmentId) {
    if (!shipmentId) {
        matchingRows = [];
        matchingComparison = null;

        renderMatchingTable();
        renderMatchingSummary();

        return;
    }

    busy(true);

    try {
        const response = await api("getMatching", {
            shipmentId: shipmentId,
        });

        if (!response?.success) {
            throw new Error(response?.message || "Gagal memuat data Matching.");
        }

        /*
         * Struktur Code.gs:
         *
         * {
         *   success: true,
         *   ready: ...,
         *   comparison: {
         *      totalItems,
         *      totalTarget,
         *      totalPacked,
         *      totalLoaded,
         *      items: [...]
         *   }
         * }
         */

        matchingComparison = response.comparison || null;

        const items = matchingComparison?.items;

        matchingRows = Array.isArray(items) ? items.map(normalizeMatchingRow) : [];

        matchingCurrentPage = 1;

        renderMatchingTable();
        renderMatchingSummary();
    } catch (error) {
        console.error("Load Matching error:", error);

        matchingRows = [];
        matchingComparison = null;

        renderMatchingTable();
        renderMatchingSummary();

        toast(error?.message || "Gagal memuat data Matching.", true);
    } finally {
        busy(false);
    }
}

function getFilteredMatchingRows() {
    let rows = [...matchingRows];

    const search = matchingSearch.trim().toLowerCase();

    if (search) {
        rows = rows.filter((item) => String(item.sku).toLowerCase().includes(search) || String(item.upc).toLowerCase().includes(search) || String(item.name).toLowerCase().includes(search));
    }

    if (matchingSort === "name") {
        rows.sort((a, b) => String(a.name).localeCompare(String(b.name), "id"));
    }

    if (matchingSort === "sku") {
        rows.sort((a, b) => String(a.sku).localeCompare(String(b.sku), "id"));
    }

    if (matchingSort === "difference") {
        rows.sort((a, b) => Number(a.difference) - Number(b.difference));
    }

    return rows;
}

function renderMatchingTable() {
    const tbody = document.querySelector(".matching-table tbody");

    if (!tbody) {
        return;
    }

    const filteredRows = getFilteredMatchingRows();

    const totalPages = Math.ceil(filteredRows.length / MATCHING_ROWS_PER_PAGE);

    if (matchingCurrentPage > totalPages) {
        matchingCurrentPage = totalPages || 1;
    }

    const startIndex = (matchingCurrentPage - 1) * MATCHING_ROWS_PER_PAGE;

    const pageRows = filteredRows.slice(startIndex, startIndex + MATCHING_ROWS_PER_PAGE);

    if (!activeMatchingShipmentId) {
        tbody.innerHTML = `
            <tr>
                <td
                    colspan="6"
                    style="
                        text-align:center;
                        padding:30px;
                        color:var(--text-muted);
                    ">

                    Pilih DPV terlebih dahulu.

                </td>
            </tr>
        `;

        renderMatchingPagination(0);

        return;
    }

    if (!pageRows.length) {
        tbody.innerHTML = `
            <tr>
                <td
                    colspan="6"
                    style="
                        text-align:center;
                        padding:30px;
                        color:var(--text-muted);
                    ">

                    Tidak ada data Matching.

                </td>
            </tr>
        `;

        renderMatchingPagination(0);

        return;
    }

    tbody.innerHTML = pageRows
        .map((item) => {
            const difference = Number(item.difference);

            const mismatch = difference !== 0;

            return `
                    <tr
                        class="
                            matching-row
                            ${mismatch ? "mismatch" : ""}
                        ">

                        <td>

                            <div class="matching-sku">

                                <span
                                    class="matching-status-dot">
                                </span>

                                ${esc(item.sku)}

                            </div>

                            <div class="matching-upc">

                                ${esc(item.upc || "-")}

                            </div>

                        </td>

                        <td>
                            <strong>
                                ${esc(item.name)}
                            </strong>
                        </td>

                        <td>
                            ${Number(item.target || 0)}
                        </td>

                        <td>
                            ${Number(item.packing || 0)}
                        </td>

                        <td>
                            ${Number(item.loading || 0)}
                        </td>

                        <td
                            class="
                                matching-difference
                                ${difference === 0 ? "matching-ok" : ""}
                            ">

                            ${difference}

                        </td>

                    </tr>
                `;
        })
        .join("");

    renderMatchingPagination(totalPages);
}

function renderMatchingPagination(totalPages) {
    const pagination = $("matchingPagination");

    if (!pagination) {
        return;
    }

    if (totalPages <= 1) {
        pagination.innerHTML = "";
        pagination.classList.add("hidden");

        return;
    }

    pagination.classList.remove("hidden");

    const pages = getMatchingPaginationPages(matchingCurrentPage, totalPages);

    pagination.innerHTML = `
        <div class="pagination-controls">

            <button
                type="button"
                class="pagination-btn"
                data-page="${matchingCurrentPage - 1}"
                ${matchingCurrentPage === 1 ? "disabled" : ""}
                aria-label="Halaman sebelumnya">

                ‹

            </button>

            ${pages
                .map((page) => {
                    if (page === "...") {
                        return `
                                <span
                                    class="pagination-dots">
                                    …
                                </span>
                            `;
                    }

                    return `
                            <button
                                type="button"
                                class="
                                    pagination-btn
                                    ${page === matchingCurrentPage ? "active" : ""}
                                "
                                data-page="${page}">

                                ${page}

                            </button>
                        `;
                })
                .join("")}

            <button
                type="button"
                class="pagination-btn"
                data-page="${matchingCurrentPage + 1}"
                ${matchingCurrentPage === totalPages ? "disabled" : ""}
                aria-label="Halaman berikutnya">

                ›

            </button>

        </div>
    `;
}

function getMatchingPaginationPages(currentPage, totalPages) {
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

function renderMatchingSummary() {
    const comparison = matchingComparison;

    const totalItem = Number(comparison?.totalItems ?? matchingRows.length ?? 0);

    const totalTarget = Number(comparison?.totalTarget ?? 0);

    const totalPacking = Number(comparison?.totalPacked ?? 0);

    const totalLoading = Number(comparison?.totalLoaded ?? 0);

    const totalDifference = totalLoading - totalPacking;

    const mismatchCount = matchingRows.filter((item) => Number(item.difference || 0) !== 0).length;

    const totalItemElement = $("matchingTotalItem");

    const totalTargetElement = $("matchingTotalTarget");

    const totalPackingElement = $("matchingTotalPacking");

    const totalLoadingElement = $("matchingTotalLoading");

    const totalDifferenceElement = $("matchingTotalDifference");

    if (totalItemElement) {
        totalItemElement.textContent = totalItem;
    }

    if (totalTargetElement) {
        totalTargetElement.textContent = totalTarget;
    }

    if (totalPackingElement) {
        totalPackingElement.textContent = totalPacking;
    }

    if (totalLoadingElement) {
        totalLoadingElement.textContent = totalLoading;
    }

    if (totalDifferenceElement) {
        totalDifferenceElement.textContent = totalDifference;
    }

    const warning = $("matchingWarning");

    if (!warning) {
        return;
    }

    if (!activeMatchingShipmentId || !matchingComparison || mismatchCount === 0) {
        warning.classList.add("hidden");

        return;
    }

    warning.classList.remove("hidden");

    warning.innerHTML = `
        <span
            class="matching-warning-icon">
            !
        </span>

        <span>
            Masih ada
            ${mismatchCount}
            barang yang belum sesuai.
            Periksa kembali proses
            Packing atau Loading.
        </span>
    `;
}

function handleMatchingClick(event) {
    const button = event.target.closest("#matchingPagination [data-page]");

    if (!button || button.disabled) {
        return;
    }

    const page = Number(button.dataset.page);

    if (!page) {
        return;
    }

    matchingCurrentPage = page;

    renderMatchingTable();
}

export function bindMatching() {
    prepareMatchingLayout();
}

export async function loadMatching() {
    prepareMatchingLayout();

    await loadMatchingShipments();

    if (activeMatchingShipmentId) {
        await loadMatchingData(activeMatchingShipmentId);
    } else {
        matchingRows = [];
        matchingComparison = null;

        renderMatchingTable();
        renderMatchingSummary();
    }
}
