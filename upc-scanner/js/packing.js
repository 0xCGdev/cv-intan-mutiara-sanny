import { state, $, busy, toast } from "./state.js";
import { api } from "./api.js";

/* =========================================================
   PACKING
   CV INTAN MUTIARA SANNY
========================================================= */

let activeShipmentId = "";
let activeShipment = null;

let packingRows = [];

let lastDetected = "";
let lastDetectedAt = 0;

let packingCameraRunning = false;
let packingCameraHandler = null;

/* =========================================================
   HELPER
========================================================= */

function esc(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getStatus(shipment) {
    return String(shipment?.status ?? shipment?.STATUS ?? "")
        .trim()
        .toUpperCase();
}

function getShipmentId(shipment) {
    return String(shipment?.shipmentId ?? shipment?.SHIPMENT_ID ?? shipment?.id ?? "").trim();
}

function getTodayKey() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getStorageKey() {
    return `upc_packing_active_shipment_${getTodayKey()}`;
}

function saveActiveShipment() {
    if (!activeShipmentId) return;

    localStorage.setItem(getStorageKey(), activeShipmentId);
}

function clearActiveShipment() {
    localStorage.removeItem(getStorageKey());
}

/* =========================================================
   DATA NORMALIZATION
========================================================= */

function getPackingRows(response) {
    const rows = response?.packing || response?.data?.packing || [];

    return Array.isArray(rows) ? rows : [];
}

function normalizePackingRow(row) {
    return {
        upc: String(row?.upc ?? row?.UPC ?? "").trim(),

        sku: String(row?.sku ?? row?.SKU ?? "-").trim(),

        name: String(row?.name ?? row?.NAMA_BARANG ?? "-").trim(),

        qty: Number(row?.qty ?? row?.QTY ?? 0),
    };
}

/* =========================================================
   RENDER STAT
========================================================= */

function renderStats() {
    const shipmentEl = $("packingShipment");
    const skuEl = $("packingStatSku");
    const qtyEl = $("packingStatQty");
    const scanEl = $("packingStatScan");

    if (shipmentEl) {
        shipmentEl.textContent = activeShipmentId || "-";
    }

    const rows = packingRows.map(normalizePackingRow);

    const totalSku = rows.length;

    const totalQty = rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);

    /*
     * Total Scan = jumlah baris/item UPC
     * yang sudah tercatat dalam shipment.
     */
    const totalScan = rows.length;

    if (skuEl) {
        skuEl.textContent = totalSku;
    }

    if (qtyEl) {
        qtyEl.textContent = totalQty;
    }

    if (scanEl) {
        scanEl.textContent = totalScan;
    }
}

/* =========================================================
   RENDER LAST RESULT
========================================================= */

function renderLastResult(item, qty) {
    const box = $("packingLastResult");

    if (!box) return;

    box.innerHTML = `
        <div class="last-title">
            SCAN BERHASIL
        </div>

        <div class="last-name">
            ${esc(item?.name || "Barang")}
        </div>

        <div class="last-meta">
            SKU: ${esc(item?.sku || "-")}
            · UPC: ${esc(item?.upc || "-")}
        </div>

        <div class="last-qty">
            Qty scan: ${Number(qty || 0)}
        </div>
    `;
}

function renderLastError(message) {
    const box = $("packingLastResult");

    if (!box) return;

    box.innerHTML = `
        <div
            class="last-title"
            style="color:var(--danger)"
        >
            SCAN GAGAL
        </div>

        <div
            class="last-name"
            style="color:var(--danger)"
        >
            UPC Tidak Ditemukan
        </div>

        <div class="last-meta">
            ${esc(message || "Scan gagal.")}
        </div>
    `;
}

/* =========================================================
   RENDER RIWAYAT SCAN
========================================================= */

function renderHistory() {
    const container = $("packingHistoryRows");

    if (!container) return;

    const rows = packingRows.map(normalizePackingRow).filter((row) => row.upc);

    if (!rows.length) {
        container.innerHTML = `
            <div class="empty">
                Belum ada barang yang discan.
            </div>
        `;

        return;
    }

    container.innerHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th>UPC</th>
                    <th>Barang</th>
                    <th>Qty</th>
                </tr>
            </thead>

            <tbody>
                ${rows
                    .map(
                        (row) => `
                    <tr>
                        <td>
                            ${esc(row.upc)}
                        </td>

                        <td>
                            <b>${esc(row.name)}</b>
                            <br>
                            <span style="color:var(--muted)">
                                ${esc(row.sku)}
                            </span>
                        </td>

                        <td class="qty">
                            ${Number(row.qty || 0)}
                        </td>
                    </tr>
                `,
                    )
                    .join("")}
            </tbody>
        </table>
    `;
}

/* =========================================================
   RENDER PACKING PAGE
========================================================= */

function renderPackingPage() {
    renderStats();
    renderHistory();

    const input = $("packingScanInput");

    const status = getStatus(activeShipment);

    const disabled = !!activeShipmentId && status !== "PACKING";

    const cameraBtn = $("packingCameraBtn");

    if (cameraBtn) {
        cameraBtn.disabled = disabled;
    }

    if (input) {
        input.disabled = disabled;

        if (!activeShipmentId) {
            input.placeholder = "Scan untuk membuat Shipment...";
        } else if (status === "PACKING") {
            input.placeholder = "Scan UPC di sini...";
        } else {
            input.placeholder = "Packing sudah selesai";
        }
    }

    const editBtn = $("editPackingShipmentBtn");

    if (editBtn) {
        editBtn.disabled = !activeShipmentId;
    }
}

/* =========================================================
   LOAD ACTIVE SHIPMENT
========================================================= */

async function restoreActiveShipment() {
    const saved = localStorage.getItem(getStorageKey());

    if (!saved) {
        activeShipmentId = "";
        activeShipment = null;
        packingRows = [];

        renderPackingPage();

        return;
    }

    try {
        busy(true);

        const response = await api("getShipment", {
            shipmentId: saved,
        });

        if (!response?.success) {
            clearActiveShipment();

            activeShipmentId = "";
            activeShipment = null;
            packingRows = [];

            renderPackingPage();

            return;
        }

        activeShipmentId = saved;

        activeShipment = response.shipment || response.data?.shipment || null;

        packingRows = getPackingRows(response);

        renderPackingPage();
    } catch (error) {
        console.error("Restore shipment error:", error);

        activeShipmentId = "";
        activeShipment = null;
        packingRows = [];

        renderPackingPage();
    } finally {
        busy(false);
    }
}

/* =========================================================
   LOAD PACKING
========================================================= */

export async function loadPacking() {
    /*
     * Jangan memuat kamera otomatis.
     * Packing hanya menampilkan halaman scanner.
     */

    await restoreActiveShipment();
}

/* =========================================================
   LOOKUP UPC
========================================================= */

async function lookupUPC(upc) {
    const value = String(upc || "").trim();

    if (!value) return null;

    const response = await api("lookupUPC", {
        upc: value,
    });

    if (!response?.success) {
        throw new Error(response?.message || "UPC tidak ditemukan.");
    }

    return response.item || response.data?.item || null;
}

/* =========================================================
   SCAN UPC
========================================================= */

async function processScan(upc) {
    const value = String(upc || "").trim();

    if (!value) return;

    if (!/^\d+$/.test(value)) {
        toast("UPC harus berupa angka.", true);

        return;
    }

    const status = getStatus(activeShipment);

    /*
     * Jika belum ada shipment,
     * scan pertama akan meminta
     * nomor shipment + qty.
     */

    if (activeShipmentId && status !== "PACKING") {
        toast("Packing shipment ini sudah selesai.", true);

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

        const firstScan = !activeShipmentId;

        showPackingConfirmModal(item, firstScan);
    } catch (error) {
        console.error("Packing lookup error:", error);

        renderLastError(error?.message || "UPC tidak ditemukan.");

        toast(error?.message || "UPC tidak ditemukan.", true);
    } finally {
        busy(false);
    }
}

/* =========================================================
   MODAL KONFIRMASI PACKING
========================================================= */

function showPackingConfirmModal(item, firstScan) {
    const modal = $("modal");
    const content = $("modalContent");

    if (!modal || !content) {
        toast("Modal tidak ditemukan.", true);

        return;
    }

    const upc = String(item?.upc || "").trim();

    const sku = String(item?.sku || "-").trim();

    const name = String(item?.name || "-").trim();

    content.innerHTML = `
        <div class="modal-head">

            <h3>
                Konfirmasi Barang
            </h3>

            <button
                class="close"
                data-action="close-modal"
                aria-label="Tutup"
                type="button"
            >
                ×
            </button>

        </div>

        <div class="scan-confirm">

            <div class="scan-confirm-row">
                <span>UPC</span>
                <strong>
                    ${esc(upc)}
                </strong>
            </div>

            <div class="scan-confirm-row">
                <span>SKU</span>
                <strong>
                    ${esc(sku)}
                </strong>
            </div>

            <div class="scan-confirm-row">
                <span>Nama Barang</span>
                <strong>
                    ${esc(name)}
                </strong>
            </div>

            ${
                firstScan
                    ? `
                        <div
                            class="scan-confirm-qty"
                            style="margin-top:16px"
                        >
                            <label
                                for="packingShipmentInput"
                            >
                                NO. SHIPMENT
                            </label>

                            <input
                                id="packingShipmentInput"
                                class="input"
                                type="text"
                                autocomplete="off"
                                placeholder="Masukkan No. Shipment"
                            >
                        </div>
                    `
                    : ""
            }

            <div
                class="scan-confirm-qty"
                style="margin-top:${firstScan ? "10px" : "16px"}"
            >

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
                    value="1"
                >

            </div>

            <div class="scan-confirm-actions">

                <button
                    type="button"
                    class="btn btn-secondary"
                    data-action="close-modal"
                >
                    Batal
                </button>

                <button
                    type="button"
                    class="btn btn-primary"
                    id="savePackingScanBtn"
                >
                    Simpan
                </button>

            </div>

        </div>
    `;

    modal.classList.remove("hidden");

    const shipmentInput = $("packingShipmentInput");

    const qtyInput = $("packingQtyInput");

    const saveButton = $("savePackingScanBtn");

    if (firstScan && shipmentInput) {
        shipmentInput.focus();

        shipmentInput.addEventListener("keydown", (e) => {
            if (e.key !== "Enter") {
                return;
            }

            e.preventDefault();

            qtyInput?.focus();
            qtyInput?.select();
        });
    } else {
        qtyInput?.focus();
        qtyInput?.select();
    }

    qtyInput?.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") {
            return;
        }

        e.preventDefault();

        saveButton?.click();
    });

    saveButton?.addEventListener("click", async () => {
        let shipmentId = activeShipmentId;

        if (firstScan) {
            shipmentId = String(shipmentInput?.value || "").trim();

            if (!shipmentId) {
                toast("No. Shipment wajib diisi.", true);

                shipmentInput?.focus();

                return;
            }
        }

        const qty = Number(qtyInput?.value);

        if (!Number.isInteger(qty) || qty <= 0) {
            toast("QTY harus berupa angka bulat lebih dari 0.", true);

            qtyInput?.focus();
            qtyInput?.select();

            return;
        }

        await savePackingScan(shipmentId, upc, qty, item, firstScan);
    });
}

/* =========================================================
   CREATE / USE SHIPMENT
========================================================= */

async function ensureShipment(shipmentId) {
    /*
     * Coba ambil shipment terlebih dahulu.
     * Jika belum ada, buat shipment baru.
     */

    const existing = await api("getShipment", {
        shipmentId,
    });

    if (existing?.success) {
        const shipment = existing.shipment || existing.data?.shipment;

        if (!shipment) {
            throw new Error("Data shipment tidak valid.");
        }

        const status = getStatus(shipment);

        if (status !== "PACKING") {
            throw new Error(`Shipment ${shipmentId} tidak dapat digunakan. Status: ${status}.`);
        }

        activeShipmentId = shipmentId;

        activeShipment = shipment;

        packingRows = getPackingRows(existing);

        saveActiveShipment();

        return;
    }

    /*
     * Shipment belum ada.
     */

    const created = await api("createShipment", {
        shipmentId,
    });

    if (!created?.success) {
        throw new Error(created?.message || "Gagal membuat Shipment.");
    }

    activeShipmentId = shipmentId;

    activeShipment = created.shipment || created.data?.shipment || null;

    packingRows = [];

    saveActiveShipment();
}

/* =========================================================
   SAVE PACKING SCAN
========================================================= */

async function savePackingScan(shipmentId, upc, qty, item, firstScan) {
    try {
        busy(true);

        if (firstScan) {
            await ensureShipment(shipmentId);
        }

        if (!activeShipmentId) {
            throw new Error("Shipment belum dipilih.");
        }

        const response = await api("packingScan", {
            shipmentId: activeShipmentId,

            upc,

            qty,
        });

        if (!response?.success) {
            throw new Error(response?.message || "Gagal menyimpan Packing.");
        }

        /*
         * Tutup modal.
         */

        closePackingModal();

        /*
         * Tambahkan / refresh data.
         */

        await refreshActiveShipment();

        renderLastResult(item, qty);

        toast(`✓ ${item?.name || "Barang"} · Qty ${qty}`);
    } catch (error) {
        console.error("Save packing error:", error);

        toast(error?.message || "Gagal menyimpan Packing.", true);
    } finally {
        busy(false);

        focusPackingInput();
    }
}

/* =========================================================
   REFRESH ACTIVE SHIPMENT
========================================================= */

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

    activeShipment = response.shipment || response.data?.shipment || null;

    packingRows = getPackingRows(response);

    saveActiveShipment();

    renderPackingPage();
}

/* =========================================================
   EDIT / GANTI SHIPMENT
========================================================= */

async function editShipment() {
    if (!activeShipmentId) {
        toast("Belum ada Shipment aktif.", true);

        return;
    }

    /*
     * Untuk sementara tombol pensil digunakan
     * untuk memilih Shipment lain.
     *
     * Pengubahan ID Shipment secara permanen
     * membutuhkan action backend khusus.
     */

    const result = await Swal.fire({
        title: "Ganti Shipment",

        input: "text",

        inputValue: activeShipmentId,

        inputLabel: "No. Shipment",

        inputPlaceholder: "Masukkan No. Shipment",

        showCancelButton: true,

        confirmButtonText: "Gunakan",

        cancelButtonText: "Batal",

        inputValidator: (value) => {
            if (!String(value || "").trim()) {
                return "No. Shipment wajib diisi.";
            }

            return undefined;
        },
    });

    if (!result.isConfirmed) {
        return;
    }

    const shipmentId = String(result.value || "").trim();

    if (shipmentId === activeShipmentId) {
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

        const shipment = response.shipment || response.data?.shipment;

        if (!shipment) {
            throw new Error("Shipment tidak ditemukan.");
        }

        activeShipmentId = shipmentId;

        activeShipment = shipment;

        packingRows = getPackingRows(response);

        saveActiveShipment();

        renderPackingPage();

        toast(`Shipment ${shipmentId} aktif.`);
    } catch (error) {
        console.error("Change shipment error:", error);

        toast(error?.message || "Shipment tidak ditemukan.", true);
    } finally {
        busy(false);

        focusPackingInput();
    }
}

/* =========================================================
   FINISH PACKING
========================================================= */

async function finishPacking() {
    if (!activeShipmentId) {
        toast("Belum ada Shipment aktif.", true);

        return;
    }

    if (!packingRows.length) {
        toast("Belum ada barang yang dipacking.", true);

        return;
    }

    const status = getStatus(activeShipment);

    if (status !== "PACKING") {
        toast("Shipment ini sudah tidak dalam status Packing.", true);

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

        await refreshActiveShipment();

        toast("✓ Packing selesai. Shipment siap Loading.");
    } catch (error) {
        console.error("Finish packing error:", error);

        toast(error?.message || "Gagal menyelesaikan Packing.", true);
    } finally {
        busy(false);

        focusPackingInput();
    }
}

/* =========================================================
   CAMERA — MODAL SAMA DENGAN SCANNER LAMA
========================================================= */

function getQuagga() {
    return window.Quagga || window.quagga || null;
}

async function chooseCamera() {
    const Quagga = getQuagga();

    if (!Quagga || !Quagga.CameraAccess || !Quagga.CameraAccess.enumerateVideoDevices) {
        return null;
    }

    try {
        const devices = await Quagga.CameraAccess.enumerateVideoDevices();

        if (!devices || !devices.length) {
            return null;
        }

        return devices.find((device) => /back|rear|environment|webcam|integrated|camera/i.test(device.label || "")) || devices[0];
    } catch (error) {
        console.warn("Gagal membaca kamera:", error);

        return null;
    }
}

/* =========================================================
   CAMERA MARKUP
========================================================= */

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
                type="button"
            >
                ×
            </button>

        </div>

        <div class="camera-box">

            <div
                id="quaggaReader"
                class="quagga-reader"
            ></div>

            <div class="barcode-overlay"></div>

            <div
                class="barcode-frame"
                aria-hidden="true"
            >
                <span
                    class="barcode-corner tl"
                ></span>

                <span
                    class="barcode-corner tr"
                ></span>

                <span
                    class="barcode-corner bl"
                ></span>

                <span
                    class="barcode-corner br"
                ></span>

                <span
                    class="barcode-laser"
                ></span>
            </div>

        </div>

        <div
            class="camera-status"
            id="cameraStatus"
        >
            Mencari barcode...
        </div>

        <div class="camera-help">
            Posisikan barcode mendatar di dalam
            kotak hijau. Pastikan cukup terang
            dan barcode terlihat tajam.
        </div>
    `;
}

/* =========================================================
   CAMERA DISPLAY
========================================================= */

function fixCameraDisplay() {
    const box = document.querySelector(".camera-box");

    if (!box) return;

    const video = box.querySelector("video");

    const canvas = box.querySelector("canvas");

    if (video) {
        video.style.width = "100%";

        video.style.height = "100%";

        video.style.objectFit = "cover";

        video.style.objectPosition = "center center";

        video.setAttribute("playsinline", "true");
    }

    if (canvas) {
        canvas.style.position = "absolute";

        canvas.style.inset = "0";

        canvas.style.width = "100%";

        canvas.style.height = "100%";

        canvas.style.pointerEvents = "none";
    }
}

/* =========================================================
   OPEN PACKING CAMERA
========================================================= */

async function openPackingCamera() {
    if (activeShipmentId && getStatus(activeShipment) !== "PACKING") {
        toast("Packing shipment ini sudah selesai.", true);

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

    packingCameraRunning = true;

    state.cameraRunning = true;

    const status = $("cameraStatus");

    const device = await chooseCamera();

    const constraints = {
        width: {
            min: 640,
            ideal: 1280,
        },

        height: {
            min: 480,
            ideal: 720,
        },
    };

    if (device && device.deviceId) {
        constraints.deviceId = {
            exact: device.deviceId,
        };
    } else {
        constraints.facingMode = {
            ideal: "environment",
        };
    }

    const config = {
        inputStream: {
            name: "Live",

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
    };

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

    try {
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

        setTimeout(fixCameraDisplay, 250);

        setTimeout(fixCameraDisplay, 800);

        if (status) {
            status.textContent = "Kamera aktif · arahkan barcode ke kotak hijau";
        }
    } catch (error) {
        console.error("Packing camera error:", error);

        packingCameraRunning = false;

        state.cameraRunning = false;

        await stopPackingCamera();

        closePackingModal();

        toast("Kamera gagal dijalankan: " + (error?.message || error), true);
    }
}

/* =========================================================
   STOP PACKING CAMERA
========================================================= */

async function stopPackingCamera() {
    const Quagga = getQuagga();

    packingCameraRunning = false;

    state.cameraRunning = false;

    if (Quagga) {
        try {
            if (packingCameraHandler) {
                Quagga.offDetected(packingCameraHandler);
            }
        } catch (error) {
            console.warn("Gagal melepas handler kamera:", error);
        }

        try {
            Quagga.stop();
        } catch (error) {
            // Kamera mungkin memang sudah berhenti.
        }
    }

    document.querySelectorAll(".camera-box video").forEach((video) => {
        try {
            if (video.srcObject) {
                video.srcObject.getTracks().forEach((track) => track.stop());
            }
        } catch (error) {
            console.warn("Gagal menghentikan kamera:", error);
        }
    });

    packingCameraHandler = null;
}

/* =========================================================
   CLOSE PACKING MODAL
========================================================= */

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
}

/* =========================================================
   FOCUS INPUT
========================================================= */

function focusPackingInput() {
    setTimeout(() => {
        const modal = $("modal");

        if (modal && !modal.classList.contains("hidden")) {
            return;
        }

        const input = $("packingScanInput");

        if (input && !input.disabled) {
            input.focus();
            input.select();
        }
    }, 180);
}

/* =========================================================
   BIND PACKING
========================================================= */

export function bindPacking() {
    /* =====================================================
       INPUT SCANNER USB / BLUETOOTH
    ===================================================== */

    const input = $("packingScanInput");

    if (input) {
        input.addEventListener("keydown", async (e) => {
            if (e.key !== "Enter") {
                return;
            }

            e.preventDefault();

            const value = input.value.trim();

            input.value = "";

            if (value) {
                await processScan(value);
            }
        });

        input.addEventListener("blur", () => {
            setTimeout(focusPackingInput, 180);
        });
    }

    /* =====================================================
       KAMERA
    ===================================================== */

    const cameraBtn = $("packingCameraBtn");

    cameraBtn?.addEventListener("click", openPackingCamera);

    /* =====================================================
       TOMBOL SCANNER USB
    ===================================================== */

    const manualBtn = $("packingManualFocusBtn");

    manualBtn?.addEventListener("click", focusPackingInput);

    /* =====================================================
       EDIT SHIPMENT
    ===================================================== */

    const editShipmentBtn = $("editPackingShipmentBtn");

    editShipmentBtn?.addEventListener("click", editShipment);

    /* =====================================================
       CLOSE MODAL
    ===================================================== */

    const modal = $("modal");

    if (modal) {
        modal.addEventListener("click", (e) => {
            const closeButton = e.target.closest('[data-action="close-modal"]');

            if (closeButton) {
                closePackingModal();
            }
        });
    }

    /* =====================================================
       ESCAPE
    ===================================================== */

    window.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") {
            return;
        }

        const modal = $("modal");

        if (modal && !modal.classList.contains("hidden")) {
            closePackingModal();
        }
    });

    /* =====================================================
       STOP SAAT PAGE BERPINDAH
    ===================================================== */

    window.addEventListener("packing:stop", () => {
        stopPackingCamera();
    });
}

/* =========================================================
   EXPORT
========================================================= */

export { processScan, editShipment, finishPacking };
