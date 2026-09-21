import { state, $, busy, toast } from "./state.js";
import { api } from "./api.js";

let loadingReady = false;

let shipments = [];
let activeShipmentId = "";
let activeShipment = null;

let loadingRows = [];
let todayHistoryRows = [];

let lastDetected = "";
let lastDetectedAt = 0;

let loadingCameraRunning = false;
let loadingCameraHandler = null;
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

function getStorageKey() {
    return `upc_loading_active_shipment_${getTodayKey()}`;
}

function saveActiveShipment() {
    if (activeShipmentId) {
        localStorage.setItem(getStorageKey(), activeShipmentId);
    }
}

function clearActiveShipment() {
    localStorage.removeItem(getStorageKey());
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

function getLoadingRows(response) {
    const rows = response?.loading ?? response?.data?.loading ?? [];

    return Array.isArray(rows) ? rows : [];
}

function normalizeLoadingRow(row) {
    return {
        shipmentId: String(row?.shipmentId ?? row?.SHIPMENT_ID ?? "").trim(),

        upc: String(row?.upc ?? row?.UPC ?? "").trim(),

        sku: String(row?.sku ?? row?.SKU ?? "-").trim(),

        name: String(row?.name ?? row?.NAMA_BARANG ?? "-").trim(),

        qty: Number(row?.qty ?? row?.QTY ?? 0),

        operator: String(row?.operator ?? row?.petugas ?? row?.PETUGAS ?? "-").trim(),

        timestamp: String(row?.timestamp ?? row?.TIMESTAMP ?? row?.lastScan ?? "").trim(),

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

function renderActiveShipmentButton() {
    const button = $("loadingChooseShipmentBtn");

    if (!button) {
        return;
    }

    button.textContent = activeShipmentId ? `DPV ${activeShipmentId}` : "Pilih DPV";
}

function prepareLoadingLayout() {
    const page = $("page-loading");

    if (!page || loadingReady) {
        return;
    }

    page.innerHTML = `
        <div class="page-head page-head-with-action">

            <div>

                <h2>
                    Loading
                </h2>

                <p>
                    Scan barang yang akan dimuat.
                </p>

            </div>

            <button
                id="loadingChooseShipmentBtn"
                class="btn btn-soft page-head-action"
                type="button">

                Pilih DPV

            </button>

        </div>

        <div class="packing-top-grid">

            <section class="panel packing-scanner-card">

                <div class="packing-scanner-head">

                    <div class="section-title">
                        Scanner
                    </div>

                    <div class="scanner-status">

                        <span class="dot"></span>

                        Scanner Ready

                    </div>

                </div>

                <div class="scan-actions">

                    <button
                        id="loadingCameraBtn"
                        class="btn btn-primary"
                        type="button">

                        Kamera

                    </button>

                    <button
                        id="loadingManualFocusBtn"
                        class="btn btn-soft"
                        type="button">

                        Scanner

                    </button>

                </div>

                <input
                    id="loadingScanInput"
                    class="scan-input input"
                    inputmode="numeric"
                    autocomplete="off"
                    placeholder="Pilih DPV terlebih dahulu..."
                    aria-label="UPC Loading">

                <div class="hint">

                    Scanner USB/Bluetooth dapat digunakan melalui
                    input ini. Barcode + Enter akan langsung diproses.

                </div>

                <div
                    id="loadingLastResult"
                    class="last">

                    <div class="last-title">
                        HASIL SCAN TERAKHIR
                    </div>

                    <div class="last-name">
                        Belum ada scan
                    </div>

                    <div class="last-meta">
                        Pilih DPV lalu mulai scan.
                    </div>

                </div>

            </section>

            <section class="panel packing-history-card">

                <div class="section-title">
                    Riwayat Scan
                </div>

                <div
                    id="loadingHistoryRows"
                    class="table-wrap">
                </div>

            </section>

        </div>

        <section class="panel packing-result-card">

            <div class="packing-result-head">

                <div>

                    <div
                        id="loadingResultTitle"
                        class="section-title">

                        Hasil scan loading

                    </div>

                    <div
                        id="loadingResultSubtitle"
                        class="packing-result-subtitle">

                        Pilih DPV untuk melihat hasil scan.

                    </div>

                </div>

                <button
                    id="finishLoadingBtn"
                    class="btn btn-primary"
                    type="button"
                    disabled>

                    Selesaikan Loading

                </button>

            </div>

            <div
                id="loadingResultRows"
                class="table-wrap">
            </div>

        </section>
    `;

    loadingReady = true;

    $("loadingChooseShipmentBtn")?.addEventListener("click", showShipmentSelectModal);

    $("loadingCameraBtn")?.addEventListener("click", openLoadingCamera);

    $("loadingManualFocusBtn")?.addEventListener("click", focusLoadingInput);

    const scanInput = $("loadingScanInput");

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
                closeLoadingModal();
            }
        });
    }

    window.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }

        const currentModal = $("modal");

        if (currentModal && !currentModal.classList.contains("hidden")) {
            closeLoadingModal();
        }
    });

    window.addEventListener("loading:stop", () => {
        stopLoadingCamera();
    });
}

function showShipmentSelectModal() {
    const modal = $("modal");

    const content = $("modalContent");

    if (!modal || !content) {
        toast("Modal tidak ditemukan.", true);

        return;
    }

    stopLoadingCamera();

    const availableShipments = (Array.isArray(shipments) ? shipments : [])
        .filter((shipment) => getStatus(shipment) === "READY LOADING" || getStatus(shipment) === "LOADING")
        .map((shipment) => getShipmentId(shipment))
        .filter(Boolean);

    if (!availableShipments.length) {
        toast("Tidak ada DPV yang tersedia untuk Loading.", true);

        return;
    }

    content.innerHTML = `
        <div class="modal-head">

            <h3>
                Pilih DPV
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
                    for="loadingShipmentModalSelect">

                    DPV

                </label>

                <select
                    id="loadingShipmentModalSelect"
                    class="input">

                    <option value="">
                        Pilih DPV
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

    const select = $("loadingShipmentModalSelect");

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
    const box = $("loadingLastResult");

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
                Pilih DPV lalu mulai scan.
            </div>
        `;

        return;
    }

    const item = normalizeLoadingRow(row);

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
    const box = $("loadingLastResult");

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
    const container = $("loadingHistoryRows");

    if (!container) {
        return;
    }

    const rows = todayHistoryRows.map(normalizeLoadingRow).filter((row) => row.upc && row.shipmentId);

    rows.sort((a, b) => (parseTimestamp(b.timestamp)?.getTime() || 0) - (parseTimestamp(a.timestamp)?.getTime() || 0));

    container.innerHTML = `
        <table class="table">

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
                        Nama Petugas
                    </th>

                    <th>
                        Timestamp
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

function renderLoadingResult() {
    const title = $("loadingResultTitle");

    const subtitle = $("loadingResultSubtitle");

    const container = $("loadingResultRows");

    if (!container) {
        return;
    }

    if (!activeShipmentId) {
        if (title) {
            title.textContent = "Hasil scan loading";
        }

        if (subtitle) {
            subtitle.textContent = "Pilih DPV untuk melihat hasil scan.";
        }

        container.innerHTML = `
            <table class="table packing-result-table">

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

                            Pilih DPV untuk melihat hasil scan.

                        </td>

                    </tr>

                </tbody>

            </table>
        `;

        return;
    }

    if (title) {
        title.textContent = `Hasil scan loading DPV ${activeShipmentId}`;
    }

    if (subtitle) {
        subtitle.textContent = "Hasil scan barang untuk DPV ini.";
    }

    const sourceRows = loadingRows.map(normalizeLoadingRow).filter((row) => row.upc);

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

        const currentTime = parseTimestamp(existing.lastUpdate)?.getTime() || 0;

        const newTime = parseTimestamp(row.lastUpdate)?.getTime() || 0;

        if (newTime >= currentTime) {
            existing.sku = row.sku || existing.sku;

            existing.name = row.name || existing.name;

            existing.operator = row.operator || existing.operator;

            existing.lastUpdate = row.lastUpdate || existing.lastUpdate;
        }
    });

    const rows = Array.from(grouped.values());

    rows.sort((a, b) => (parseTimestamp(b.lastUpdate)?.getTime() || 0) - (parseTimestamp(a.lastUpdate)?.getTime() || 0));

    container.innerHTML = `
        <table class="table packing-result-table">

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
                                    DPV ${esc(activeShipmentId)}.

                                </td>

                            </tr>
                        `
                }

            </tbody>

        </table>
    `;
}

function renderLoadingPage() {
    renderActiveShipmentButton();
    renderHistory();
    renderLoadingResult();

    const input = $("loadingScanInput");

    const cameraBtn = $("loadingCameraBtn");

    const manualBtn = $("loadingManualFocusBtn");

    const finishBtn = $("finishLoadingBtn");

    const status = getStatus(activeShipment);

    const canScan = !!activeShipmentId && (status === "READY LOADING" || status === "LOADING");

    if (cameraBtn) {
        cameraBtn.disabled = !canScan;
    }

    if (manualBtn) {
        manualBtn.disabled = !canScan;
    }

    if (input) {
        input.disabled = !canScan;

        input.placeholder = canScan ? "Scan UPC di sini..." : "Pilih DPV terlebih dahulu...";
    }

    if (finishBtn) {
        finishBtn.disabled = !canScan || !loadingRows.length;

        finishBtn.onclick = finishLoading;
    }
}

async function loadShipments() {
    try {
        const response = await api("getShipments");

        if (!response?.success) {
            throw new Error(response?.message || "Gagal mengambil data DPV.");
        }

        shipments = getShipmentRows(response);

        if (!Array.isArray(shipments)) {
            shipments = [];
        }
    } catch (error) {
        console.error("Load Loading Shipment:", error);

        shipments = [];

        throw error;
    }
}

async function loadTodayHistory() {
    try {
        const response = await api("getTodayRowsForUser");

        if (!response?.success) {
            console.warn("Gagal mengambil riwayat scan:", response?.message);

            renderHistory();

            return;
        }

        const rows = response.rows || response.data?.rows || [];

        if (!Array.isArray(rows)) {
            renderHistory();

            return;
        }

        todayHistoryRows = rows.map((row) => ({
            shipmentId: String(row.shipmentId || row.SHIPMENT_ID || ""),

            upc: String(row.upc || row.UPC || ""),

            sku: String(row.sku || row.SKU || "-"),

            name: String(row.name || row.NAMA_BARANG || "-"),

            qty: Number(row.qty || row.QTY || 0),

            operator: String(row.operator || row.operators || row.petugas || row.PETUGAS || "-"),

            timestamp: row.timestamp || row.TIMESTAMP || row.lastScan || "",
        }));

        renderHistory();
    } catch (error) {
        console.error("Load Loading History:", error);

        renderHistory();
    }
}

async function restoreActiveShipment() {
    const saved = localStorage.getItem(getStorageKey());

    if (!saved) {
        activeShipmentId = "";
        activeShipment = null;
        loadingRows = [];

        return;
    }

    const found = shipments.find((shipment) => getShipmentId(shipment) === saved);

    if (!found) {
        clearActiveShipment();

        activeShipmentId = "";
        activeShipment = null;
        loadingRows = [];

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
            loadingRows = [];

            return;
        }

        const shipment = response.shipment || response.data?.shipment || null;

        if (!shipment || (getStatus(shipment) !== "READY LOADING" && getStatus(shipment) !== "LOADING")) {
            clearActiveShipment();

            activeShipmentId = "";
            activeShipment = null;
            loadingRows = [];

            return;
        }

        activeShipmentId = saved;

        activeShipment = shipment;

        loadingRows = getLoadingRows(response);

        saveActiveShipment();
    } catch (error) {
        console.error("Restore Loading Shipment:", error);

        activeShipmentId = "";
        activeShipment = null;
        loadingRows = [];

        clearActiveShipment();
    }
}

export async function loadLoading() {
    prepareLoadingLayout();

    try {
        busy(true);

        await loadShipments();

        await restoreActiveShipment();

        await loadTodayHistory();

        renderLoadingPage();

        if (!activeShipmentId) {
            setTimeout(() => {
                showShipmentSelectModal();
            }, 100);
        }
    } catch (error) {
        console.error("Load Loading:", error);

        toast(error?.message || "Gagal memuat Loading.", true);

        renderLoadingPage();
    } finally {
        busy(false);
    }
}

async function selectShipment(shipmentId) {
    shipmentId = String(shipmentId || "").trim();

    stopLoadingCamera();

    if (!shipmentId) {
        activeShipmentId = "";
        activeShipment = null;
        loadingRows = [];

        clearActiveShipment();

        renderLoadingPage();

        return;
    }

    try {
        busy(true);

        const response = await api("getShipment", {
            shipmentId,
        });

        if (!response?.success) {
            throw new Error(response?.message || "DPV tidak ditemukan.");
        }

        const shipment = response.shipment || response.data?.shipment || null;

        if (!shipment) {
            throw new Error("Data DPV tidak valid.");
        }

        const status = getStatus(shipment);

        if (status !== "READY LOADING" && status !== "LOADING") {
            throw new Error("DPV ini belum siap untuk proses Loading.");
        }

        activeShipmentId = shipmentId;

        activeShipment = shipment;

        loadingRows = getLoadingRows(response);

        saveActiveShipment();

        renderLoadingPage();

        closeLoadingModal();

        toast(`DPV ${shipmentId} dipilih.`);
    } catch (error) {
        console.error("Select Loading DPV error:", error);

        toast(error?.message || "Gagal memilih DPV.", true);
    } finally {
        busy(false);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                focusLoadingInput();
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
        toast("Pilih DPV terlebih dahulu.", true);

        focusLoadingInput();

        return;
    }

    const status = getStatus(activeShipment);

    if (status !== "READY LOADING" && status !== "LOADING") {
        toast("DPV ini belum siap untuk proses Loading.", true);

        return;
    }

    if (!/^\d+$/.test(value)) {
        toast("UPC harus berupa angka.", true);

        focusLoadingInput();

        return;
    }

    const input = $("loadingScanInput");

    if (input) {
        input.value = "";
    }

    try {
        busy(true);

        const item = await lookupUPC(value);

        if (!item) {
            throw new Error("UPC tidak ditemukan.");
        }

        showLoadingConfirmModal(item);
    } catch (error) {
        console.error("Loading lookup error:", error);

        renderLastError(error?.message || "UPC tidak ditemukan.");

        toast(error?.message || "UPC tidak ditemukan.", true);
    } finally {
        busy(false);
    }
}

function showLoadingConfirmModal(item) {
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

                <label for="loadingQtyInput">
                    QTY
                </label>

                <input
                    id="loadingQtyInput"
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
                    id="saveLoadingScanBtn">

                    Simpan

                </button>

            </div>

        </div>
    `;

    modal.classList.remove("hidden");

    const qtyInput = $("loadingQtyInput");

    const saveButton = $("saveLoadingScanBtn");

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

        await saveLoadingScan(activeShipmentId, upc, qty, item);
    });
}

async function saveLoadingScan(shipmentId, upc, qty, item) {
    try {
        busy(true);

        if (!shipmentId) {
            throw new Error("DPV belum dipilih.");
        }

        const response = await api("loadingScan", {
            shipmentId,
            upc,
            qty,
        });

        if (!response?.success) {
            throw new Error(response?.message || "Gagal menyimpan Loading.");
        }

        closeLoadingModal();

        await refreshActiveShipment();

        const responseItem = response.item || response.data?.item || item;

        const resultRow = {
            shipmentId,

            upc: responseItem?.upc || responseItem?.UPC || upc,

            sku: responseItem?.sku || responseItem?.SKU || item?.sku || item?.SKU || "-",

            name: responseItem?.name || responseItem?.NAMA_BARANG || item?.name || item?.NAMA_BARANG || "-",

            qty: Number(qty) || 1,

            operator: response.operator || response.petugas || responseItem?.operator || state.me?.name || "-",

            timestamp: response.timestamp || response.lastUpdate || responseItem?.timestamp || responseItem?.lastUpdate || new Date(),
        };

        todayHistoryRows = [resultRow, ...(Array.isArray(todayHistoryRows) ? todayHistoryRows : [])];

        renderHistory();

        renderLastResult(resultRow);

        toast(`✓ ${resultRow.name} · Qty ${resultRow.qty}`);
    } catch (error) {
        console.error("Save loading error:", error);

        toast(error?.message || "Gagal menyimpan Loading.", true);
    } finally {
        busy(false);

        focusLoadingInput();
    }
}

async function refreshActiveShipment() {
    if (!activeShipmentId) {
        loadingRows = [];

        renderLoadingPage();

        return;
    }

    const response = await api("getShipment", {
        shipmentId: activeShipmentId,
    });

    if (!response?.success) {
        throw new Error(response?.message || "Gagal mengambil DPV.");
    }

    const shipment = response.shipment || response.data?.shipment || null;

    if (!shipment) {
        throw new Error("Data DPV tidak valid.");
    }

    activeShipment = shipment;

    loadingRows = getLoadingRows(response);

    saveActiveShipment();

    renderLoadingPage();
}

async function finishLoading() {
    if (!activeShipmentId) {
        toast("Pilih DPV terlebih dahulu.", true);

        return;
    }

    const status = getStatus(activeShipment);

    if (status !== "READY LOADING" && status !== "LOADING") {
        toast("DPV ini belum siap untuk proses Loading.", true);

        return;
    }

    if (!loadingRows.length) {
        toast("Belum ada barang yang dimuat.", true);

        return;
    }

    const result = await Swal.fire({
        title: "Selesaikan Loading?",

        text: "Setelah selesai, data Loading akan dikirim ke proses Matching.",

        icon: "question",

        showCancelButton: true,

        confirmButtonText: "Ya, Selesaikan",

        cancelButtonText: "Batal",
    });

    if (!result.isConfirmed) {
        focusLoadingInput();

        return;
    }

    try {
        busy(true);

        const response = await api("finishLoading", {
            shipmentId: activeShipmentId,
        });

        if (!response?.success) {
            throw new Error(response?.message || "Gagal menyelesaikan Loading.");
        }

        await stopLoadingCamera();

        activeShipment = response.shipment || response.data?.shipment || activeShipment;

        await refreshActiveShipment();

        await loadShipments();

        await loadTodayHistory();

        renderLoadingPage();

        toast("✓ Loading selesai. DPV siap Matching.");
    } catch (error) {
        console.error("Finish loading error:", error);

        toast(error?.message || "Gagal menyelesaikan Loading.", true);
    } finally {
        busy(false);

        focusLoadingInput();
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
                id="loadingQuaggaReader"
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
            id="loadingCameraStatus">

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

async function openLoadingCamera() {
    if (!activeShipmentId) {
        toast("Pilih DPV terlebih dahulu.", true);

        return;
    }

    const status = getStatus(activeShipment);

    if (status !== "READY LOADING" && status !== "LOADING") {
        toast("DPV ini belum siap untuk proses Loading.", true);

        return;
    }

    const Quagga = getQuagga();

    if (!Quagga) {
        toast("Scanner kamera belum termuat.", true);

        return;
    }

    await stopLoadingCamera();

    const modal = $("modal");

    const content = $("modalContent");

    if (!modal || !content) {
        toast("Modal tidak ditemukan.", true);

        return;
    }

    content.innerHTML = cameraMarkup();

    modal.classList.remove("hidden");

    const cameraStatus = $("loadingCameraStatus");

    try {
        await requestCameraPermission();

        if (cameraStatus) {
            cameraStatus.textContent = "Menyalakan kamera...";
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
                name: "Loading Camera",

                type: "LiveStream",

                target: document.querySelector("#loadingQuaggaReader"),

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

        loadingCameraRunning = true;

        state.cameraRunning = true;

        loadingCameraHandler = async (result) => {
            if (!loadingCameraRunning) {
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

            loadingCameraRunning = false;

            state.cameraRunning = false;

            if (cameraStatus) {
                cameraStatus.textContent = `Barcode terdeteksi: ${code}`;
            }

            await stopLoadingCamera();

            closeLoadingModal();

            await processScan(code);
        };

        Quagga.onDetected(loadingCameraHandler);

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

        if (cameraStatus) {
            cameraStatus.textContent = "Kamera aktif · arahkan barcode ke kotak hijau";
        }
    } catch (error) {
        console.error("Loading camera error:", error);

        loadingCameraRunning = false;

        state.cameraRunning = false;

        await stopLoadingCamera();

        closeLoadingModal();

        await releaseCameraPermissionStream();

        toast(cameraPermissionMessage(error), true);
    }
}

async function stopLoadingCamera() {
    const Quagga = getQuagga();

    loadingCameraRunning = false;

    state.cameraRunning = false;

    if (Quagga) {
        try {
            if (loadingCameraHandler) {
                Quagga.offDetected(loadingCameraHandler);
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

    loadingCameraHandler = null;

    await releaseCameraPermissionStream();
}

function closeLoadingModal() {
    stopLoadingCamera();

    const modal = $("modal");

    const content = $("modalContent");

    if (modal) {
        modal.classList.add("hidden");
    }

    if (content) {
        content.innerHTML = "";
    }

    setTimeout(focusLoadingInput, 120);
}

function focusLoadingInput() {
    const input = $("loadingScanInput");

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

export function bindLoading() {
    prepareLoadingLayout();
}

export { processScan, finishLoading };
