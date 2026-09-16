import { state, $, busy, toast } from "./state.js";
import { api } from "./api.js";

let shipments = [];
let activeShipmentId = "";
let activeShipment = null;
let packingRows = [];
let todayHistoryRows = [];

let lastDetected = "";
let lastDetectedAt = 0;

let packingCameraRunning = false;
let packingCameraHandler = null;
let cameraPermissionStream = null;

function esc(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getShipmentId(row) {
    return String(row?.shipmentId ?? row?.SHIPMENT_ID ?? row?.id ?? "").trim();
}

function getStatus(row) {
    return String(row?.status ?? row?.STATUS ?? "")
        .trim()
        .toUpperCase();
}

function getTodayKey() {
    const now = new Date();

    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

function getTodayDisplay() {
    const now = new Date();

    return [String(now.getDate()).padStart(2, "0"), String(now.getMonth() + 1).padStart(2, "0"), now.getFullYear()].join("/");
}

function getStorageKey() {
    return `upc_packing_active_shipment_${getTodayKey()}`;
}

function saveActiveShipment() {
    if (activeShipmentId) {
        localStorage.setItem(getStorageKey(), activeShipmentId);
    }
}

function clearActiveShipment() {
    localStorage.removeItem(getStorageKey());
}

function getShipmentItems(shipment) {
    const items = shipment?.items ?? shipment?.ITEMS ?? [];

    return Array.isArray(items) ? items : [];
}

function getPackingRows(response) {
    const rows = response?.packing ?? response?.data?.packing ?? [];

    return Array.isArray(rows) ? rows : [];
}

function normalizePackingRow(row) {
    return {
        shipmentId: String(row?.shipmentId ?? row?.SHIPMENT_ID ?? "").trim(),

        upc: String(row?.upc ?? row?.UPC ?? "").trim(),

        sku: String(row?.sku ?? row?.SKU ?? "-").trim(),

        name: String(row?.name ?? row?.NAMA_BARANG ?? "-").trim(),

        qty: Number(row?.qty ?? row?.QTY ?? 0),

        operator: String(row?.operator ?? row?.petugas ?? row?.PETUGAS ?? "-").trim(),

        // KHUSUS TIMESTAMP LOG SCAN
        timestamp: String(row?.timestamp ?? row?.TIMESTAMP ?? row?.lastScan ?? "").trim(),

        // KHUSUS LAST UPDATE TRANSAKSI
        lastUpdate: String(row?.lastUpdate ?? row?.LAST_UPDATE ?? "").trim(),
    };
}

function parseTimestamp(value) {
    const text = String(value || "").trim();

    if (!text) {
        return null;
    }

    const slashMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})[ ,T]+(\d{2}):(\d{2})(?::(\d{2}))?/);

    if (slashMatch) {
        const date = new Date(Number(slashMatch[3]), Number(slashMatch[2]) - 1, Number(slashMatch[1]), Number(slashMatch[4]), Number(slashMatch[5]), Number(slashMatch[6] || 0));

        if (!Number.isNaN(date.getTime())) {
            return date;
        }
    }

    const dashMatch = text.match(/^(\d{2})-(\d{2})-(\d{4})[ ,T]+(\d{2}):(\d{2})(?::(\d{2}))?/);

    if (dashMatch) {
        const date = new Date(Number(dashMatch[3]), Number(dashMatch[2]) - 1, Number(dashMatch[1]), Number(dashMatch[4]), Number(dashMatch[5]), Number(dashMatch[6] || 0));

        if (!Number.isNaN(date.getTime())) {
            return date;
        }
    }

    const date = new Date(text);

    if (!Number.isNaN(date.getTime())) {
        return date;
    }

    return null;
}

function formatTimestamp(value) {
    const date = parseTimestamp(value);

    if (!date) {
        return "-";
    }

    const day = String(date.getDate()).padStart(2, "0");

    const month = String(date.getMonth() + 1).padStart(2, "0");

    const year = date.getFullYear();

    const hour = String(date.getHours()).padStart(2, "0");

    const minute = String(date.getMinutes()).padStart(2, "0");

    return `${day}/${month}/${year} ${hour}:${minute}`;
}

function formatRelativeTime(value) {
    const date = parseTimestamp(value);

    if (!date) {
        return "-";
    }

    const diff = Date.now() - date.getTime();

    if (diff < 0) {
        return "Baru saja";
    }

    const seconds = Math.floor(diff / 1000);

    if (seconds < 10) {
        return "Baru saja";
    }

    if (seconds < 60) {
        return `${seconds} detik yang lalu`;
    }

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
        return `${minutes} menit yang lalu`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return `${hours} jam yang lalu`;
    }

    const days = Math.floor(hours / 24);

    if (days < 30) {
        return `${days} hari yang lalu`;
    }

    const months = Math.floor(days / 30);

    if (months < 12) {
        return `${months} bulan yang lalu`;
    }

    const years = Math.floor(days / 365);

    return `${years} tahun yang lalu`;
}

function timestampHtml(value) {
    const full = formatTimestamp(value);
    const relative = formatRelativeTime(value);

    if (full === "-") {
        return "-";
    }

    return `
        <span
            class="packing-timestamp"
            data-tooltip="${esc(relative)}">
            ${esc(full)}
        </span>
    `;
}

function isTodayRow(row) {
    const timestamp = String(row?.timestamp ?? row?.TIMESTAMP ?? row?.lastUpdate ?? row?.LAST_UPDATE ?? "").trim();

    if (!timestamp) {
        return false;
    }

    const today = getTodayDisplay();

    if (timestamp.startsWith(today)) {
        return true;
    }

    const parsed = parseTimestamp(timestamp);

    if (!parsed) {
        return false;
    }

    const now = new Date();

    return parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth() && parsed.getDate() === now.getDate();
}

function getShipmentRows(result) {
    if (Array.isArray(result?.rows)) {
        return result.rows;
    }

    if (Array.isArray(result?.data?.rows)) {
        return result.data.rows;
    }

    if (Array.isArray(result?.shipments)) {
        return result.shipments;
    }

    if (Array.isArray(result?.data?.shipments)) {
        return result.data.shipments;
    }

    return [];
}

function preparePackingLayout() {
    const page = $("page-packing");

    if (!page) {
        return;
    }

    if (page.dataset.packingReady === "1") {
        return;
    }

    page.innerHTML = `
        <div class="page-head">

            <h2>
                Packing
            </h2>

            <p>
                Scan barang yang akan dikirim.
            </p>

        </div>

        <div class="packing-top-grid">

            <section class="panel packing-scanner-card">

                <div class="packing-scanner-head">

                    <div>

                        <div class="section-title">
                            Scanner
                        </div>

                        <div
                            id="packingActiveShipmentLabel"
                            class="packing-active-shipment">
                            Shipment: -
                        </div>

                    </div>

                    <button
                        id="packingChooseShipmentBtn"
                        class="btn btn-soft"
                        type="button">
                        Pilih Shipment
                    </button>

                </div>

                <div class="scanner-status">

                    <span class="dot"></span>

                    Scanner Ready

                </div>

                <div class="scan-actions">

                    <button
                        id="packingCameraBtn"
                        class="btn btn-primary"
                        type="button">
                        Kamera
                    </button>

                    <button
                        id="packingManualFocusBtn"
                        class="btn btn-soft"
                        type="button">
                        Scanner
                    </button>

                </div>

                <input
                    id="packingScanInput"
                    class="scan-input input"
                    inputmode="numeric"
                    autocomplete="off"
                    placeholder="Pilih Shipment terlebih dahulu..."
                    aria-label="UPC Packing">

                <div class="hint">
                    Scanner USB/Bluetooth dapat digunakan melalui
                    input ini. Barcode + Enter akan langsung diproses.
                </div>

                <div
                    id="packingLastResult"
                    class="last">

                    <div class="last-title">
                        HASIL SCAN TERAKHIR
                    </div>

                    <div class="last-name">
                        Belum ada scan
                    </div>

                    <div class="last-meta">
                        Pilih Shipment lalu mulai scan.
                    </div>

                </div>

            </section>

            <section class="panel packing-history-card">

                <div class="section-title">
                    Riwayat Scan
                </div>

                <div
                    id="packingHistoryRows"
                    class="table-wrap">
                </div>

            </section>

        </div>

        <section class="panel packing-result-card">

            <div class="packing-result-head">

                <div>

                    <div
                        id="packingResultTitle"
                        class="section-title">
                        Hasil scan packing
                    </div>

                    <div
                        id="packingResultSubtitle"
                        class="packing-result-subtitle">
                        Pilih Shipment untuk melihat hasil scan.
                    </div>

                </div>

            </div>

            <div
                id="packingResultRows"
                class="table-wrap">
            </div>

        </section>

        <div
            id="packingActionArea"
            class="packing-action-area">
        </div>
    `;

    page.dataset.packingReady = "1";

    $("packingChooseShipmentBtn")?.addEventListener("click", showShipmentSelectModal);

    $("packingCameraBtn")?.addEventListener("click", openPackingCamera);

    $("packingManualFocusBtn")?.addEventListener("click", focusPackingInput);

    const scanInput = $("packingScanInput");

    scanInput?.addEventListener("keydown", async (event) => {
        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();

        const value = event.target.value.trim();

        event.target.value = "";

        if (value) {
            await processScan(value);
        }
    });

    const modal = $("modal");

    if (modal) {
        modal.addEventListener("click", (event) => {
            const closeButton = event.target.closest('[data-action="close-modal"]');

            if (closeButton) {
                closePackingModal();
            }
        });
    }

    window.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }

        const currentModal = $("modal");

        if (currentModal && !currentModal.classList.contains("hidden")) {
            closePackingModal();
        }
    });

    window.addEventListener("packing:stop", () => {
        stopPackingCamera();
    });
}

function renderActiveShipment() {
    const label = $("packingActiveShipmentLabel");

    if (!label) {
        return;
    }

    label.textContent = activeShipmentId ? `Shipment: ${activeShipmentId}` : "Shipment: -";
}

function showShipmentSelectModal() {
    const modal = $("modal");
    const content = $("modalContent");

    if (!modal || !content) {
        toast("Modal tidak ditemukan.", true);

        return;
    }

    stopPackingCamera();

    const availableShipments = (Array.isArray(shipments) ? shipments : [])
        .filter((shipment) => getStatus(shipment) !== "SELESAI")
        .map((shipment) => getShipmentId(shipment))
        .filter(Boolean);

    if (!availableShipments.length) {
        toast("Tidak ada Shipment yang tersedia untuk Packing.", true);

        return;
    }

    content.innerHTML = `
        <div class="modal-head">

            <h3>
                Pilih Shipment
            </h3>

            <button
                class="close"
                data-action="close-modal"
                aria-label="Tutup"
                type="button">
                ×
            </button>

        </div>

        <div class="packing-shipment-modal">

            <div class="packing-field">

                <label
                    for="packingShipmentModalSelect">
                    Shipment
                </label>

                <select
                    id="packingShipmentModalSelect"
                    class="input">

                    <option value="">
                        Pilih Shipment
                    </option>

                    ${availableShipments
                        .map(
                            (id) => `
                                <option
                                    value="${esc(id)}"
                                    ${id === activeShipmentId ? "selected" : ""}>
                                    ${esc(id)}
                                </option>
                            `,
                        )
                        .join("")}

                </select>

            </div>

        </div>
    `;

    modal.classList.remove("hidden");

    const select = $("packingShipmentModalSelect");

    select?.addEventListener("change", async (event) => {
        const shipmentId = String(event.target.value || "").trim();

        if (!shipmentId) {
            return;
        }

        await selectShipment(shipmentId);
    });

    requestAnimationFrame(() => {
        select?.focus();
    });
}

function renderLastResult(row) {
    const box = $("packingLastResult");

    if (!box) {
        return;
    }

    if (!row) {
        box.innerHTML = `
            <div class="last-title">
                HASIL SCAN TERAKHIR
            </div>

            <div class="last-name">
                Belum ada scan
            </div>

            <div class="last-meta">
                Pilih Shipment lalu mulai scan.
            </div>
        `;

        return;
    }

    const item = normalizePackingRow(row);

    box.innerHTML = `
        <div class="last-title">
            HASIL SCAN TERAKHIR
        </div>

        <div class="last-name">
            ${esc(item.name || "-")}
        </div>

        <div class="last-meta">
            UPC:
            ${esc(item.upc || "-")}
            · SKU:
            ${esc(item.sku || "-")}
        </div>

        <div class="last-meta">
            Timestamp:
            ${timestampHtml(item.timestamp)}
        </div>

        <div class="last-qty">
            Qty:
            ${Number(item.qty || 0)}
        </div>
    `;
}

function renderLastError(message) {
    const box = $("packingLastResult");

    if (!box) {
        return;
    }

    box.innerHTML = `
        <div
            class="last-title"
            style="color:var(--danger)">
            SCAN GAGAL
        </div>

        <div
            class="last-name"
            style="color:var(--danger)">
            UPC Tidak Ditemukan
        </div>

        <div class="last-meta">
            ${esc(message || "Scan gagal.")}
        </div>
    `;
}

function renderHistory() {
    const container = $("packingHistoryRows");

    if (!container) {
        return;
    }

    // Ambil setiap record LOG SCAN secara individual.
    // Tidak dilakukan grouping berdasarkan UPC.
    const rows = todayHistoryRows.map(normalizePackingRow).filter((row) => row.upc && row.shipmentId);

    // Terbaru di atas
    rows.sort((a, b) => (parseTimestamp(b.timestamp)?.getTime() || 0) - (parseTimestamp(a.timestamp)?.getTime() || 0));

    container.innerHTML = `
        <table class="table">

            <thead>
                <tr>
                    <th>UPC</th>
                    <th>SKU</th>
                    <th>Nama Barang</th>
                    <th>Qty</th>
                    <th>Nama Petugas</th>
                    <th>Timestamp</th>
                </tr>
            </thead>

            <tbody>

                ${
                    rows.length
                        ? rows
                              .map(
                                  (row) => `
                                    <tr>

                                        <td>
                                            ${esc(row.upc)}
                                        </td>

                                        <td>
                                            ${esc(row.sku)}
                                        </td>

                                        <td>
                                            ${esc(row.name)}
                                        </td>

                                        <td class="qty">
                                            ${Number(row.qty || 0)}
                                        </td>

                                        <td>
                                            ${esc(row.operator || "-")}
                                        </td>

                                        <td>
                                            ${timestampHtml(row.timestamp)}
                                        </td>

                                    </tr>
                                `,
                              )
                              .join("")
                        : `
                            <tr>
                                <td
                                    colspan="6"
                                    class="packing-result-empty">
                                    Belum ada riwayat scan hari ini.
                                </td>
                            </tr>
                        `
                }

            </tbody>

        </table>
    `;
}

function renderPackingResult() {
    const title = $("packingResultTitle");

    const subtitle = $("packingResultSubtitle");

    const container = $("packingResultRows");

    if (!container) {
        return;
    }

    if (!activeShipmentId) {
        if (title) {
            title.textContent = "Hasil scan packing";
        }

        if (subtitle) {
            subtitle.textContent = "Pilih Shipment untuk melihat hasil scan.";
        }

        container.innerHTML = `
            <table
                class="table packing-result-table">

                <thead>

                    <tr>

                        <th>
                            UPC
                        </th>

                        <th>
                            SKU
                        </th>

                        <th>
                            Nama Barang
                        </th>

                        <th>
                            Qty
                        </th>

                        <th>
                            Last Update
                        </th>

                    </tr>

                </thead>

                <tbody>

                    <tr>

                        <td
                            colspan="5"
                            class="packing-result-empty">
                            Pilih Shipment untuk melihat hasil scan.
                        </td>

                    </tr>

                </tbody>

            </table>
        `;

        return;
    }

    if (title) {
        title.textContent = `Hasil scan packing ${activeShipmentId}`;
    }

    if (subtitle) {
        subtitle.textContent = "Hasil scan barang untuk shipment ini.";
    }

    const sourceRows = packingRows.map(normalizePackingRow).filter((row) => row.upc);

    const grouped = new Map();

    sourceRows.forEach((row) => {
        const key = row.upc;

        const existing = grouped.get(key);

        if (!existing) {
            grouped.set(key, {
                ...row,
                qty: Number(row.qty || 0),
            });

            return;
        }

        existing.qty += Number(row.qty || 0);

        const currentTime = parseTimestamp(existing.timestamp)?.getTime() || 0;

        const newTime = parseTimestamp(row.timestamp)?.getTime() || 0;

        if (newTime >= currentTime) {
            existing.sku = row.sku || existing.sku;

            existing.name = row.name || existing.name;

            existing.operator = row.operator || existing.operator;

            existing.timestamp = row.timestamp || existing.timestamp;
        }
    });

    const rows = Array.from(grouped.values());

    rows.sort((a, b) => (parseTimestamp(b.timestamp)?.getTime() || 0) - (parseTimestamp(a.timestamp)?.getTime() || 0));

    container.innerHTML = `
        <table
            class="table packing-result-table">

            <thead>

                <tr>

                    <th>
                        UPC
                    </th>

                    <th>
                        SKU
                    </th>

                    <th>
                        Nama Barang
                    </th>

                    <th>
                        Qty
                    </th>

                    <th>
                        Last Update
                    </th>

                </tr>

            </thead>

            <tbody>

                ${
                    rows.length
                        ? rows
                              .map(
                                  (row) => `
                                    <tr>

                                        <td>
                                            ${esc(row.upc)}
                                        </td>

                                        <td>
                                            ${esc(row.sku)}
                                        </td>

                                        <td>
                                            ${esc(row.name)}
                                        </td>

                                        <td class="qty">
                                            ${Number(row.qty || 0)}
                                        </td>

                                        <td>
                                            ${timestampHtml(row.lastUpdate)}
                                        </td>

                                    </tr>
                                `,
                              )
                              .join("")
                        : `
                            <tr>

                                <td
                                    colspan="5"
                                    class="packing-result-empty">
                                    Belum ada hasil scan untuk
                                    ${esc(activeShipmentId)}.
                                </td>

                            </tr>
                        `
                }

            </tbody>

        </table>
    `;
}

function renderActionArea() {
    const actions = $("packingActionArea");

    if (!actions) {
        return;
    }

    if (!activeShipmentId) {
        actions.innerHTML = "";

        return;
    }

    const status = getStatus(activeShipment);

    if (status === "PACKING" && packingRows.length) {
        actions.innerHTML = `
            <button
                id="finishPackingBtn"
                class="btn btn-primary"
                type="button">
                Selesaikan Packing
            </button>
        `;

        $("finishPackingBtn")?.addEventListener("click", finishPacking);

        return;
    }

    if (status === "READY LOADING") {
        actions.innerHTML = `
            <div class="packing-finished-message">
                Packing sudah selesai.
                Shipment siap untuk Loading.
            </div>
        `;

        return;
    }

    actions.innerHTML = "";
}

function renderPackingPage() {
    renderActiveShipment();
    renderHistory();
    renderPackingResult();
    renderActionArea();

    const input = $("packingScanInput");

    const cameraBtn = $("packingCameraBtn");

    const manualBtn = $("packingManualFocusBtn");

    const status = getStatus(activeShipment);

    const canScan = !!activeShipmentId && status === "PACKING";

    if (cameraBtn) {
        cameraBtn.disabled = !canScan;
    }

    if (manualBtn) {
        manualBtn.disabled = !canScan;
    }

    if (input) {
        input.disabled = !canScan;

        input.placeholder = canScan ? "Scan UPC di sini..." : "Pilih Shipment terlebih dahulu...";
    }
}

async function loadShipments() {
    try {
        const response = await api("getShipments");

        if (!response?.success) {
            throw new Error(response?.message || "Gagal mengambil data Shipment.");
        }

        shipments = getShipmentRows(response);

        if (!Array.isArray(shipments)) {
            shipments = [];
        }
    } catch (error) {
        console.error("Load Packing Shipment:", error);

        shipments = [];

        throw error;
    }
}

async function loadTodayHistory() {
    try {
        const response = await api("getTodayRowsForUser");

        if (!response?.success) {
            console.warn("Gagal mengambil riwayat scan:", response?.message);

            /*
             * Jangan hapus riwayat yang sedang
             * tampil jika server gagal merespons.
             */
            renderHistory();

            return;
        }

        const rows = response.rows || response.data?.rows || [];

        if (!Array.isArray(rows)) {
            renderHistory();

            return;
        }

        /*
         * Data dari server adalah sumber utama.
         * Backend sudah mengembalikan semua scan
         * hari ini satu per satu.
         */
        todayHistoryRows = rows.map((row) => ({
            shipmentId: String(row.shipmentId || row.SHIPMENT_ID || ""),

            upc: String(row.upc || row.UPC || ""),

            sku: String(row.sku || row.SKU || "-"),

            name: String(row.name || row.NAMA_BARANG || "-"),

            qty: Number(row.qty || row.QTY || 0),

            operator: String(row.operator || row.operators || row.petugas || row.PETUGAS || "-"),

            /*
             * Riwayat menggunakan TIMESTAMP,
             * bukan LAST_UPDATE.
             */
            timestamp: row.timestamp || row.TIMESTAMP || row.lastScan || "",
        }));

        renderHistory();
    } catch (error) {
        console.error("Load Packing History:", error);

        /*
         * Jangan kosongkan todayHistoryRows
         * hanya karena request gagal.
         */
        renderHistory();
    }
}

async function restoreActiveShipment() {
    const saved = localStorage.getItem(getStorageKey());

    if (!saved) {
        activeShipmentId = "";
        activeShipment = null;
        packingRows = [];

        return;
    }

    const found = shipments.find((shipment) => getShipmentId(shipment) === saved);

    if (!found) {
        clearActiveShipment();

        activeShipmentId = "";
        activeShipment = null;
        packingRows = [];

        return;
    }

    try {
        const response = await api("getShipment", {
            shipmentId: saved,
        });

        if (!response?.success) {
            clearActiveShipment();

            activeShipmentId = "";
            activeShipment = null;
            packingRows = [];

            return;
        }

        const shipment = response.shipment || response.data?.shipment || null;

        if (!shipment || getStatus(shipment) !== "PACKING") {
            clearActiveShipment();

            activeShipmentId = "";
            activeShipment = null;
            packingRows = [];

            return;
        }

        activeShipmentId = saved;

        activeShipment = shipment;

        packingRows = getPackingRows(response);

        saveActiveShipment();
    } catch (error) {
        console.error("Restore Packing Shipment:", error);

        activeShipmentId = "";
        activeShipment = null;
        packingRows = [];

        clearActiveShipment();
    }
}

export async function loadPacking() {
    preparePackingLayout();

    try {
        busy(true);

        await loadShipments();

        await restoreActiveShipment();

        await loadTodayHistory();

        renderPackingPage();

        if (!activeShipmentId) {
            setTimeout(() => {
                showShipmentSelectModal();
            }, 100);
        }
    } catch (error) {
        console.error("Load Packing:", error);

        toast(error?.message || "Gagal memuat Packing.", true);

        renderPackingPage();
    } finally {
        busy(false);
    }
}

async function selectShipment(shipmentId) {
    shipmentId = String(shipmentId || "").trim();

    stopPackingCamera();

    if (!shipmentId) {
        activeShipmentId = "";
        activeShipment = null;
        packingRows = [];

        clearActiveShipment();

        renderPackingPage();

        return;
    }

    try {
        busy(true);

        const response = await api("getShipment", {
            shipmentId,
        });

        if (!response?.success) {
            throw new Error(response?.message || "Shipment tidak ditemukan.");
        }

        const shipment = response.shipment || response.data?.shipment || null;

        if (!shipment) {
            throw new Error("Data Shipment tidak valid.");
        }

        if (getStatus(shipment) !== "PACKING") {
            throw new Error("Shipment ini tidak sedang dalam proses Packing.");
        }

        activeShipmentId = shipmentId;

        activeShipment = shipment;

        packingRows = getPackingRows(response);

        saveActiveShipment();

        renderPackingPage();

        closePackingModal();

        toast(`Shipment ${shipmentId} dipilih.`);
    } catch (error) {
        console.error("Select shipment error:", error);

        toast(error?.message || "Gagal memilih Shipment.", true);
    } finally {
        busy(false);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                focusPackingInput();
            });
        });
    }
}

async function lookupUPC(upc) {
    const value = String(upc || "").trim();

    if (!value) {
        return null;
    }

    const response = await api("lookupUPC", {
        upc: value,
    });

    if (!response?.success) {
        throw new Error(response?.message || "UPC tidak ditemukan.");
    }

    return response.item || response.data?.item || null;
}

async function processScan(upc) {
    const value = String(upc || "").trim();

    if (!value) {
        return;
    }

    if (!activeShipmentId) {
        toast("Pilih Shipment terlebih dahulu.", true);

        focusPackingInput();

        return;
    }

    if (getStatus(activeShipment) !== "PACKING") {
        toast("Shipment ini tidak sedang dalam proses Packing.", true);

        return;
    }

    if (!/^\d+$/.test(value)) {
        toast("UPC harus berupa angka.", true);

        focusPackingInput();

        return;
    }

    const input = $("packingScanInput");

    if (input) {
        input.value = "";
    }

    try {
        busy(true);

        const item = await lookupUPC(value);

        if (!item) {
            throw new Error("UPC tidak ditemukan.");
        }

        showPackingConfirmModal(item);
    } catch (error) {
        console.error("Packing lookup error:", error);

        renderLastError(error?.message || "UPC tidak ditemukan.");

        toast(error?.message || "UPC tidak ditemukan.", true);
    } finally {
        busy(false);
    }
}

function showPackingConfirmModal(item) {
    const modal = $("modal");

    const content = $("modalContent");

    if (!modal || !content) {
        toast("Modal tidak ditemukan.", true);

        return;
    }

    const upc = String(item?.upc ?? item?.UPC ?? "").trim();

    const sku = String(item?.sku ?? item?.SKU ?? "-").trim();

    const name = String(item?.name ?? item?.NAMA_BARANG ?? "-").trim();

    content.innerHTML = `
        <div class="modal-head">

            <h3>
                Konfirmasi Barang
            </h3>

            <button
                class="close"
                data-action="close-modal"
                aria-label="Tutup"
                type="button">
                ×
            </button>

        </div>

        <div class="scan-confirm">

            <div class="scan-confirm-row">

                <span>
                    UPC
                </span>

                <strong>
                    ${esc(upc)}
                </strong>

            </div>

            <div class="scan-confirm-row">

                <span>
                    SKU
                </span>

                <strong>
                    ${esc(sku)}
                </strong>

            </div>

            <div class="scan-confirm-row">

                <span>
                    Nama Barang
                </span>

                <strong>
                    ${esc(name)}
                </strong>

            </div>

            <div class="scan-confirm-qty">

                <label for="packingQtyInput">
                    QTY
                </label>

                <input
                    id="packingQtyInput"
                    class="input"
                    type="number"
                    min="1"
                    step="1"
                    inputmode="numeric"
                    autocomplete="off"
                    placeholder="Masukkan jumlah"
                    value="1">

            </div>

            <div class="scan-confirm-actions">

                <button
                    type="button"
                    class="btn btn-secondary"
                    data-action="close-modal">
                    Batal
                </button>

                <button
                    type="button"
                    class="btn btn-primary"
                    id="savePackingScanBtn">
                    Simpan
                </button>

            </div>

        </div>
    `;

    modal.classList.remove("hidden");

    const qtyInput = $("packingQtyInput");

    const saveButton = $("savePackingScanBtn");

    qtyInput?.focus();
    qtyInput?.select();

    qtyInput?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();

        saveButton?.click();
    });

    saveButton?.addEventListener("click", async () => {
        const qty = Number(qtyInput?.value);

        if (!Number.isInteger(qty) || qty <= 0) {
            toast("QTY harus berupa angka bulat lebih dari 0.", true);

            qtyInput?.focus();
            qtyInput?.select();

            return;
        }

        await savePackingScan(activeShipmentId, upc, qty, item);
    });
}

async function savePackingScan(shipmentId, upc, qty, item) {
    try {
        busy(true);

        if (!shipmentId) {
            throw new Error("Shipment belum dipilih.");
        }

        const response = await api("packingScan", {
            shipmentId,
            upc,
            qty,
        });

        if (!response?.success) {
            throw new Error(response?.message || "Gagal menyimpan Packing.");
        }

        closePackingModal();

        await refreshActiveShipment();

        const responseItem = response.item || response.data?.item || item;

        const resultRow = {
            shipmentId: shipmentId,

            upc: responseItem?.upc || responseItem?.UPC || upc,

            sku: responseItem?.sku || responseItem?.SKU || item?.sku || item?.SKU || "-",

            name: responseItem?.name || responseItem?.NAMA_BARANG || item?.name || item?.NAMA_BARANG || "-",

            qty: Number(qty) || 1,

            operator: response.operator || response.petugas || responseItem?.operator || state.me?.name || "-",

            timestamp: response.timestamp || response.lastUpdate || responseItem?.timestamp || responseItem?.lastUpdate || new Date(),
        };

        /*
         * Tambahkan scan baru langsung ke riwayat.
         *
         * Jangan grouping UPC.
         * Setiap kali scan = satu baris.
         */
        todayHistoryRows = [resultRow, ...(Array.isArray(todayHistoryRows) ? todayHistoryRows : [])];

        /*
         * Tampilkan riwayat terbaru.
         */
        renderHistory();

        /*
         * Tampilkan hasil scan terakhir.
         */
        renderLastResult(resultRow);

        toast(`✓ ${resultRow.name} · Qty ${resultRow.qty}`);
    } catch (error) {
        console.error("Save packing error:", error);

        toast(error?.message || "Gagal menyimpan Packing.", true);
    } finally {
        busy(false);

        focusPackingInput();
    }
}

async function refreshActiveShipment() {
    if (!activeShipmentId) {
        packingRows = [];

        renderPackingPage();

        return;
    }

    const response = await api("getShipment", {
        shipmentId: activeShipmentId,
    });

    if (!response?.success) {
        throw new Error(response?.message || "Gagal mengambil Shipment.");
    }

    const shipment = response.shipment || response.data?.shipment || null;

    if (!shipment) {
        throw new Error("Data Shipment tidak valid.");
    }

    activeShipment = shipment;

    packingRows = getPackingRows(response);

    saveActiveShipment();

    renderPackingPage();
}

async function finishPacking() {
    if (!activeShipmentId) {
        toast("Pilih Shipment terlebih dahulu.", true);

        return;
    }

    if (getStatus(activeShipment) !== "PACKING") {
        toast("Shipment ini tidak sedang dalam proses Packing.", true);

        return;
    }

    if (!packingRows.length) {
        toast("Belum ada barang yang dipacking.", true);

        return;
    }

    const result = await Swal.fire({
        title: "Selesaikan Packing?",

        text: "Setelah selesai, shipment siap untuk proses Loading.",

        icon: "question",

        showCancelButton: true,

        confirmButtonText: "Ya, Selesaikan",

        cancelButtonText: "Batal",
    });

    if (!result.isConfirmed) {
        focusPackingInput();

        return;
    }

    try {
        busy(true);

        const response = await api("finishPacking", {
            shipmentId: activeShipmentId,
        });

        if (!response?.success) {
            throw new Error(response?.message || "Gagal menyelesaikan Packing.");
        }

        activeShipment = response.shipment ||
            response.data?.shipment || {
                ...activeShipment,
                status: "READY LOADING",
            };

        await stopPackingCamera();

        await refreshActiveShipment();

        await loadShipments();

        await loadTodayHistory();

        renderPackingPage();

        toast("✓ Packing selesai. Shipment siap Loading.");
    } catch (error) {
        console.error("Finish packing error:", error);

        toast(error?.message || "Gagal menyelesaikan Packing.", true);
    } finally {
        busy(false);

        focusPackingInput();
    }
}

function getQuagga() {
    return window.Quagga || window.quagga || null;
}

async function requestCameraPermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Browser tidak mendukung akses kamera.");
    }

    if (!window.isSecureContext) {
        throw new Error("Kamera hanya dapat digunakan melalui HTTPS.");
    }

    if (cameraPermissionStream) {
        return true;
    }

    cameraPermissionStream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: {
                ideal: "environment",
            },
        },
        audio: false,
    });

    return true;
}

async function releaseCameraPermissionStream() {
    if (!cameraPermissionStream) {
        return;
    }

    try {
        cameraPermissionStream.getTracks().forEach((track) => {
            track.stop();
        });
    } catch (error) {}

    cameraPermissionStream = null;
}

function cameraPermissionMessage(error) {
    if (error?.name === "NotAllowedError") {
        return "Akses kamera ditolak. Izinkan kamera untuk website ini melalui ikon kamera di address bar browser, lalu coba lagi.";
    }

    if (error?.name === "NotFoundError") {
        return "Kamera tidak ditemukan pada perangkat.";
    }

    if (error?.name === "NotReadableError") {
        return "Kamera sedang digunakan aplikasi lain. Tutup aplikasi yang menggunakan kamera lalu coba lagi.";
    }

    if (error?.name === "SecurityError") {
        return "Browser tidak mengizinkan akses kamera pada halaman ini.";
    }

    return error?.message || "Kamera tidak dapat digunakan.";
}

function cameraMarkup() {
    return `
        <div class="modal-head">

            <h3>
                Scan dengan Kamera
            </h3>

            <button
                class="close"
                data-action="close-modal"
                aria-label="Tutup"
                type="button">
                ×
            </button>

        </div>

        <div class="camera-box">

            <div
                id="quaggaReader"
                class="quagga-reader">
            </div>

            <div class="barcode-overlay"></div>

            <div
                class="barcode-frame"
                aria-hidden="true">

                <span
                    class="barcode-corner tl">
                </span>

                <span
                    class="barcode-corner tr">
                </span>

                <span
                    class="barcode-corner bl">
                </span>

                <span
                    class="barcode-corner br">
                </span>

                <span
                    class="barcode-laser">
                </span>

            </div>

        </div>

        <div
            class="camera-status"
            id="cameraStatus">
            Meminta akses kamera...
        </div>

        <div class="camera-help">
            Posisikan barcode mendatar di dalam
            kotak hijau.
        </div>
    `;
}

function fixCameraDisplay() {
    const box = document.querySelector(".camera-box");

    if (!box) {
        return;
    }

    const video = box.querySelector("video");

    const canvas = box.querySelector("canvas");

    if (video) {
        video.style.width = "100%";

        video.style.height = "100%";

        video.style.objectFit = "cover";

        video.style.objectPosition = "center center";

        video.setAttribute("playsinline", "true");

        video.setAttribute("autoplay", "true");

        video.muted = true;
    }

    if (canvas) {
        canvas.style.position = "absolute";

        canvas.style.inset = "0";

        canvas.style.width = "100%";

        canvas.style.height = "100%";

        canvas.style.pointerEvents = "none";
    }
}

async function openPackingCamera() {
    if (!activeShipmentId) {
        toast("Pilih Shipment terlebih dahulu.", true);

        return;
    }

    if (getStatus(activeShipment) !== "PACKING") {
        toast("Shipment ini tidak sedang dalam proses Packing.", true);

        return;
    }

    const Quagga = getQuagga();

    if (!Quagga) {
        toast("Scanner kamera belum termuat.", true);

        return;
    }

    await stopPackingCamera();

    const modal = $("modal");

    const content = $("modalContent");

    if (!modal || !content) {
        toast("Modal tidak ditemukan.", true);

        return;
    }

    content.innerHTML = cameraMarkup();

    modal.classList.remove("hidden");

    const status = $("cameraStatus");

    try {
        await requestCameraPermission();

        if (status) {
            status.textContent = "Menyalakan kamera...";
        }

        const constraints = {
            width: {
                min: 640,
                ideal: 1280,
            },

            height: {
                min: 480,
                ideal: 720,
            },

            facingMode: {
                ideal: "environment",
            },
        };

        const config = {
            inputStream: {
                name: "Packing Camera",

                type: "LiveStream",

                target: document.querySelector("#quaggaReader"),

                constraints,

                area: {
                    top: "5%",

                    right: "5%",

                    left: "5%",

                    bottom: "5%",
                },
            },

            locate: true,

            locator: {
                patchSize: "medium",

                halfSample: false,
            },

            frequency: 10,

            decoder: {
                readers: ["upc_reader", "upc_e_reader", "ean_reader", "ean_8_reader"],

                multiple: false,
            },

            numOfWorkers: Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2)),
        };

        packingCameraRunning = true;

        state.cameraRunning = true;

        packingCameraHandler = async (result) => {
            if (!packingCameraRunning) {
                return;
            }

            const code = String(result?.codeResult?.code || "").trim();

            if (!/^\d{6,13}$/.test(code)) {
                return;
            }

            const now = Date.now();

            if (code === lastDetected && now - lastDetectedAt < 1800) {
                return;
            }

            lastDetected = code;

            lastDetectedAt = now;

            packingCameraRunning = false;

            state.cameraRunning = false;

            if (status) {
                status.textContent = `Barcode terdeteksi: ${code}`;
            }

            await stopPackingCamera();

            closePackingModal();

            await processScan(code);
        };

        Quagga.onDetected(packingCameraHandler);

        await new Promise((resolve, reject) => {
            Quagga.init(config, (error) => {
                if (error) {
                    reject(error);

                    return;
                }

                resolve();
            });
        });

        Quagga.start();

        setTimeout(fixCameraDisplay, 200);

        setTimeout(fixCameraDisplay, 700);

        if (status) {
            status.textContent = "Kamera aktif · arahkan barcode ke kotak hijau";
        }
    } catch (error) {
        console.error("Packing camera error:", error);

        packingCameraRunning = false;

        state.cameraRunning = false;

        await stopPackingCamera();

        closePackingModal();

        await releaseCameraPermissionStream();

        toast(cameraPermissionMessage(error), true);
    }
}

async function stopPackingCamera() {
    const Quagga = getQuagga();

    packingCameraRunning = false;

    state.cameraRunning = false;

    if (Quagga) {
        try {
            if (packingCameraHandler) {
                Quagga.offDetected(packingCameraHandler);
            }
        } catch (error) {}

        try {
            Quagga.stop();
        } catch (error) {}
    }

    document.querySelectorAll(".camera-box video").forEach((video) => {
        try {
            if (video.srcObject) {
                video.srcObject.getTracks().forEach((track) => {
                    track.stop();
                });
            }
        } catch (error) {}
    });

    packingCameraHandler = null;

    await releaseCameraPermissionStream();
}

function closePackingModal() {
    stopPackingCamera();

    const modal = $("modal");

    const content = $("modalContent");

    if (modal) {
        modal.classList.add("hidden");
    }

    if (content) {
        content.innerHTML = "";
    }

    setTimeout(focusPackingInput, 120);
}

function focusPackingInput() {
    const input = $("packingScanInput");

    if (!input) {
        return;
    }

    const modal = $("modal");

    if (modal && !modal.classList.contains("hidden")) {
        return;
    }

    if (input.disabled) {
        return;
    }

    setTimeout(() => {
        const currentModal = $("modal");

        if (currentModal && !currentModal.classList.contains("hidden")) {
            return;
        }

        if (input.disabled) {
            return;
        }

        input.focus();
        input.select();
    }, 50);
}

export function bindPacking() {
    preparePackingLayout();
}

export { processScan, finishPacking };
