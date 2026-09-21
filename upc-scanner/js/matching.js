/* =========================================================
   MATCHING — UI ONLY
   ========================================================= */

import { $ } from "./state.js";

let matchingReady = false;

const MATCHING_ROWS_PER_PAGE = 5;

let matchingCurrentPage = 1;
let matchingSearch = "";
let matchingSort = "default";

const matchingDummyRows = [
    {
        sku: "ABC001",
        upc: "123456789",
        name: "Kursi Kayu",
        target: 100,
        packing: 100,
        loading: 98,
    },
    {
        sku: "ABC002",
        upc: "223456780",
        name: "Meja Lipat Kecil",
        target: 50,
        packing: 50,
        loading: 50,
    },
    {
        sku: "ABC003",
        upc: "323456781",
        name: "Rak Buku 3 Susun",
        target: 40,
        packing: 38,
        loading: 38,
    },
    {
        sku: "ABC004",
        upc: "423456782",
        name: "Lemari Plastik",
        target: 25,
        packing: 25,
        loading: 25,
    },
    {
        sku: "ABC005",
        upc: "523456783",
        name: "Bangku Panjang",
        target: 60,
        packing: 60,
        loading: 60,
    },
    {
        sku: "ABC006",
        upc: "623456784",
        name: "Meja Bundar",
        target: 30,
        packing: 30,
        loading: 30,
    },
    {
        sku: "ABC007",
        upc: "723456785",
        name: "Rak Sepatu",
        target: 45,
        packing: 45,
        loading: 43,
    },
];

function prepareMatchingLayout() {
    const page = $("page-matching");

    if (!page || matchingReady) {
        return;
    }

    page.innerHTML = `
        <div class="page-head">

            <h2>
                Matching
            </h2>

            <p>
                Periksa kesesuaian DPV, Packing, dan Loading.
            </p>

        </div>

        <section class="matching-top-bar">

            <div class="matching-shipment-selector">

                <select
                    id="matchingShipmentSelect"
                    class="input">

                    <option value="607">
                        Shipment 607
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
                        stroke-linejoin="round"
                        aria-hidden="true">

                        <path d="M8 6h13"></path>
                        <path d="M8 12h10"></path>
                        <path d="M8 18h7"></path>

                        <path d="M3 6h.01"></path>
                        <path d="M3 12h.01"></path>
                        <path d="M3 18h.01"></path>

                    </svg>

                </button>

                <button
                    id="finishMatchingBtn"
                    class="btn btn-primary matching-finish-btn"
                    type="button"
                    disabled>

                    Selesaikan Matching

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
                                Qty Target
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

                    <tbody>
                    </tbody>

                </table>

            </div>

            <div
                id="matchingPagination"
                class="matching-pagination hidden">
            </div>

        </section>

        <section class="panel matching-summary">

            <div class="matching-summary-title">
                Ringkasan Shipment
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
                        Total Selisih
                    </div>

                    <div
                        id="matchingTotalDifference"
                        class="matching-summary-value matching-total-error">

                        0

                    </div>

                </div>

            </div>

            <div
                id="matchingWarning"
                class="matching-warning">

                <span class="matching-warning-icon">
                    !
                </span>

                <span>
                    Masih ada barang yang belum sesuai.
                    Periksa kembali proses Packing atau Loading
                    sebelum menyelesaikan Matching.
                </span>

            </div>

        </section>
    `;

    page.addEventListener("click", handleMatchingClick);

    $("matchingSearchInput")?.addEventListener("input", (event) => {
        matchingSearch = event.target.value;

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

    matchingReady = true;

    renderMatchingTable();
    renderMatchingSummary();
}

function getFilteredMatchingRows() {
    let rows = [...matchingDummyRows];

    const search = matchingSearch.trim().toLowerCase();

    if (search) {
        rows = rows.filter((item) => {
            return String(item.sku).toLowerCase().includes(search) || String(item.upc).toLowerCase().includes(search) || String(item.name).toLowerCase().includes(search);
        });
    }

    if (matchingSort === "name") {
        rows.sort((a, b) => a.name.localeCompare(b.name, "id"));
    }

    if (matchingSort === "sku") {
        rows.sort((a, b) => a.sku.localeCompare(b.sku, "id"));
    }

    if (matchingSort === "difference") {
        rows.sort((a, b) => {
            const diffA = Number(a.loading) - Number(a.target);

            const diffB = Number(b.loading) - Number(b.target);

            return diffA - diffB;
        });
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

                    Data tidak ditemukan.

                </td>

            </tr>
        `;
    } else {
        tbody.innerHTML = pageRows
            .map((item) => {
                const difference = Number(item.loading) - Number(item.target);

                const mismatch = difference !== 0;

                return `
                        <tr
                            class="matching-row ${mismatch ? "mismatch" : ""}">

                            <td>

                                <div class="matching-sku">

                                    <span
                                        class="matching-status-dot">
                                    </span>

                                    ${item.sku}

                                </div>

                                <div class="matching-upc">
                                    ${item.upc}
                                </div>

                            </td>

                            <td>
                                <strong>
                                    ${item.name}
                                </strong>
                            </td>

                            <td>
                                ${item.target}
                            </td>

                            <td>
                                ${item.packing}
                            </td>

                            <td>
                                ${item.loading}
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
    }

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

    let html = `
        <button
            type="button"
            class="matching-page-btn"
            data-page="${matchingCurrentPage - 1}"
            ${matchingCurrentPage === 1 ? "disabled" : ""}>

            ‹

        </button>
    `;

    for (let page = 1; page <= totalPages; page++) {
        html += `
            <button
                type="button"
                class="
                    matching-page-btn
                    ${page === matchingCurrentPage ? "active" : ""}
                "
                data-page="${page}">

                ${page}

            </button>
        `;
    }

    html += `
        <button
            type="button"
            class="matching-page-btn"
            data-page="${matchingCurrentPage + 1}"
            ${matchingCurrentPage === totalPages ? "disabled" : ""}>

            ›

        </button>
    `;

    pagination.innerHTML = html;
}

function renderMatchingSummary() {
    const totalItem = matchingDummyRows.length;

    const totalTarget = matchingDummyRows.reduce((sum, item) => sum + Number(item.target || 0), 0);

    const totalPacking = matchingDummyRows.reduce((sum, item) => sum + Number(item.packing || 0), 0);

    const totalLoading = matchingDummyRows.reduce((sum, item) => sum + Number(item.loading || 0), 0);

    const totalDifference = totalLoading - totalTarget;

    $("matchingTotalItem").textContent = totalItem;

    $("matchingTotalTarget").textContent = totalTarget;

    $("matchingTotalPacking").textContent = totalPacking;

    $("matchingTotalLoading").textContent = totalLoading;

    $("matchingTotalDifference").textContent = totalDifference;

    const mismatchCount = matchingDummyRows.filter((item) => Number(item.loading) !== Number(item.target)).length;

    const warning = $("matchingWarning");

    if (warning) {
        if (mismatchCount === 0) {
            warning.classList.add("hidden");
        } else {
            warning.classList.remove("hidden");

            warning.innerHTML = `
                <span class="matching-warning-icon">
                    !
                </span>

                <span>
                    Masih ada
                    ${mismatchCount}
                    barang yang belum sesuai.
                    Periksa kembali proses
                    Packing atau Loading
                    sebelum menyelesaikan
                    Matching.
                </span>
            `;
        }
    }

    const finishButton = $("finishMatchingBtn");

    if (finishButton) {
        finishButton.disabled = mismatchCount !== 0;
    }
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
}
