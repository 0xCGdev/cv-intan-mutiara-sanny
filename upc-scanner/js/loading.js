import { state, $, busy, toast, esc } from "./state.js";
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

    button.textContent = activeShipmentId || "Pilih DPV";
}

function prepareLoadingLayout() {
    const page = $("page-loading");

    if (!page || loadingReady) {
        return;
    }

    page.innerHTML = `
        <div class="page-head page-head-with-action">
            <div>
                <h2>Loading</h2>

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
                    Scanner USB/Bluetooth dapat digunakan
                    melalui input ini. Barcode + Enter akan
                    langsung diproses.
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

    $("finishLoadingBtn")?.addEventListener("click", finishLoading);
}

function normalizeUPC(value) {
    let upc = String(value || "")
        .replace(/\D/g, "")
        .trim();

    if (!upc) {
        return "";
    }

    if (upc.length === 11) {
        upc = `0${upc}`;
    }

    return upc;
}

function getShipmentItems(shipment) {
    const items = shipment?.ITEMS ?? shipment?.items ?? [];

    return Array.isArray(items) ? items : [];
}

function getItemUPC(item) {
    return normalizeUPC(item?.upc ?? item?.UPC ?? "");
}

function getItemSKU(item) {
    return String(item?.sku ?? item?.SKU ?? "-").trim();
}

function getItemName(item) {
    return String(item?.name ?? item?.NAMA_BARANG ?? "-").trim();
}

function getItemTarget(item) {
    return Number(item?.qty ?? item?.QTY ?? item?.target ?? item?.TARGET ?? 0);
}

function findShipmentItemByUPC(upc) {
    const value = normalizeUPC(upc);

    if (!value) {
        return null;
    }

    const items = getShipmentItems(activeShipment);

    return items.find((item) => getItemUPC(item) === value) || null;
}

async function lookupUPC(upc) {
    const value = normalizeUPC(upc);

    if (!value) {
        throw new Error("UPC kosong.");
    }

    if (!activeShipmentId || !activeShipment) {
        throw new Error("Pilih DPV terlebih dahulu.");
    }

    const status = getStatus(activeShipment);

    if (status !== "READY LOADING" && status !== "LOADING") {
        throw new Error("DPV ini belum siap untuk proses Loading.");
    }

    const items = getShipmentItems(activeShipment);

    if (!items.length) {
        throw new Error(`DPV ${activeShipmentId} belum memiliki data barang.`);
    }

    const item = findShipmentItemByUPC(value);

    if (!item) {
        throw new Error(`UPC ${value} tidak terdaftar pada DPV ${activeShipmentId}.`);
    }

    return {
        upc: getItemUPC(item) || value,
        sku: getItemSKU(item),
        name: getItemName(item),
        target: getItemTarget(item),
    };
}

async function loadShipments() {
    const result = await api("getShipments");

    if (!result?.success) {
        throw new Error(result?.message || "Gagal mengambil data DPV.");
    }

    shipments = getShipmentRows(result)
        .map((row) => ({
            ...row,
            shipmentId: getShipmentId(row),
            status: getStatus(row),
        }))
        .filter((row) => row.shipmentId);

    return shipments;
}

async function loadActiveShipment() {
    if (!activeShipmentId) {
        activeShipment = null;
        return null;
    }

    const result = await api("getShipment", {
        shipmentId: activeShipmentId,
    });

    if (!result?.success) {
        throw new Error(result?.message || "Gagal mengambil data DPV.");
    }

    activeShipment = result?.shipment ?? result?.data?.shipment ?? result?.data ?? null;

    if (!activeShipment) {
        throw new Error("Data DPV tidak ditemukan.");
    }

    activeShipment.shipmentId = getShipmentId(activeShipment) || activeShipmentId;

    activeShipment.status = getStatus(activeShipment);

    return activeShipment;
}

function getSavedShipmentId() {
    return String(localStorage.getItem(getStorageKey()) || "").trim();
}

async function restoreActiveShipment() {
    const savedId = getSavedShipmentId();

    if (!savedId) {
        return false;
    }

    const row = shipments.find((item) => getShipmentId(item) === savedId);

    if (!row) {
        clearActiveShipment();
        return false;
    }

    const status = getStatus(row);

    if (status !== "READY LOADING" && status !== "LOADING") {
        clearActiveShipment();
        return false;
    }

    activeShipmentId = savedId;

    try {
        await loadActiveShipment();

        if (!activeShipment) {
            clearActiveShipment();
            activeShipmentId = "";
            return false;
        }

        renderActiveShipmentButton();
        await refreshLoadingData();

        return true;
    } catch {
        activeShipmentId = "";
        activeShipment = null;
        clearActiveShipment();

        renderActiveShipmentButton();

        return false;
    }
}

function getAvailableShipments() {
    return shipments.filter((row) => {
        const status = getStatus(row);

        return status === "READY LOADING" || status === "LOADING";
    });
}

function showShipmentSelectModal() {
    const modal = $("modal");

    if (!modal) {
        return;
    }

    const available = getAvailableShipments();

    modal.innerHTML = `
        <div class="modal-backdrop">
            <div
                class="modal-card"
                role="dialog"
                aria-modal="true">

                <div class="modal-head">

                    <div>
                        <h3>Pilih DPV</h3>

                        <p>
                            Pilih DPV yang akan diproses.
                        </p>
                    </div>

                    <button
                        type="button"
                        class="icon-btn"
                        data-action="close-modal"
                        aria-label="Tutup">
                        ×
                    </button>

                </div>

                <div class="modal-body">

                    ${
                        available.length
                            ? `
                                <label
                                    class="field-label"
                                    for="loadingShipmentSelect">
                                    DPV
                                </label>

                                <select
                                    id="loadingShipmentSelect"
                                    class="input">
                                    <option value="">
                                        Pilih DPV
                                    </option>

                                    ${available
                                        .map(
                                            (row) =>
                                                `<option value="${esc(getShipmentId(row))}">
                                                ${esc(getShipmentId(row))}
                                            </option>`,
                                        )
                                        .join("")}
                                </select>

                                <div class="modal-or">
                                    atau
                                </div>
                            `
                            : `
                                <div class="empty-state">
                                    <div class="empty-title">
                                        Tidak ada DPV
                                    </div>

                                    <div class="empty-text">
                                        Belum ada DPV yang
                                        siap untuk Loading.
                                    </div>
                                </div>
                            `
                    }

                    ${
                        available.length
                            ? `
                                <button
                                    id="loadingConfirmShipmentBtn"
                                    class="btn btn-primary"
                                    type="button">
                                    Gunakan DPV
                                </button>
                            `
                            : ""
                    }

                </div>

            </div>
        </div>
    `;

    modal.classList.remove("hidden");

    const select = $("loadingShipmentSelect");

    if (select && activeShipmentId) {
        select.value = activeShipmentId;
    }

    $("loadingConfirmShipmentBtn")?.addEventListener("click", async () => {
        const value = $("loadingShipmentSelect")?.value?.trim();

        if (!value) {
            toast("Pilih DPV terlebih dahulu.", "warning");
            return;
        }

        await selectShipment(value);
    });

    if (select) {
        select.focus();
    }
}

function closeLoadingModal() {
    const modal = $("modal");

    if (!modal) {
        return;
    }

    modal.classList.add("hidden");
    modal.innerHTML = "";
}

async function selectShipment(shipmentId) {
    const id = String(shipmentId || "").trim();

    if (!id) {
        return;
    }

    busy(true);

    try {
        const row = shipments.find((item) => getShipmentId(item) === id);

        if (!row) {
            throw new Error("DPV tidak ditemukan.");
        }

        const status = getStatus(row);

        if (status !== "READY LOADING" && status !== "LOADING") {
            throw new Error("DPV belum siap untuk proses Loading.");
        }

        activeShipmentId = id;

        await loadActiveShipment();

        if (!activeShipment) {
            throw new Error("Data DPV tidak ditemukan.");
        }

        saveActiveShipment();

        renderActiveShipmentButton();

        closeLoadingModal();

        await refreshLoadingData();

        toast(`DPV ${activeShipmentId} dipilih.`, "success");

        focusLoadingInput();
    } catch (error) {
        toast(error?.message || "Gagal memilih DPV.", "error");
    } finally {
        busy(false);
    }
}

async function refreshLoadingData() {
    if (!activeShipmentId) {
        loadingRows = [];
        todayHistoryRows = [];

        renderLoadingResult();
        renderLoadingHistory();
        updateLoadingState();

        return;
    }

    await loadActiveShipment();

    const result = await api("getLoadingHistory", {
        shipmentId: activeShipmentId,
    });

    if (!result?.success) {
        throw new Error(result?.message || "Gagal mengambil riwayat Loading.");
    }

    loadingRows = getLoadingRows(result).map(normalizeLoadingRow);

    todayHistoryRows = loadingRows.filter(isTodayLoadingRow);

    renderLoadingResult();
    renderLoadingHistory();
    updateLoadingState();
}

function isTodayLoadingRow(row) {
    const value = row?.timestamp ?? row?.lastUpdate ?? "";

    const date = parseTimestamp(value);

    if (!date) {
        return false;
    }

    const now = new Date();

    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function getLoadingTotals() {
    const items = getShipmentItems(activeShipment);

    let target = 0;
    let loaded = 0;

    for (const item of items) {
        target += getItemTarget(item);

        const upc = getItemUPC(item);

        if (!upc) {
            continue;
        }

        const rows = loadingRows.filter((row) => normalizeUPC(row.upc) === upc);

        loaded += rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    }

    return {
        target,
        loaded,
        remaining: Math.max(0, target - loaded),
    };
}

function getLoadedQty(upc) {
    const value = normalizeUPC(upc);

    if (!value) {
        return 0;
    }

    return loadingRows.filter((row) => normalizeUPC(row.upc) === value).reduce((sum, row) => sum + Number(row.qty || 0), 0);
}

function getLoadingStatus(item) {
    const target = getItemTarget(item);

    const loaded = getLoadedQty(getItemUPC(item));

    if (loaded >= target) {
        return "SELESAI";
    }

    if (loaded > 0) {
        return "SEBAGIAN";
    }

    return "BELUM";
}

function getStatusClass(status) {
    switch (String(status || "").toUpperCase()) {
        case "SELESAI":
            return "success";

        case "SEBAGIAN":
            return "warning";

        case "BELUM":
        default:
            return "muted";
    }
}

function renderLoadingResult() {
    const container = $("loadingResultRows");

    const title = $("loadingResultTitle");

    const subtitle = $("loadingResultSubtitle");

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
            <div class="empty-state">
                <div class="empty-title">
                    Belum ada DPV
                </div>

                <div class="empty-text">
                    Pilih DPV terlebih dahulu.
                </div>
            </div>
        `;

        return;
    }

    const items = getShipmentItems(activeShipment);

    if (title) {
        title.textContent = `Hasil Loading — ${activeShipmentId}`;
    }

    if (subtitle) {
        const totals = getLoadingTotals();

        subtitle.textContent = `${totals.loaded} / ${totals.target} Qty`;
    }

    if (!items.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-title">
                    Belum ada barang
                </div>

                <div class="empty-text">
                    DPV belum memiliki item.
                </div>
            </div>
        `;

        return;
    }

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>UPC</th>
                    <th>SKU</th>
                    <th>Nama Barang</th>
                    <th>Target</th>
                    <th>Loading</th>
                    <th>Selisih</th>
                    <th>Status</th>
                </tr>
            </thead>

            <tbody>
                ${items
                    .map((item) => {
                        const upc = getItemUPC(item);

                        const target = getItemTarget(item);

                        const loaded = getLoadedQty(upc);

                        const difference = loaded - target;

                        const status = getLoadingStatus(item);

                        return `
                            <tr>
                                <td>
                                    ${esc(upc || "-")}
                                </td>

                                <td>
                                    ${esc(getItemSKU(item))}
                                </td>

                                <td class="text-left">
                                    ${esc(getItemName(item))}
                                </td>

                                <td>
                                    ${target}
                                </td>

                                <td>
                                    ${loaded}
                                </td>

                                <td>
                                    ${difference}
                                </td>

                                <td>
                                    <span
                                        class="status-badge ${getStatusClass(status)}">
                                        ${esc(status)}
                                    </span>
                                </td>
                            </tr>
                        `;
                    })
                    .join("")}
            </tbody>
        </table>
    `;
}

function renderLoadingHistory() {
    const container = $("loadingHistoryRows");

    if (!container) {
        return;
    }

    if (!activeShipmentId) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-title">
                    Belum ada DPV
                </div>

                <div class="empty-text">
                    Pilih DPV terlebih dahulu.
                </div>
            </div>
        `;

        return;
    }

    if (!todayHistoryRows.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-title">
                    Belum ada scan
                </div>

                <div class="empty-text">
                    Belum ada riwayat scan Loading hari ini.
                </div>
            </div>
        `;

        return;
    }

    const rows = [...todayHistoryRows].sort((a, b) => {
        const dateA = parseTimestamp(a.timestamp)?.getTime() || 0;

        const dateB = parseTimestamp(b.timestamp)?.getTime() || 0;

        return dateB - dateA;
    });

    container.innerHTML = `
        <table class="data-table">
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
                ${rows
                    .map(
                        (row) => `
                            <tr>
                                <td>
                                    ${esc(row.upc || "-")}
                                </td>

                                <td>
                                    ${esc(row.sku || "-")}
                                </td>

                                <td class="text-left">
                                    ${esc(row.name || "-")}
                                </td>

                                <td>
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
                    .join("")}
            </tbody>
        </table>
    `;
}

function updateLoadingState() {
    const finishButton = $("finishLoadingBtn");

    const input = $("loadingScanInput");

    const cameraButton = $("loadingCameraBtn");

    const manualButton = $("loadingManualFocusBtn");

    const status = getStatus(activeShipment);

    const canScan = Boolean(activeShipmentId && activeShipment && (status === "READY LOADING" || status === "LOADING"));

    if (input) {
        input.disabled = !canScan;

        input.placeholder = canScan ? "Scan atau masukkan UPC..." : "Pilih DPV terlebih dahulu...";
    }

    if (cameraButton) {
        cameraButton.disabled = !canScan;
    }

    if (manualButton) {
        manualButton.disabled = !canScan;
    }

    if (finishButton) {
        const totals = getLoadingTotals();

        const complete = canScan && totals.target > 0 && totals.loaded >= totals.target;

        finishButton.disabled = !complete;

        finishButton.textContent = complete ? "Selesaikan Loading" : "Selesaikan Loading";
    }

    renderActiveShipmentButton();
}

function updateLastResult(item, qty, timestamp = new Date()) {
    const container = $("loadingLastResult");

    if (!container) {
        return;
    }

    const iso = timestamp instanceof Date ? timestamp.toISOString() : timestamp;

    const displayTime = formatTimestamp(iso);

    container.innerHTML = `
        <div class="last-title">
            HASIL SCAN TERAKHIR
        </div>

        <div class="last-name">
            ${esc(item?.name || "-")}
        </div>

        <div class="last-meta">
            <strong>SKU:</strong>
            ${esc(item?.sku || "-")}
            &nbsp;•&nbsp;

            <strong>UPC:</strong>
            ${esc(item?.upc || "-")}
            &nbsp;•&nbsp;

            <strong>Qty:</strong>
            ${Number(qty || 0)}
        </div>

        <div class="last-meta">
            ${esc(displayTime)}
        </div>
    `;
}

function normalizeOperator() {
    return String(state?.me?.name ?? state?.me?.nama ?? state?.me?.username ?? "-").trim();
}

async function saveLoadingScan(item, qty) {
    if (!activeShipmentId) {
        throw new Error("Pilih DPV terlebih dahulu.");
    }

    const operator = normalizeOperator();

    const result = await api("loadingScan", {
        shipmentId: activeShipmentId,

        upc: normalizeUPC(item.upc),

        sku: item.sku,

        name: item.name,

        qty: Number(qty || 1),

        operator,
    });

    if (!result?.success) {
        throw new Error(result?.message || "Gagal menyimpan scan Loading.");
    }

    return result;
}

async function processScan(upc) {
    const value = normalizeUPC(upc);

    if (!value) {
        return;
    }

    if (!activeShipmentId) {
        toast("Pilih DPV terlebih dahulu.", "warning");

        focusLoadingInput();

        return;
    }

    const now = Date.now();

    if (value === lastDetected && now - lastDetectedAt < 700) {
        return;
    }

    lastDetected = value;

    lastDetectedAt = now;

    busy(true);

    try {
        const item = await lookupUPC(value);

        const loaded = getLoadedQty(item.upc);

        const target = Number(item.target || 0);

        const remaining = Math.max(0, target - loaded);

        if (target > 0 && remaining <= 0) {
            throw new Error(`Qty loading untuk ${item.sku} sudah mencapai target.`);
        }

        const qty = await askLoadingQuantity(item, remaining);

        if (!qty) {
            return;
        }

        if (target > 0 && loaded + qty > target) {
            throw new Error(`Qty melebihi target. Sisa yang dapat dimuat: ${remaining}.`);
        }

        await saveLoadingScan(item, qty);

        const timestamp = new Date();

        loadingRows.push(
            normalizeLoadingRow({
                shipmentId: activeShipmentId,

                upc: item.upc,

                sku: item.sku,

                name: item.name,

                qty,

                operator: normalizeOperator(),

                timestamp: timestamp.toISOString(),

                lastUpdate: timestamp.toISOString(),
            }),
        );

        todayHistoryRows = loadingRows.filter(isTodayLoadingRow);

        updateLastResult(item, qty, timestamp);

        renderLoadingResult();
        renderLoadingHistory();
        updateLoadingState();

        toast(`${item.name} berhasil dimuat ×${qty}.`, "success");

        focusLoadingInput();
    } catch (error) {
        toast(error?.message || "Scan Loading gagal.", "error");

        focusLoadingInput();
    } finally {
        busy(false);
    }
}

function askLoadingQuantity(item, remaining) {
    return new Promise((resolve) => {
        const modal = $("modal");

        if (!modal) {
            resolve(1);
            return;
        }

        const max = remaining > 0 ? remaining : "";

        modal.innerHTML = `
            <div class="modal-backdrop">

                <div
                    class="modal-card"
                    role="dialog"
                    aria-modal="true">

                    <div class="modal-head">

                        <div>
                            <h3>Konfirmasi Qty</h3>

                            <p>
                                Pastikan jumlah barang
                                yang dimuat.
                            </p>
                        </div>

                        <button
                            type="button"
                            class="icon-btn"
                            data-action="cancel-loading-qty"
                            aria-label="Tutup">
                            ×
                        </button>

                    </div>

                    <div class="modal-body">

                        <div class="scan-confirm-item">

                            <div
                                class="scan-confirm-name">
                                ${esc(item?.name || "-")}
                            </div>

                            <div
                                class="scan-confirm-meta">
                                SKU:
                                ${esc(item?.sku || "-")}
                            </div>

                            <div
                                class="scan-confirm-meta">
                                UPC:
                                ${esc(item?.upc || "-")}
                            </div>

                            ${
                                remaining > 0
                                    ? `
                                        <div
                                            class="scan-confirm-meta">
                                            Sisa target:
                                            <strong>
                                                ${remaining}
                                            </strong>
                                        </div>
                                    `
                                    : ""
                            }

                        </div>

                        <label
                            class="field-label"
                            for="loadingQtyInput">
                            Qty
                        </label>

                        <input
                            id="loadingQtyInput"
                            class="input"
                            type="number"
                            min="1"
                            ${max ? `max="${max}"` : ""}
                            value="1"
                            inputmode="numeric"
                            autocomplete="off">

                        <div
                            class="modal-actions">

                            <button
                                id="loadingQtyCancelBtn"
                                type="button"
                                class="btn btn-soft">
                                Batal
                            </button>

                            <button
                                id="loadingQtyConfirmBtn"
                                type="button"
                                class="btn btn-primary">
                                Simpan
                            </button>

                        </div>

                    </div>

                </div>

            </div>
        `;

        modal.classList.remove("hidden");

        const input = $("loadingQtyInput");

        const cancel = $("loadingQtyCancelBtn");

        const confirm = $("loadingQtyConfirmBtn");

        let finished = false;

        const close = () => {
            if (finished) {
                return;
            }

            finished = true;

            modal.classList.add("hidden");

            modal.innerHTML = "";

            resolve(0);
        };

        const submit = () => {
            if (finished) {
                return;
            }

            const value = Number(input?.value || 0);

            if (!Number.isFinite(value) || value <= 0) {
                toast("Qty harus lebih dari 0.", "warning");

                input?.focus();

                return;
            }

            if (remaining > 0 && value > remaining) {
                toast(`Qty maksimal ${remaining}.`, "warning");

                input?.focus();

                return;
            }

            finished = true;

            modal.classList.add("hidden");

            modal.innerHTML = "";

            resolve(Math.floor(value));
        };

        cancel?.addEventListener("click", close);

        confirm?.addEventListener("click", submit);

        modal.querySelector('[data-action="cancel-loading-qty"]')?.addEventListener("click", close);

        input?.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                submit();
            }

            if (event.key === "Escape") {
                event.preventDefault();
                close();
            }
        });

        input?.focus();
        input?.select();
    });
}

function focusLoadingInput() {
    if (!activeShipmentId) {
        return;
    }

    const input = $("loadingScanInput");

    if (!input || input.disabled) {
        return;
    }

    setTimeout(() => {
        input.focus();
        input.select();
    }, 50);
}

function stopLoadingCamera() {
    loadingCameraRunning = false;

    loadingCameraHandler = null;

    if (window.Quagga && typeof window.Quagga.stop === "function") {
        try {
            window.Quagga.stop();
        } catch {}
    }

    if (cameraPermissionStream) {
        for (const track of cameraPermissionStream.getTracks()) {
            track.stop();
        }

        cameraPermissionStream = null;
    }

    const container = $("loadingCameraContainer");

    if (container) {
        container.innerHTML = "";
    }
}

async function openLoadingCamera() {
    if (!activeShipmentId) {
        toast("Pilih DPV terlebih dahulu.", "warning");

        return;
    }

    if (!activeShipment || (getStatus(activeShipment) !== "READY LOADING" && getStatus(activeShipment) !== "LOADING")) {
        toast("DPV belum siap untuk Loading.", "warning");

        return;
    }

    if (!window.Quagga) {
        toast("Scanner kamera belum tersedia.", "error");

        return;
    }

    stopLoadingCamera();

    const modal = $("modal");

    if (!modal) {
        return;
    }

    modal.innerHTML = `
        <div class="modal-backdrop">

            <div
                class="modal-card camera-modal"
                role="dialog"
                aria-modal="true">

                <div class="modal-head">

                    <div>
                        <h3>Scan dengan Kamera</h3>

                        <p>
                            Arahkan kamera ke barcode UPC.
                        </p>
                    </div>

                    <button
                        type="button"
                        class="icon-btn"
                        data-action="close-loading-camera"
                        aria-label="Tutup">
                        ×
                    </button>

                </div>

                <div class="modal-body">

                    <div
                        id="loadingCameraContainer"
                        class="camera-container">
                    </div>

                    <div
                        class="camera-hint">
                        Pastikan barcode terlihat jelas
                        dan pencahayaan cukup.
                    </div>

                </div>

            </div>

        </div>
    `;

    modal.classList.remove("hidden");

    modal.querySelector('[data-action="close-loading-camera"]')?.addEventListener("click", () => {
        stopLoadingCamera();
        closeLoadingModal();
    });

    const container = $("loadingCameraContainer");

    if (!container) {
        return;
    }

    loadingCameraRunning = true;

    try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            cameraPermissionStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: {
                        ideal: "environment",
                    },
                },
                audio: false,
            });

            for (const track of cameraPermissionStream.getTracks()) {
                track.stop();
            }

            cameraPermissionStream = null;
        }

        window.Quagga.init(
            {
                inputStream: {
                    type: "LiveStream",

                    target: container,

                    constraints: {
                        facingMode: "environment",
                        width: {
                            min: 640,
                            ideal: 1280,
                        },
                        height: {
                            min: 480,
                            ideal: 720,
                        },
                    },

                    area: {
                        top: "20%",
                        right: "10%",
                        left: "10%",
                        bottom: "20%",
                    },
                },

                locator: {
                    patchSize: "medium",

                    halfSample: true,
                },

                numOfWorkers: Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2)),

                frequency: 10,

                decoder: {
                    readers: ["ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader"],
                },

                locate: true,
            },

            (error) => {
                if (error) {
                    loadingCameraRunning = false;

                    toast("Kamera tidak dapat dijalankan.", "error");

                    return;
                }

                if (!loadingCameraRunning) {
                    return;
                }

                window.Quagga.start();

                loadingCameraHandler = (result) => {
                    if (!loadingCameraRunning) {
                        return;
                    }

                    const code = result?.codeResult?.code;

                    if (!code) {
                        return;
                    }

                    const value = normalizeUPC(code);

                    if (!value) {
                        return;
                    }

                    stopLoadingCamera();
                    closeLoadingModal();

                    processScan(value);
                };

                window.Quagga.onDetected(loadingCameraHandler);
            },
        );
    } catch (error) {
        loadingCameraRunning = false;

        stopLoadingCamera();

        toast(error?.message || "Kamera tidak dapat diakses.", "error");
    }
}

async function finishLoading() {
    if (!activeShipmentId) {
        toast("Pilih DPV terlebih dahulu.", "warning");

        return;
    }

    if (!activeShipment) {
        toast("Data DPV belum tersedia.", "warning");

        return;
    }

    const status = getStatus(activeShipment);

    if (status !== "READY LOADING" && status !== "LOADING") {
        toast("DPV tidak berada pada status Loading.", "warning");

        return;
    }

    const totals = getLoadingTotals();

    if (totals.target <= 0) {
        toast("DPV belum memiliki target Qty.", "warning");

        return;
    }

    if (totals.loaded < totals.target) {
        toast(`Loading belum selesai. Masih kurang ${totals.target - totals.loaded} Qty.`, "warning");

        return;
    }

    const confirmed = await confirmFinishLoading();

    if (!confirmed) {
        return;
    }

    busy(true);

    try {
        const result = await api("finishLoading", {
            shipmentId: activeShipmentId,
        });

        if (!result?.success) {
            throw new Error(result?.message || "Gagal menyelesaikan Loading.");
        }

        await loadShipments();

        const completedId = activeShipmentId;

        activeShipment = result?.shipment ?? result?.data?.shipment ?? activeShipment;

        if (activeShipment) {
            activeShipment.status = "SELESAI";
        }

        activeShipmentId = "";

        clearActiveShipment();

        stopLoadingCamera();

        renderActiveShipmentButton();

        loadingRows = [];
        todayHistoryRows = [];

        renderLoadingResult();
        renderLoadingHistory();
        updateLoadingState();

        toast(`Loading ${completedId} berhasil diselesaikan.`, "success");
    } catch (error) {
        toast(error?.message || "Gagal menyelesaikan Loading.", "error");
    } finally {
        busy(false);
    }
}

function confirmFinishLoading() {
    return new Promise((resolve) => {
        const modal = $("modal");

        if (!modal) {
            resolve(window.confirm("Selesaikan proses Loading?"));

            return;
        }

        modal.innerHTML = `
            <div class="modal-backdrop">

                <div
                    class="modal-card"
                    role="dialog"
                    aria-modal="true">

                    <div class="modal-head">

                        <div>
                            <h3>
                                Selesaikan Loading?
                            </h3>

                            <p>
                                Setelah diselesaikan,
                                DPV akan berstatus SELESAI.
                            </p>
                        </div>

                        <button
                            type="button"
                            class="icon-btn"
                            data-action="cancel-finish-loading"
                            aria-label="Tutup">
                            ×
                        </button>

                    </div>

                    <div class="modal-body">

                        <div
                            class="finish-loading-summary">

                            <div>
                                <span>
                                    DPV
                                </span>

                                <strong>
                                    ${esc(activeShipmentId)}
                                </strong>
                            </div>

                            <div>
                                <span>
                                    Total Loading
                                </span>

                                <strong>
                                    ${getLoadingTotals().loaded}
                                </strong>
                            </div>

                        </div>

                        <div
                            class="modal-actions">

                            <button
                                id="cancelFinishLoadingBtn"
                                type="button"
                                class="btn btn-soft">
                                Batal
                            </button>

                            <button
                                id="confirmFinishLoadingBtn"
                                type="button"
                                class="btn btn-primary">
                                Selesaikan
                            </button>

                        </div>

                    </div>

                </div>

            </div>
        `;

        modal.classList.remove("hidden");

        let finished = false;

        const close = () => {
            if (finished) {
                return;
            }

            finished = true;

            modal.classList.add("hidden");

            modal.innerHTML = "";

            resolve(false);
        };

        const confirm = () => {
            if (finished) {
                return;
            }

            finished = true;

            modal.classList.add("hidden");

            modal.innerHTML = "";

            resolve(true);
        };

        $("cancelFinishLoadingBtn")?.addEventListener("click", close);

        $("confirmFinishLoadingBtn")?.addEventListener("click", confirm);

        modal.querySelector('[data-action="cancel-finish-loading"]')?.addEventListener("click", close);
    });
}

export function bindLoading() {
    prepareLoadingLayout();

    if (window.__loadingGlobalEventsBound) {
        return;
    }

    window.__loadingGlobalEventsBound = true;

    window.addEventListener("loading:stop", () => {
        stopLoadingCamera();
    });

    window.addEventListener("page:leave", (event) => {
        const page = event?.detail?.page;

        if (page !== "loading") {
            stopLoadingCamera();
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopLoadingCamera();
        }
    });
}

export async function loadLoading() {
    prepareLoadingLayout();

    busy(true);

    try {
        stopLoadingCamera();

        await loadShipments();

        const restored = await restoreActiveShipment();

        if (!restored) {
            activeShipmentId = "";
            activeShipment = null;

            loadingRows = [];
            todayHistoryRows = [];

            clearActiveShipment();

            renderActiveShipmentButton();
            renderLoadingResult();
            renderLoadingHistory();
            updateLoadingState();
        }

        if (activeShipmentId && activeShipment) {
            const status = getStatus(activeShipment);

            if (status !== "READY LOADING" && status !== "LOADING") {
                activeShipmentId = "";
                activeShipment = null;

                loadingRows = [];
                todayHistoryRows = [];

                clearActiveShipment();

                renderActiveShipmentButton();
                renderLoadingResult();
                renderLoadingHistory();
                updateLoadingState();
            }
        }

        if (!activeShipmentId) {
            updateLastResult(
                {
                    name: "Belum ada scan",
                    sku: "-",
                    upc: "-",
                },
                0,
                new Date(),
            );

            const lastResult = $("loadingLastResult");

            if (lastResult) {
                lastResult.innerHTML = `
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
            }
        }

        updateLoadingState();
    } catch (error) {
        toast(error?.message || "Gagal memuat halaman Loading.", "error");

        activeShipmentId = "";
        activeShipment = null;

        loadingRows = [];
        todayHistoryRows = [];

        clearActiveShipment();

        renderActiveShipmentButton();
        renderLoadingResult();
        renderLoadingHistory();
        updateLoadingState();
    } finally {
        busy(false);
    }
}

window.addEventListener("loading:refresh", async () => {
    if (!activeShipmentId) {
        return;
    }

    try {
        await refreshLoadingData();
    } catch (error) {
        toast(error?.message || "Gagal memperbarui Loading.", "error");
    }
});

window.addEventListener("loading:reset", () => {
    stopLoadingCamera();

    activeShipmentId = "";
    activeShipment = null;

    loadingRows = [];
    todayHistoryRows = [];

    lastDetected = "";
    lastDetectedAt = 0;

    clearActiveShipment();

    renderActiveShipmentButton();
    renderLoadingResult();
    renderLoadingHistory();
    updateLoadingState();

    const input = $("loadingScanInput");

    if (input) {
        input.value = "";
    }

    const lastResult = $("loadingLastResult");

    if (lastResult) {
        lastResult.innerHTML = `
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
    }
});

window.addEventListener("beforeunload", () => {
    stopLoadingCamera();
});
