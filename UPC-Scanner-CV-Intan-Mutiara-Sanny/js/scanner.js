import { state, $, busy, toast } from "./state.js";
import { api } from "./api.js";

import { updateStats, showLast, showLastError, renderToday } from "./dashboard.js";

/* =========================
   VARIABEL SCANNER
========================= */

let lastDetected = "";
let lastDetectedAt = 0;

/* =========================
   FOCUS SCANNER
========================= */

export function focusScan() {
    setTimeout(() => {
        if (state.cameraRunning) return;

        const input = $("scanInput");

        if (input) {
            input.focus();
            input.select();
        }
    }, 80);
}

/* =========================
   SCAN UTAMA
========================= */

export async function doScan(upc) {
    const value = String(upc || "").trim();

    if (!value || !/^\d+$/.test(value)) {
        return;
    }

    const scanInput = $("scanInput");

    if (scanInput) {
        scanInput.value = "";
    }

    busy(true);

    try {
        const r = await api("scanUPC", {
            upc: value,
        });

        if (!r.success) {
            if (r.code === "SESSION_EXPIRED") {
                window.dispatchEvent(new Event("scanner:stop"));
            }

            showLastError(r.message || "Scan gagal");

            toast(r.message || "Scan gagal", true);

            return;
        }

        state.todayRows = r.rows || [];

        updateStats(r.summary || {});

        showLast(r.item);

        renderToday();

        toast(`✓ ${r.item?.name || "Barang"} · Qty ${r.item?.qty ?? 1}`);
    } catch (e) {
        console.error("Scan error:", e);

        toast(e.message || "Tidak dapat terhubung ke server.", true);
    } finally {
        busy(false);

        focusScan();
    }
}

/* =========================
   QUAGGA
========================= */

function getQuagga() {
    return window.Quagga || window.quagga || null;
}

/* =========================
   PILIH KAMERA
========================= */

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
    } catch (e) {
        console.warn("Gagal membaca daftar kamera:", e);

        return null;
    }
}

/* =========================
   HTML CAMERA MODAL
========================= */

function cameraMarkup() {
    return `
        <div class="modal-head">

            <h3>Scan dengan Kamera</h3>

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

                <span class="barcode-corner tl"></span>
                <span class="barcode-corner tr"></span>
                <span class="barcode-corner bl"></span>
                <span class="barcode-corner br"></span>

                <span class="barcode-laser"></span>

            </div>

        </div>

        <div
            class="camera-status"
            id="cameraStatus"
        >
            Mencari barcode...
        </div>

        <div class="camera-help">
            Posisikan barcode mendatar di dalam kotak hijau.
            Pastikan cukup terang dan barcode terlihat tajam.
        </div>
    `;
}

/* =========================
   PERBAIKI TAMPILAN KAMERA
========================= */

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
    }

    if (canvas) {
        canvas.style.position = "absolute";
        canvas.style.inset = "0";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.pointerEvents = "none";
    }
}

/* =========================
   OPEN CAMERA
========================= */

export async function openCamera() {
    const Quagga = getQuagga();

    if (!Quagga) {
        toast("Scanner kamera belum termuat. Periksa koneksi internet.", true);

        return;
    }

    await stopCamera();

    const modal = $("modal");
    const content = $("modalContent");

    if (!modal || !content) {
        return;
    }

    content.innerHTML = cameraMarkup();

    modal.classList.remove("hidden");

    state.cameraRunning = true;

    const status = $("cameraStatus");

    const device = await chooseCamera();

    /* =========================
       CAMERA CONSTRAINTS
    ========================= */

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

    /* =========================
       QUAGGA CONFIG
    ========================= */

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

    /* =========================
       BARCODE DETECTED
    ========================= */

    const detected = async (result) => {
        if (!state.cameraRunning) {
            return;
        }

        const code = String(result?.codeResult?.code || "").trim();

        if (!/^\d{6,13}$/.test(code)) {
            return;
        }

        const now = Date.now();

        /*
         * Hindari barcode yang sama
         * terbaca berkali-kali.
         */

        if (code === lastDetected && now - lastDetectedAt < 1800) {
            return;
        }

        lastDetected = code;

        lastDetectedAt = now;

        state.cameraRunning = false;

        if (status) {
            status.textContent = `Barcode terdeteksi: ${code}`;
        }

        await stopCamera();

        closeModal(false);

        await doScan(code);
    };

    /* =========================
       START QUAGGA
    ========================= */

    try {
        Quagga.onDetected(detected);

        await new Promise((resolve, reject) => {
            Quagga.init(config, (err) => {
                if (err) {
                    reject(err);
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
    } catch (e) {
        console.error("Quagga start error:", e);

        state.cameraRunning = false;

        await stopCamera();

        toast(`Kamera gagal dijalankan: ${e?.message || e}`, true);
    }
}

/* =========================
   STOP CAMERA
========================= */

export async function stopCamera() {
    const Quagga = getQuagga();

    state.cameraRunning = false;

    if (Quagga) {
        try {
            Quagga.offDetected();
        } catch (e) {
            console.warn("Gagal melepas event Quagga:", e);
        }

        try {
            Quagga.stop();
        } catch (e) {
            console.warn("Gagal menghentikan Quagga:", e);
        }
    }

    document.querySelectorAll(".camera-box video").forEach((video) => {
        try {
            if (video.srcObject) {
                video.srcObject.getTracks().forEach((track) => {
                    track.stop();
                });
            }
        } catch (e) {
            console.warn("Gagal menghentikan track kamera:", e);
        }
    });
}

/* =========================
   CLOSE MODAL
========================= */

export function closeModal(keepCamera = false) {
    if (!keepCamera) {
        stopCamera();
    }

    const modal = $("modal");

    if (modal) {
        modal.classList.add("hidden");
    }
}

/* =========================
   BIND SCANNER
========================= */

export function bindScanner() {
    const scanInput = $("scanInput");

    /* =========================
       ENTER DARI BARCODE SCANNER
    ========================= */

    if (scanInput) {
        scanInput.addEventListener("keydown", (e) => {
            if (e.key !== "Enter") {
                return;
            }

            e.preventDefault();

            const value = scanInput.value.trim();

            if (value) {
                doScan(value);
            }
        });

        /* =========================
           FOCUS KEMBALI
        ========================= */

        scanInput.addEventListener("blur", () => {
            const modal = $("modal");

            if (modal && !modal.classList.contains("hidden")) {
                return;
            }

            setTimeout(focusScan, 180);
        });
    }

    /* =========================
       TOMBOL KAMERA
    ========================= */

    const cameraBtn = $("cameraBtn");

    if (cameraBtn) {
        cameraBtn.addEventListener("click", openCamera);
    }

    /* =========================
       TOMBOL MANUAL FOCUS
    ========================= */

    const manualFocusBtn = $("manualFocusBtn");

    if (manualFocusBtn) {
        manualFocusBtn.addEventListener("click", focusScan);
    }

    /* =========================
       EVENT STOP SCANNER
    ========================= */

    window.addEventListener("scanner:stop", () => {
        stopCamera();
    });

    /* =========================
       ESCAPE
    ========================= */

    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !$("modal")?.classList.contains("hidden")) {
            closeModal();
        }
    });

    /* =========================
       CLICK CLOSE MODAL
    ========================= */

    const modal = $("modal");

    if (modal) {
        modal.addEventListener("click", (e) => {
            const closeButton = e.target.closest('[data-action="close-modal"]');

            if (closeButton) {
                closeModal();
            }
        });
    }

    /* =========================
       FOCUS AWAL
    ========================= */

    focusScan();
}
