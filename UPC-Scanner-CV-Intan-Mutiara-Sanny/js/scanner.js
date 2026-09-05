import { state, $, busy, toast } from "./state.js";

import { updateStats, showLast, showLastError, renderToday } from "./dashboard.js";

import { api } from "./api.js";

/* =========================================================
   FOCUS INPUT SCANNER
========================================================= */

export function focusScan() {
    setTimeout(() => {
        const input = $("scanInput");

        if (input) {
            input.focus();
            input.select();
        }
    }, 80);
}

/* =========================================================
   PROSES SCAN UTAMA
   Dipakai oleh:
   - USB scanner
   - Bluetooth scanner
   - Kamera
========================================================= */

export async function doScan(upc) {
    const value = String(upc || "").trim();

    if (!value) {
        return;
    }

    const input = $("scanInput");

    if (input) {
        input.value = "";
    }

    busy(true);

    try {
        const r = await api("scanUPC", {
            upc: value,
        });

        if (!r.success) {
            showLastError(r.message || "Scan gagal");

            toast(r.message || "Scan gagal", true);

            return;
        }

        state.todayRows = r.rows || [];

        updateStats(r.summary || {});

        showLast(r.item);

        renderToday();

        toast("✓ " + (r.item?.name || "Barang") + " · Qty " + (r.item?.qty ?? 1));
    } catch (e) {
        console.error("Scan error:", e);

        toast(e?.message || "Tidak dapat terhubung ke server.", true);
    } finally {
        busy(false);

        focusScan();
    }
}

/* =========================================================
   OPEN CAMERA
========================================================= */

export async function openCamera() {
    console.log("Membuka scanner barcode...");

    /* -----------------------------------------------------
       CEK QUAGGA
    ----------------------------------------------------- */

    if (typeof window.Quagga === "undefined") {
        console.error("Quagga tidak tersedia.");

        toast("Modul barcode scanner belum termuat.", true);

        return;
    }

    /* -----------------------------------------------------
       HENTIKAN SCANNER SEBELUMNYA
    ----------------------------------------------------- */

    await stopCamera();

    /* -----------------------------------------------------
       AMBIL MODAL
    ----------------------------------------------------- */

    const modal = $("modal");

    const modalContent = $("modalContent");

    if (!modal || !modalContent) {
        toast("Modal kamera tidak ditemukan.", true);

        return;
    }

    /* =====================================================
       HTML CAMERA
    ===================================================== */

    modalContent.innerHTML = `

        <style>

            /* =============================================
               WRAPPER
            ============================================= */

            .barcode-camera-wrapper {

                width: 100%;

                max-width: 430px;

                margin: 0 auto;

            }


            /* =============================================
               CAMERA PERSEGI
            ============================================= */

            .barcode-camera {

                position: relative;

                width: 100%;

                aspect-ratio: 1 / 1;

                overflow: hidden;

                background: #000;

                border-radius: 18px;

                margin: 12px auto;

                box-shadow:
                    0 10px 30px
                    rgba(0,0,0,.18);

            }


            /* =============================================
               VIDEO
            ============================================= */

            .barcode-camera video {

                position: absolute !important;

                top: 0 !important;
                left: 0 !important;

                width: 100% !important;
                height: 100% !important;

                object-fit: contain !important;

                display: block !important;

                background: #000;

            }


            /* =============================================
               CANVAS QUAGGA
            ============================================= */

            .barcode-camera canvas {

                position: absolute !important;

                top: 0 !important;
                left: 0 !important;

                width: 100% !important;
                height: 100% !important;

                pointer-events: none;

            }


            /* =============================================
               OVERLAY
            ============================================= */

            .barcode-overlay {

                position: absolute;

                inset: 0;

                z-index: 10;

                pointer-events: none;

                background:

                    linear-gradient(
                        to bottom,
                        rgba(0,0,0,.28) 0%,
                        rgba(0,0,0,.08) 28%,
                        transparent 28%,
                        transparent 72%,
                        rgba(0,0,0,.08) 72%,
                        rgba(0,0,0,.28) 100%
                    );

            }


            /* =============================================
               FRAME SCANNING
            ============================================= */

            .barcode-frame {

                position: absolute;

                z-index: 30;

                left: 8%;

                right: 8%;

                top: 30%;

                height: 40%;

                pointer-events: none;

            }


            /* =============================================
               CORNER
            ============================================= */

            .barcode-corner {

                position: absolute;

                width: 34px;

                height: 34px;

                border-color: #00e676;

                border-style: solid;

                filter:
                    drop-shadow(
                        0 0 5px
                        rgba(0,230,118,.8)
                    );

            }


            .barcode-corner.tl {

                top: 0;
                left: 0;

                border-width:
                    4px 0 0 4px;

                border-radius:
                    8px 0 0 0;

            }


            .barcode-corner.tr {

                top: 0;
                right: 0;

                border-width:
                    4px 4px 0 0;

                border-radius:
                    0 8px 0 0;

            }


            .barcode-corner.bl {

                bottom: 0;
                left: 0;

                border-width:
                    0 0 4px 4px;

                border-radius:
                    0 0 0 8px;

            }


            .barcode-corner.br {

                bottom: 0;
                right: 0;

                border-width:
                    0 4px 4px 0;

                border-radius:
                    0 0 8px 0;

            }


            /* =============================================
               LASER SCANNER
            ============================================= */

            .barcode-laser {

                position: absolute;

                left: 3%;

                right: 3%;

                top: 0;

                height: 3px;

                z-index: 40;

                border-radius: 3px;

                background:

                    linear-gradient(
                        90deg,
                        transparent,
                        #00e676,
                        #ffffff,
                        #00e676,
                        transparent
                    );

                box-shadow:

                    0 0 6px #00e676,

                    0 0 14px
                    rgba(0,230,118,.8),

                    0 0 24px
                    rgba(0,230,118,.45);

                animation:

                    barcodeLaserMove
                    1.8s
                    ease-in-out
                    infinite alternate;

            }


            @keyframes barcodeLaserMove {

                0% {

                    top: 0;

                    opacity: .7;

                }

                100% {

                    top: calc(100% - 3px);

                    opacity: 1;

                }

            }


            /* =============================================
               STATUS
            ============================================= */

            .barcode-status {

                text-align: center;

                font-size: 14px;

                font-weight: 600;

                color: #075c3b;

                margin-top: 10px;

            }


            /* =============================================
               HELP
            ============================================= */

            .barcode-help {

                text-align: center;

                font-size: 12px;

                line-height: 1.5;

                color: #6d7b74;

                padding:

                    4px 14px 8px;

            }

        </style>


        <div class="modal-head">

            <h3>
                Scan Barcode
            </h3>


            <button
                class="close"
                id="closeCameraBtn"
                type="button"
                aria-label="Tutup"
            >
                ×
            </button>

        </div>


        <div
            class="barcode-camera-wrapper"
        >

            <div
                id="quaggaCamera"
                class="barcode-camera"
            >

                <div
                    class="barcode-overlay"
                ></div>


                <div
                    class="barcode-frame"
                >

                    <div
                        class="barcode-corner tl"
                    ></div>

                    <div
                        class="barcode-corner tr"
                    ></div>

                    <div
                        class="barcode-corner bl"
                    ></div>

                    <div
                        class="barcode-corner br"
                    ></div>


                    <div
                        class="barcode-laser"
                    ></div>

                </div>

            </div>


            <div
                id="cameraStatus"
                class="barcode-status"
            >
                Mengaktifkan kamera...
            </div>


            <div
                class="barcode-help"
            >

                Arahkan barcode UPC
                secara horizontal
                ke dalam bingkai.

                <br>

                Pastikan barcode terlihat jelas
                dan tidak terlalu dekat.

            </div>

        </div>

    `;

    modal.classList.remove("hidden");

    /* -----------------------------------------------------
       CLOSE BUTTON
    ----------------------------------------------------- */

    const closeButton = $("closeCameraBtn");

    if (closeButton) {
        closeButton.addEventListener("click", () => {
            closeModal();
        });
    }

    const container = $("quaggaCamera");

    const status = $("cameraStatus");

    if (!container) {
        toast("Area kamera tidak ditemukan.", true);

        return;
    }

    let detected = false;

    state.cameraRunning = true;

    /* =====================================================
       CARI KAMERA
    ===================================================== */

    let devices = [];

    try {
        devices = await window.Quagga.CameraAccess.enumerateVideoDevices();
    } catch (e) {
        console.warn("Tidak dapat membaca daftar kamera:", e);
    }

    console.log("Camera devices:", devices);

    let selectedDeviceId = null;

    if (Array.isArray(devices) && devices.length > 0) {
        /*
         * Prioritaskan webcam internal.
         */

        const preferred = devices.find((device) => {
            const label = String(device.label || "").toLowerCase();

            return label.includes("webcam") || label.includes("integrated") || label.includes("camera");
        });

        selectedDeviceId = preferred ? preferred.deviceId : devices[0].deviceId;
    }

    console.log("Camera terpilih:", selectedDeviceId);

    /* =====================================================
       QUAGGA CONFIGURATION
    ===================================================== */

    const config = {
        inputStream: {
            name: "Live",

            type: "LiveStream",

            target: container,

            constraints: {
                /*
                 * Resolusi kamera.
                 */

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
                top: "5%",

                right: "5%",

                left: "5%",

                bottom: "5%",
            },
        },

        locate: true,

        locator: {
            /*
             * Medium biasanya lebih
             * stabil untuk webcam laptop.
             */

            patchSize: "medium",

            halfSample: false,
        },

        frequency: 10,

        decoder: {
            readers: [
                /*
                 * PRIORITAS UPC
                 */

                "upc_reader",

                "upc_e_reader",

                "ean_reader",

                "ean_8_reader",
            ],

            multiple: false,
        },
    };

    /*
     * Jika device berhasil ditemukan,
     * gunakan deviceId.
     */

    if (selectedDeviceId) {
        config.inputStream.constraints.deviceId = selectedDeviceId;
    }

    console.log("Quagga config:", config);

    /* =====================================================
       BARCODE DETECTED
    ===================================================== */

    const handleDetected = async function (result) {
        if (!state.cameraRunning) {
            return;
        }

        if (detected) {
            return;
        }

        if (!result || !result.codeResult) {
            return;
        }

        let code = result.codeResult.code;

        if (!code) {
            return;
        }

        code = String(code).trim();

        /*
         * UPC/EAN harus angka.
         */

        if (!/^\d+$/.test(code)) {
            return;
        }

        /*
         * Panjang barcode yang
         * kita dukung.
         */

        if (code.length !== 12 && code.length !== 6 && code.length !== 8 && code.length !== 13) {
            return;
        }

        /*
         * BERHASIL
         */

        detected = true;

        console.log("================================");

        console.log("BARCODE TERDETEKSI:");

        console.log(code);

        console.log("FORMAT:");

        console.log(result.codeResult.format);

        console.log("================================");

        if (status) {
            status.textContent = "✓ Barcode terdeteksi: " + code;
        }

        state.cameraRunning = false;

        /*
         * Hentikan kamera.
         */

        await stopCamera();

        /*
         * Tutup modal.
         */

        closeModal(false);

        /*
         * Kirim ke backend.
         */

        await doScan(code);
    };

    /* =====================================================
       START QUAGGA
    ===================================================== */

    console.log("Memulai Quagga...");

    try {
        window.Quagga.init(config, function (error) {
            if (error) {
                console.error("Quagga init error:", error);

                state.cameraRunning = false;

                toast("Kamera gagal dijalankan: " + (error?.message || error), true);

                return;
            }

            console.log("Quagga berhasil diinisialisasi.");

            /*
             * Pasang event deteksi.
             */

            window.Quagga.onDetected(handleDetected);

            /*
             * Jalankan kamera.
             */

            window.Quagga.start();

            /*
             * Rapikan tampilan setelah
             * video dibuat Quagga.
             */

            setTimeout(fixCameraDisplay, 300);

            setTimeout(fixCameraDisplay, 1000);

            if (status) {
                status.textContent = "Kamera aktif · Arahkan barcode ke bingkai";
            }

            console.log("Quagga scanner aktif.");

            console.log("Menunggu barcode UPC...");
        });
    } catch (error) {
        console.error("Quagga exception:", error);

        state.cameraRunning = false;

        await stopCamera();

        toast("Kamera gagal dijalankan: " + (error?.message || error), true);
    }
}

/* =========================================================
   PERBAIKI TAMPILAN VIDEO
========================================================= */

function fixCameraDisplay() {
    const container = $("quaggaCamera");

    if (!container) {
        return;
    }

    /* -----------------------------------------------------
       VIDEO
    ----------------------------------------------------- */

    const videos = container.querySelectorAll("video");

    videos.forEach((video) => {
        video.style.position = "absolute";

        video.style.top = "0";

        video.style.left = "0";

        video.style.width = "100%";

        video.style.height = "100%";

        /*
         * contain = seluruh gambar
         * kamera terlihat.
         */

        video.style.objectFit = "contain";

        video.style.display = "block";

        video.style.background = "#000";

        video.setAttribute("playsinline", "true");
    });

    /* -----------------------------------------------------
       CANVAS
    ----------------------------------------------------- */

    const canvases = container.querySelectorAll("canvas");

    canvases.forEach((canvas) => {
        canvas.style.position = "absolute";

        canvas.style.top = "0";

        canvas.style.left = "0";

        canvas.style.width = "100%";

        canvas.style.height = "100%";

        canvas.style.pointerEvents = "none";
    });
}

/* =========================================================
   STOP CAMERA
========================================================= */

export async function stopCamera() {
    state.cameraRunning = false;

    /* -----------------------------------------------------
       QUAGGA STOP
    ----------------------------------------------------- */

    try {
        if (typeof window.Quagga !== "undefined") {
            try {
                window.Quagga.offDetected();
            } catch (e) {
                // Abaikan.
            }

            try {
                window.Quagga.stop();
            } catch (e) {
                console.warn("Quagga stop:", e);
            }
        }
    } catch (e) {
        console.warn("Gagal menghentikan Quagga:", e);
    }

    /* -----------------------------------------------------
       STOP VIDEO TRACKS
    ----------------------------------------------------- */

    const container = $("quaggaCamera");

    if (container) {
        const videos = container.querySelectorAll("video");

        videos.forEach((video) => {
            try {
                const stream = video.srcObject;

                if (stream) {
                    stream.getTracks().forEach((track) => {
                        track.stop();
                    });
                }

                video.srcObject = null;
            } catch (e) {
                // Abaikan.
            }
        });
    }
}

/* =========================================================
   CLOSE MODAL
========================================================= */

export function closeModal(returnFocus = true) {
    stopCamera();

    const modal = $("modal");

    const modalContent = $("modalContent");

    if (modal) {
        modal.classList.add("hidden");
    }

    if (modalContent) {
        modalContent.innerHTML = "";
    }

    if (returnFocus) {
        focusScan();
    }
}

/* =========================================================
   BIND SCANNER
========================================================= */

export function bindScanner() {
    /* -----------------------------------------------------
       USB / BLUETOOTH SCANNER
    ----------------------------------------------------- */

    const scanInput = $("scanInput");

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

        /*
         * Kembalikan fokus ke input
         * setelah blur.
         */

        scanInput.addEventListener("blur", () => {
            const modal = $("modal");

            /*
             * Jangan ambil fokus
             * ketika kamera terbuka.
             */

            if (modal && !modal.classList.contains("hidden")) {
                return;
            }

            setTimeout(focusScan, 200);
        });
    }

    /* -----------------------------------------------------
       BUTTON CAMERA
    ----------------------------------------------------- */

    const cameraBtn = $("cameraBtn");

    if (cameraBtn) {
        cameraBtn.addEventListener("click", () => {
            openCamera();
        });
    }

    /* -----------------------------------------------------
       BUTTON SCANNER
    ----------------------------------------------------- */

    const manualFocusBtn = $("manualFocusBtn");

    if (manualFocusBtn) {
        manualFocusBtn.addEventListener("click", () => {
            focusScan();
        });
    }

    /* -----------------------------------------------------
       GLOBAL STOP CAMERA
    ----------------------------------------------------- */

    window.addEventListener("scanner:stop", () => {
        stopCamera();
    });

    /* -----------------------------------------------------
       ESC = CLOSE CAMERA
    ----------------------------------------------------- */

    window.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") {
            return;
        }

        const modal = $("modal");

        if (modal && !modal.classList.contains("hidden")) {
            closeModal();
        }
    });

    /*
     * Fokus awal ke input scanner.
     */

    focusScan();
}
