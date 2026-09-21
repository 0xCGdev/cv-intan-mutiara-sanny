import { $, state, busy, toast } from "./state.js";
import { api } from "./api.js";

let shipments = [];
let archiveMode = false;
let shipmentItems = [];
let editingShipmentId = "";

function esc(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getShipmentId(row) {
    return String(row?.shipmentId || row?.SHIPMENT_ID || "").trim();
}

function getStatus(row) {
    return String(row?.status || row?.STATUS || "").trim();
}

function getDate(row) {
    return String(row?.date || row?.TANGGAL || "").trim();
}

function getStatusLabel(status) {
    const value = String(status || "").toUpperCase();

    if (value === "PACKING" || value === "READY LOADING" || value === "LOADING") {
        return "Ongoing";
    }

    if (value === "SELESAI") {
        return "Completed";
    }

    return status || "Pending";
}

function getStatusClass(status) {
    const value = String(status || "").toUpperCase();

    if (value === "SELESAI") {
        return "shipment-status-completed";
    }

    if (value === "PACKING" || value === "READY LOADING" || value === "LOADING") {
        return "shipment-status-ongoing";
    }

    return "shipment-status-pending";
}

function isAdmin() {
    return String(state.me?.role || "").toUpperCase() === "ADMIN";
}

/**
 * Jumlah Packing:
 * Qty 100 / Case Pack 2 = 50
 *
 * Jika tidak habis dibagi:
 * Qty 101 / Case Pack 2 = 51
 */
function calculatePackingQty(qty, casePack) {
    const qtyNumber = Number(qty);
    const casePackNumber = Number(casePack);

    if (!Number.isFinite(qtyNumber) || !Number.isFinite(casePackNumber) || qtyNumber <= 0 || casePackNumber <= 0) {
        return 0;
    }

    return Math.ceil(qtyNumber / casePackNumber);
}

function normalizeShipmentItem(item) {
    const qtyTarget = Number(item?.qtyTarget) || 0;
    const casePack = Number(item?.casePack) || 0;

    return {
        sku: String(item?.sku || ""),
        upc: String(item?.upc || ""),
        name: String(item?.name || ""),
        qtyTarget,
        casePack,
        packingQty: Number(item?.packingQty) || calculatePackingQty(qtyTarget, casePack),
        packingMethod: String(item?.packingMethod || ""),
        minimized: false,
    };
}

export async function loadShipment() {
    await loadShipments();
}

async function loadShipments() {
    try {
        busy(true);

        const result = await api("getShipments");

        if (!result?.success) {
            throw new Error(result?.message || "Gagal mengambil data Shipment.");
        }

        shipments = result?.rows || result?.data?.rows || [];

        renderShipments();
    } catch (error) {
        console.error(error);

        toast(error?.message || "Gagal memuat Shipment.", "error");

        renderShipmentError(error?.message || "Gagal memuat Shipment.");
    } finally {
        busy(false);
    }
}

function renderShipments() {
    const box = $("shipmentRows");

    if (!box) {
        return;
    }

    const search = String($("shipmentSearch")?.value || "")
        .trim()
        .toLowerCase();

    let rows = Array.isArray(shipments) ? [...shipments] : [];

    rows = rows.filter((shipment) => {
        const status = String(getStatus(shipment)).toUpperCase();

        if (archiveMode) {
            return status === "SELESAI";
        }

        return status !== "SELESAI";
    });

    if (search) {
        rows = rows.filter((shipment) => getShipmentId(shipment).toLowerCase().includes(search));
    }

    rows.sort((a, b) => String(getDate(b)).localeCompare(String(getDate(a))));

    if (!rows.length) {
        box.innerHTML = `
            <div class="shipment-empty">

                <div class="shipment-empty-title">
                    ${archiveMode ? "Belum ada shipment di arsip." : "Belum ada shipment aktif."}
                </div>

                <div class="shipment-empty-text">
                    ${archiveMode ? "Shipment yang sudah selesai akan muncul di sini." : "Klik + Tambah Shipment untuk membuat shipment baru."}
                </div>

            </div>
        `;

        return;
    }

    box.innerHTML = rows
        .map((shipment) => {
            const id = getShipmentId(shipment);
            const status = getStatus(shipment);
            const label = getStatusLabel(status);
            const statusClass = getStatusClass(status);

            return `
                <div class="shipment-card">

                    <div class="shipment-card-main">

                        <div class="shipment-card-title">
                            ${esc(id)}
                        </div>

                        <div class="shipment-card-meta">
                            ${esc(getDate(shipment))}
                        </div>

                    </div>

                    <div class="shipment-card-side">

                        <span
                            class="shipment-status ${statusClass}">
                            ${esc(label)}
                        </span>

                        <button
                            class="btn btn-soft shipment-detail-btn"
                            type="button"
                            data-shipment-detail="${esc(id)}">
                            Lihat Detail
                        </button>

                    </div>

                </div>
            `;
        })
        .join("");

    box.querySelectorAll("[data-shipment-detail]").forEach((button) => {
        button.addEventListener("click", () => {
            openShipmentDetail(button.dataset.shipmentDetail);
        });
    });
}

function renderShipmentError(message) {
    const box = $("shipmentRows");

    if (!box) {
        return;
    }

    box.innerHTML = `
        <div class="shipment-empty">

            <div class="shipment-empty-title">
                Gagal memuat Shipment
            </div>

            <div class="shipment-empty-text">
                ${esc(message)}
            </div>

        </div>
    `;
}

function getTodayInputValue() {
    const now = new Date();

    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

function openShipmentForm() {
    editingShipmentId = "";
    shipmentItems = [];

    createShipmentFormModal(null);
}

function createShipmentFormModal(shipment) {
    $("shipmentModal")?.remove();

    const isEdit = !!shipment;

    const modal = document.createElement("div");

    modal.id = "shipmentModal";

    modal.className = "shipment-modal";

    modal.innerHTML = `
        <div
            class="shipment-modal-backdrop"
            data-shipment-close>
        </div>

        <div
            class="shipment-modal-dialog">

            <div
                class="shipment-modal-header">

                <div>

                    <h3>
                        ${isEdit ? "Edit Shipment" : "Tambah Shipment"}
                    </h3>

                    <p>
                        ${isEdit ? "Perbarui data DPV dan detail barang." : "Masukkan data DPV dan target barang."}
                    </p>

                </div>

                <button
                    type="button"
                    class="shipment-modal-close"
                    data-shipment-close
                    aria-label="Tutup">
                    ×
                </button>

            </div>

            <div
                class="shipment-modal-body">

                <div
                    class="shipment-form-grid">

                    <div
                        class="shipment-field">

                        <label>
                            No. Shipment / DPV
                        </label>

                        <input
                            id="shipmentFormId"
                            class="input"
                            type="text"
                            value="${esc(shipment ? shipment.shipmentId : "")}"
                            placeholder="Contoh: DPV-607"
                            autocomplete="off"
                            ${isEdit ? "readonly" : ""}>

                    </div>

                    <div
                        class="shipment-field">

                        <label>
                            Tanggal
                        </label>

                        <input
                            id="shipmentFormDate"
                            class="input"
                            type="date">

                    </div>

                </div>

                <div
                    class="shipment-items-section">

                    <div
                        class="shipment-items-header">

                        <div>

                            <h4>
                                Daftar Barang
                            </h4>

                            <p>
                                SKU akan mengisi UPC dan Nama Barang otomatis.
                            </p>

                        </div>

                    </div>

                    <div
                        id="shipmentFormItems"
                        class="shipment-form-items">
                    </div>

                </div>

            </div>

            <div
                class="shipment-modal-footer">

                <button
                    class="btn btn-soft"
                    type="button"
                    data-shipment-close>
                    Batal
                </button>

                <button
                    id="shipmentSaveBtn"
                    class="btn btn-primary"
                    type="button">

                    ${isEdit ? "Simpan Perubahan" : "Simpan Shipment"}

                </button>

            </div>

        </div>
    `;

    document.body.appendChild(modal);

    const dateInput = $("shipmentFormDate");

    if (dateInput) {
        if (shipment?.date) {
            const parts = String(shipment.date).split("-");

            if (parts.length === 3) {
                dateInput.value = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        } else {
            dateInput.value = getTodayInputValue();
        }
    }

    modal.querySelectorAll("[data-shipment-close]").forEach((element) => {
        element.addEventListener("click", closeShipmentForm);
    });

    $("shipmentSaveBtn")?.addEventListener("click", saveShipment);

    if (shipment) {
        shipmentItems = Array.isArray(shipment.items) ? shipment.items.map((item) => normalizeShipmentItem(item)) : [];

        if (!shipmentItems.length) {
            addShipmentItem();
        } else {
            shipmentItems.forEach((item, index) => {
                item.minimized = index !== shipmentItems.length - 1;
            });

            renderShipmentFormItems();
        }
    } else {
        addShipmentItem();
    }

    if (isEdit) {
        modal.querySelector("#shipmentFormPO")?.focus();
    } else {
        modal.querySelector("#shipmentFormId")?.focus();
    }
}

function closeShipmentForm() {
    $("shipmentModal")?.remove();
    $("shipmentDeleteItemModal")?.remove();
    $("shipmentDeleteConfirmModal")?.remove();

    shipmentItems = [];
    editingShipmentId = "";
}

function createShipmentItemData() {
    return {
        sku: "",
        upc: "",
        name: "",
        qtyTarget: "",
        casePack: "",
        packingQty: 0,
        packingMethod: "",
        minimized: false,
    };
}

function addShipmentItem() {
    const container = $("shipmentFormItems");

    if (!container) {
        return;
    }

    shipmentItems.push(createShipmentItemData());

    setOnlyItemEditable(shipmentItems.length - 1);
}

function setOnlyItemEditable(index) {
    shipmentItems.forEach((item, itemIndex) => {
        item.minimized = itemIndex !== index;
    });

    renderShipmentFormItems();

    const rows = document.querySelectorAll("#shipmentFormItems .shipment-form-item");

    rows[index]?.querySelector(".shipment-sku-input")?.focus();
}

function finishCurrentItem(index) {
    if (!shipmentItems[index]) {
        return;
    }

    if (index === shipmentItems.length - 1) {
        addShipmentItem();

        return;
    }

    setOnlyItemEditable(index + 1);
}

function editShipmentItem(index) {
    if (!shipmentItems[index]) {
        return;
    }

    setOnlyItemEditable(index);
}

function removeShipmentItem(index) {
    if (!shipmentItems[index]) {
        return;
    }

    const item = shipmentItems[index];

    openDeleteItemModal(index, item);
}

function openDeleteItemModal(index, item) {
    $("shipmentDeleteItemModal")?.remove();

    const modal = document.createElement("div");

    modal.id = "shipmentDeleteItemModal";

    modal.className = "shipment-modal shipment-delete-item-modal";

    modal.innerHTML = `
        <div
            class="shipment-modal-backdrop"
            data-delete-item-close>
        </div>

        <div
            class="shipment-modal-dialog shipment-confirm-dialog">

            <div
                class="shipment-modal-header">

                <div>

                    <h3>
                        Hapus Barang?
                    </h3>

                    <p>
                        Barang ini akan dihapus dari Shipment.
                    </p>

                </div>

                <button
                    type="button"
                    class="shipment-modal-close"
                    data-delete-item-close
                    aria-label="Tutup">
                    ×
                </button>

            </div>

            <div
                class="shipment-confirm-content">

                <div
                    class="shipment-confirm-item">

                    <div>

                        <span>
                            SKU
                        </span>

                        <strong>
                            ${esc(item.sku || "-")}
                        </strong>

                    </div>

                    <div>

                        <span>
                            Nama Barang
                        </span>

                        <strong>
                            ${esc(item.name || "-")}
                        </strong>

                    </div>

                </div>

                <p
                    class="shipment-confirm-warning">
                    Apakah kamu yakin ingin menghapus barang ini?
                </p>

            </div>

            <div
                class="shipment-modal-footer">

                <button
                    class="btn btn-soft"
                    type="button"
                    data-delete-item-close>
                    Batal
                </button>

                <button
                    id="confirmDeleteShipmentItemBtn"
                    class="btn btn-danger"
                    type="button">
                    Hapus
                </button>

            </div>

        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll("[data-delete-item-close]").forEach((element) => {
        element.addEventListener("click", () => modal.remove());
    });

    $("confirmDeleteShipmentItemBtn")?.addEventListener("click", () => {
        modal.remove();

        shipmentItems.splice(index, 1);

        if (!shipmentItems.length) {
            addShipmentItem();

            return;
        }

        const nextIndex = Math.min(index, shipmentItems.length - 1);

        setOnlyItemEditable(nextIndex);
    });
}

function renderShipmentFormItems() {
    const container = $("shipmentFormItems");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    shipmentItems.forEach((item, index) => {
        addShipmentItemFromData(item, index);
    });
}

function addShipmentItemFromData(item, index) {
    const container = $("shipmentFormItems");

    if (!container) {
        return;
    }

    const row = document.createElement("div");

    row.className = "shipment-form-item" + (item.minimized ? " shipment-form-item-minimized" : "");

    row.dataset.index = String(index);

    const calculatedPacking = calculatePackingQty(item.qtyTarget, item.casePack);

    item.packingQty = calculatedPacking;

    row.innerHTML = `
        <div
            class="shipment-item-top">

            <div
                class="shipment-item-number">
                Barang ${index + 1}
            </div>

            <div
                class="shipment-item-actions">

                ${
                    item.minimized
                        ? `
                            <button
                                type="button"
                                class="shipment-item-edit"
                                data-edit-item="${index}"
                                aria-label="Edit barang"
                                title="Edit barang">

                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    aria-hidden="true">

                                    <path
                                        d="M12 20h9"
                                        stroke="currentColor"
                                        stroke-linecap="round"
                                        stroke-linejoin="round">
                                    </path>

                                    <path
                                        d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z"
                                        stroke="currentColor"
                                        stroke-linecap="round"
                                        stroke-linejoin="round">
                                    </path>

                                </svg>

                            </button>
                        `
                        : ""
                }

                <button
                    type="button"
                    class="shipment-item-remove"
                    data-remove-item="${index}"
                    aria-label="Hapus barang"
                    title="Hapus barang">
                    ×
                </button>

            </div>

        </div>

        ${
            item.minimized
                ? `
                    <div
                        class="shipment-item-minimized-content">

                        <div>

                            <strong>
                                ${esc(item.sku || "-")}
                            </strong>

                            <span>
                                ${esc(item.name || "-")}
                            </span>

                        </div>

                    </div>
                `
                : `
                    <div
                        class="shipment-item-grid">

                        <div
                            class="shipment-field">

                            <label>
                                SKU / Item No
                            </label>

                            <input
                                class="input shipment-sku-input"
                                type="text"
                                data-field="sku"
                                value="${esc(item.sku)}"
                                placeholder="Masukkan SKU"
                                autocomplete="off">

                        </div>

                        <div
                            class="shipment-field">

                            <label>
                                UPC
                            </label>

                            <input
                                class="input shipment-upc-input"
                                type="text"
                                data-field="upc"
                                value="${esc(item.upc)}"
                                readonly>

                        </div>

                        <div
                            class="shipment-field shipment-field-wide">

                            <label>
                                Nama Barang
                            </label>

                            <input
                                class="input shipment-name-input"
                                type="text"
                                data-field="name"
                                value="${esc(item.name)}"
                                readonly>

                        </div>

                        <div
                            class="shipment-field">

                            <label>
                                Qty
                            </label>

                            <input
                                class="input shipment-qty-input"
                                type="number"
                                min="1"
                                step="1"
                                data-field="qtyTarget"
                                value="${esc(item.qtyTarget)}"
                                placeholder="0">

                        </div>

                        <div
                            class="shipment-field">

                            <label>
                                Case Pack
                            </label>

                            <input
                                class="input shipment-casepack-input"
                                type="number"
                                min="0"
                                step="1"
                                data-field="casePack"
                                value="${esc(item.casePack)}"
                                placeholder="0">

                        </div>

                        <div
                            class="shipment-field">

                            <label>
                                Jumlah Packing
                            </label>

                            <input
                                class="input shipment-packingqty-input"
                                type="number"
                                value="${esc(calculatedPacking || "")}"
                                readonly
                                tabindex="-1">

                        </div>

                        <div
                            class="shipment-field">

                            <label>
                                Cara Packing
                            </label>

                            <select
                                class="input shipment-packing-select"
                                data-field="packingMethod">

                                <option
                                    value=""
                                    ${!item.packingMethod ? "selected" : ""}>
                                    Pilih cara packing
                                </option>

                                <option
                                    value="CRATE"
                                    ${String(item.packingMethod).toUpperCase() === "CRATE" ? "selected" : ""}>
                                    Crate
                                </option>

                                <option
                                    value="BOX"
                                    ${String(item.packingMethod).toUpperCase() === "BOX" ? "selected" : ""}>
                                    Box
                                </option>

                                <option
                                    value="FILLER"
                                    ${String(item.packingMethod).toUpperCase() === "FILLER" ? "selected" : ""}>
                                    Filler
                                </option>

                            </select>

                        </div>

                        <div
                            class="shipment-add-item-wrap">

                            <button
                                type="button"
                                class="btn btn-primary shipment-add-item-card-btn"
                                data-add-item="${index}">
                                + Tambah Barang
                            </button>

                        </div>

                    </div>
                `
        }
    `;

    container.appendChild(row);

    const skuInput = row.querySelector(".shipment-sku-input");

    if (!item.minimized) {
        skuInput?.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") {
                return;
            }

            event.preventDefault();

            lookupShipmentSKU(index);
        });

        skuInput?.addEventListener("blur", () => {
            const sku = String(skuInput.value || "").trim();

            if (sku) {
                lookupShipmentSKU(index);
            }
        });
    }

    row.querySelector("[data-remove-item]")?.addEventListener("click", (event) => {
        event.stopPropagation();

        removeShipmentItem(index);
    });

    row.querySelector("[data-edit-item]")?.addEventListener("click", (event) => {
        event.stopPropagation();

        editShipmentItem(index);
    });

    row.querySelector("[data-add-item]")?.addEventListener("click", (event) => {
        event.stopPropagation();

        finishCurrentItem(index);
    });

    row.querySelectorAll("[data-field]").forEach((input) => {
        input.addEventListener("input", () => {
            updateShipmentItemField(index, input.dataset.field, input.value);

            updatePackingQtyDisplay(row, index);
        });

        input.addEventListener("change", () => {
            updateShipmentItemField(index, input.dataset.field, input.value);

            updatePackingQtyDisplay(row, index);
        });
    });
}

function updatePackingQtyDisplay(row, index) {
    if (!shipmentItems[index]) {
        return;
    }

    const qty = Number(shipmentItems[index].qtyTarget) || 0;

    const casePack = Number(shipmentItems[index].casePack) || 0;

    const packingQty = calculatePackingQty(qty, casePack);

    shipmentItems[index].packingQty = packingQty;

    const input = row.querySelector(".shipment-packingqty-input");

    if (input) {
        input.value = packingQty || "";
    }
}

function updateShipmentItemField(index, field, value) {
    if (!shipmentItems[index]) {
        return;
    }

    shipmentItems[index][field] = value;

    if (field === "qtyTarget" || field === "casePack") {
        shipmentItems[index].packingQty = calculatePackingQty(shipmentItems[index].qtyTarget, shipmentItems[index].casePack);
    }
}

async function lookupShipmentSKU(index) {
    const row = document.querySelector(`#shipmentFormItems .shipment-form-item:nth-child(${index + 1})`);

    if (!row) {
        return;
    }

    const skuInput = row.querySelector(".shipment-sku-input");

    const upcInput = row.querySelector(".shipment-upc-input");

    const nameInput = row.querySelector(".shipment-name-input");

    const sku = String(skuInput?.value || "").trim();

    if (!sku) {
        shipmentItems[index].sku = "";
        shipmentItems[index].upc = "";
        shipmentItems[index].name = "";

        if (upcInput) {
            upcInput.value = "";
        }

        if (nameInput) {
            nameInput.value = "";
        }

        return;
    }

    try {
        skuInput.disabled = true;

        const result = await api("lookupSKU", { sku });

        if (!result?.success) {
            throw new Error(result?.message || "SKU tidak ditemukan.");
        }

        const item = result?.item || result?.data?.item;

        if (!item) {
            throw new Error("Data SKU tidak valid.");
        }

        shipmentItems[index].sku = String(item.sku || sku);

        shipmentItems[index].upc = String(item.upc || "");

        shipmentItems[index].name = String(item.name || "");

        if (upcInput) {
            upcInput.value = shipmentItems[index].upc;
        }

        if (nameInput) {
            nameInput.value = shipmentItems[index].name;
        }
    } catch (error) {
        console.error(error);

        if (upcInput) {
            upcInput.value = "";
        }

        if (nameInput) {
            nameInput.value = "";
        }

        shipmentItems[index].upc = "";
        shipmentItems[index].name = "";

        toast(error?.message || "SKU tidak ditemukan di Master Data.", "error");
    } finally {
        skuInput.disabled = false;
    }
}

async function saveShipment() {
    const modal = document.getElementById("shipmentModal");

    const shipmentIdInput = modal?.querySelector("#shipmentFormId");

    const dateInput = modal?.querySelector("#shipmentFormDate");

    const poInput = modal?.querySelector("#shipmentFormPO");

    const shipmentId = String(shipmentIdInput?.value || "").trim();

    const date = String(dateInput?.value || "").trim();

    const poTitle = String(poInput?.value || "").trim();

    console.log("SHIPMENT DEBUG:", {
        modal,
        shipmentIdInput,
        shipmentId,
        date,
        poTitle,
    });

    if (!shipmentId) {
        toast("No. Shipment wajib diisi.", "error");

        shipmentIdInput?.focus();

        return;
    }

    if (!date) {
        toast("Tanggal Shipment wajib diisi.", "error");

        $("shipmentFormDate")?.focus();

        return;
    }

    if (!shipmentItems.length) {
        toast("Minimal satu barang harus ditambahkan.", "error");

        return;
    }

    const items = [];

    for (let i = 0; i < shipmentItems.length; i++) {
        const item = shipmentItems[i];

        const sku = String(item.sku || "").trim();

        const upc = String(item.upc || "").trim();

        const name = String(item.name || "").trim();

        const qtyTarget = Number(item.qtyTarget);

        const casePack = Number(item.casePack);

        if (!sku) {
            toast(`SKU pada Barang ${i + 1} wajib diisi.`, "error");

            return;
        }

        if (!upc) {
            toast(`UPC pada SKU ${sku} wajib diisi.`, "error");

            return;
        }

        if (!name) {
            toast(`Nama Barang pada SKU ${sku} wajib diisi.`, "error");

            return;
        }

        if (!Number.isInteger(qtyTarget) || qtyTarget <= 0) {
            toast(`Qty pada SKU ${sku} harus lebih dari 0.`, "error");

            return;
        }

        if (!Number.isInteger(casePack) || casePack <= 0) {
            toast(`Case Pack pada SKU ${sku} harus lebih dari 0.`, "error");

            return;
        }

        const packingQty = calculatePackingQty(qtyTarget, casePack);

        items.push({
            sku,
            upc,
            name,
            qtyTarget,
            casePack,
            packingQty,
            packingMethod: String(item.packingMethod || "").trim(),
        });
    }

    const duplicateSKU = new Set(items.map((item) => item.sku.toLowerCase()));

    if (duplicateSKU.size !== items.length) {
        toast("SKU yang sama tidak boleh dimasukkan dua kali.", "error");

        return;
    }

    try {
        busy(true);

        const payload = {
            shipmentId,
            date,
            poTitle,
            items,
        };

        const result = editingShipmentId ? await api("updateShipment", payload) : await api("createShipment", payload);

        if (!result?.success) {
            throw new Error(result?.message || (editingShipmentId ? "Gagal memperbarui Shipment." : "Gagal membuat Shipment."));
        }

        const wasEditing = !!editingShipmentId;

        closeShipmentForm();

        await loadShipments();

        toast(wasEditing ? "Shipment berhasil diperbarui." : "Shipment berhasil dibuat.");
    } catch (error) {
        console.error(error);

        toast(error?.message || "Gagal menyimpan Shipment.", "error");
    } finally {
        busy(false);
    }
}

async function openShipmentDetail(shipmentId) {
    try {
        busy(true);

        const result = await api("getShipment", {
            shipmentId,
        });

        if (!result?.success) {
            throw new Error(result?.message || "Gagal mengambil detail Shipment.");
        }

        const shipment = result?.shipment || result?.data?.shipment;

        if (!shipment) {
            throw new Error("Data Shipment tidak valid.");
        }

        renderShipmentDetail(shipment);
    } catch (error) {
        console.error(error);

        toast(error?.message || "Gagal membuka detail Shipment.", "error");
    } finally {
        busy(false);
    }
}

function createEditIcon() {
    return `
        <button
            type="button"
            class="shipment-detail-edit-icon"
            aria-label="Edit"
            title="Edit">

            <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true">

                <path
                    d="M12 20h9"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round">
                </path>

                <path
                    d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round">
                </path>

            </svg>

        </button>
    `;
}

function createSaveIcon() {
    return `
        <button
            type="button"
            class="shipment-detail-save-icon"
            aria-label="Simpan"
            title="Simpan">

            <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true">

                <path
                    d="M5 12.5 9.5 17 19 7.5"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round">
                </path>

            </svg>

        </button>
    `;
}

function createCancelIcon() {
    return `
        <button
            type="button"
            class="shipment-detail-cancel-icon"
            aria-label="Batal"
            title="Batal">

            <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true">

                <path
                    d="M7 7l10 10M17 7 7 17"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round">
                </path>

            </svg>

        </button>
    `;
}

function getDetailFieldValue(item, field) {
    if (field === "qtyTarget") {
        return Number(item.qtyTarget) || 0;
    }

    if (field === "casePack") {
        return Number(item.casePack) || 0;
    }

    if (field === "packingQty") {
        return Number(item.packingQty) || calculatePackingQty(item.qtyTarget, item.casePack);
    }

    return String(item[field] ?? "");
}

function renderDetailValue(item, itemIndex, field, value, canEdit) {
    if (!canEdit) {
        return `
            <div class="shipment-detail-value">
                ${esc(value || "-")}
            </div>
        `;
    }

    return `
        <div
            class="shipment-detail-editable"
            data-detail-editable
            data-item-index="${itemIndex}"
            data-field="${field}">

            <div class="shipment-detail-value">
                ${esc(value || "-")}
            </div>

            ${createEditIcon()}

        </div>
    `;
}

function renderShipmentDetail(shipment) {
    $("shipmentDetailModal")?.remove();

    const modal = document.createElement("div");

    modal.id = "shipmentDetailModal";

    modal.className = "shipment-modal";

    const items = Array.isArray(shipment.items) ? shipment.items.map(normalizeShipmentItem) : [];

    const status = String(shipment.status || "").toUpperCase();

    const canManage = isAdmin() && status === "PACKING";

    modal.innerHTML = `
        <div
            class="shipment-modal-backdrop"
            data-shipment-detail-close>
        </div>

        <div
            class="shipment-modal-dialog shipment-detail-dialog">

            <div
                class="shipment-modal-header">

                <div>

                    <h3>
                        ${esc(shipment.shipmentId)}
                    </h3>

                    <p>
                        ${esc(getStatusLabel(shipment.status))}
                        ·
                        ${esc(shipment.date || "")}
                    </p>

                </div>

                <button
                    type="button"
                    class="shipment-modal-close"
                    data-shipment-detail-close
                    aria-label="Tutup">
                    ×
                </button>

            </div>

            <div
                class="shipment-detail-table-wrap">

                <table
                    class="shipment-detail-table">

                    <thead>

                        <tr>
                            <th>SKU</th>
                            <th>UPC</th>
                            <th>Nama Barang</th>
                            <th>Qty</th>
                            <th>Case Pack</th>
                            <th>Jumlah Packing</th>
                            <th>Cara Packing</th>
                        </tr>

                    </thead>

                    <tbody>

                        ${
                            items.length
                                ? items
                                      .map((item, itemIndex) => {
                                          const sku = getDetailFieldValue(item, "sku");

                                          const upc = getDetailFieldValue(item, "upc");

                                          const name = getDetailFieldValue(item, "name");

                                          const qty = getDetailFieldValue(item, "qtyTarget");

                                          const casePack = getDetailFieldValue(item, "casePack");

                                          const packingQty = getDetailFieldValue(item, "packingQty");

                                          const packingMethod = getDetailFieldValue(item, "packingMethod");

                                          return `
                                                <tr>

                                                    <td>
                                                        ${renderDetailValue(item, itemIndex, "sku", sku, canManage)}
                                                    </td>

                                                    <td>
                                                        <div class="shipment-detail-value">
                                                            ${esc(upc || "-")}
                                                        </div>
                                                    </td>

                                                    <td>
                                                        <div class="shipment-detail-value">
                                                            ${esc(name || "-")}
                                                        </div>
                                                    </td>

                                                    <td>
                                                        ${renderDetailValue(item, itemIndex, "qtyTarget", qty, canManage)}
                                                    </td>

                                                    <td>
                                                        ${renderDetailValue(item, itemIndex, "casePack", casePack, canManage)}
                                                    </td>

                                                    <td>
                                                        <div class="shipment-detail-value">
                                                            ${esc(packingQty || "-")}
                                                        </div>
                                                    </td>

                                                    <td>
                                                        ${renderDetailValue(item, itemIndex, "packingMethod", packingMethod, canManage)}
                                                    </td>

                                                </tr>
                                              `;
                                      })
                                      .join("")
                                : `
                                    <tr>
                                        <td colspan="7">
                                            Belum ada barang.
                                        </td>
                                    </tr>
                                `
                        }

                    </tbody>

                </table>

            </div>

            <div
                class="shipment-detail-footer">

                <div
                    class="shipment-detail-actions">

                    ${
                        canManage
                            ? `
                                <button
                                    id="shipmentDeleteDetailBtn"
                                    class="btn btn-soft shipment-delete-btn"
                                    type="button">
                                    Hapus
                                </button>
                            `
                            : ""
                    }

                </div>

            </div>

        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll("[data-shipment-detail-close]").forEach((element) => {
        element.addEventListener("click", () => modal.remove());
    });

    modal.querySelector("#shipmentDeleteDetailBtn")?.addEventListener("click", () => {
        deleteShipment(shipment.shipmentId);
    });

    bindDetailEditActions(modal, shipment, canManage);
}

function bindDetailEditActions(modal, shipment, canManage) {
    if (!canManage) {
        return;
    }

    modal.querySelectorAll("[data-detail-editable]").forEach((area) => {
        const editButton = area.querySelector(".shipment-detail-edit-icon");

        if (!editButton) {
            return;
        }

        editButton.addEventListener("click", (event) => {
            event.stopPropagation();

            const itemIndex = Number(area.dataset.itemIndex);

            const field = area.dataset.field;

            startDetailFieldEdit(modal, shipment, itemIndex, field, area);
        });
    });
}

function startDetailFieldEdit(modal, shipment, itemIndex, field, area) {
    const item = shipment.items?.[itemIndex];

    if (!item) {
        return;
    }

    const oldValue = getDetailFieldValue(item, field);

    if (field === "packingQty") {
        return;
    }

    const inputType = field === "qtyTarget" || field === "casePack" ? "number" : "text";

    let inputHTML = "";

    if (field === "packingMethod") {
        inputHTML = `
            <select
                class="shipment-detail-edit-input"
                data-detail-edit-input>

                <option value="">
                    Pilih cara packing
                </option>

                <option
                    value="CRATE"
                    ${String(oldValue).toUpperCase() === "CRATE" ? "selected" : ""}>
                    Crate
                </option>

                <option
                    value="BOX"
                    ${String(oldValue).toUpperCase() === "BOX" ? "selected" : ""}>
                    Box
                </option>

                <option
                    value="FILLER"
                    ${String(oldValue).toUpperCase() === "FILLER" ? "selected" : ""}>
                    Filler
                </option>

            </select>
        `;
    } else {
        inputHTML = `
            <input
                class="shipment-detail-edit-input"
                type="${inputType}"
                data-detail-edit-input
                value="${esc(oldValue)}"
                ${field === "qtyTarget" ? 'min="1" step="1"' : ""}
                ${field === "casePack" ? 'min="1" step="1"' : ""}>
        `;
    }

    area.innerHTML = `
        <div
            class="shipment-detail-edit-box">

            ${inputHTML}

            <div
                class="shipment-detail-edit-actions">

                ${createSaveIcon()}

                ${createCancelIcon()}

            </div>

        </div>
    `;

    const input = area.querySelector("[data-detail-edit-input]");

    input?.focus();

    if (input?.select && field !== "packingMethod") {
        input.select();
    }

    area.querySelector(".shipment-detail-save-icon")?.addEventListener("click", async (event) => {
        event.stopPropagation();

        const value = input?.value ?? "";

        await saveDetailField(modal, shipment, itemIndex, field, value, oldValue);
    });

    area.querySelector(".shipment-detail-cancel-icon")?.addEventListener("click", (event) => {
        event.stopPropagation();

        restoreDetailField(shipment, itemIndex, field, oldValue, area);
    });

    input?.addEventListener("keydown", async (event) => {
        if (event.key === "Escape") {
            event.preventDefault();

            restoreDetailField(shipment, itemIndex, field, oldValue, area);
        }

        if (event.key === "Enter" && field !== "packingMethod") {
            event.preventDefault();

            const value = input?.value ?? "";

            await saveDetailField(modal, shipment, itemIndex, field, value, oldValue);
        }
    });
}

function restoreDetailField(shipment, itemIndex, field, value, area) {
    if (!shipment.items?.[itemIndex]) {
        return;
    }

    const canEdit = isAdmin() && String(shipment.status || "").toUpperCase() === "PACKING";

    area.innerHTML = `
        <div class="shipment-detail-value">
            ${esc(value || "-")}
        </div>

        ${canEdit ? createEditIcon() : ""}
    `;

    area.querySelector(".shipment-detail-edit-icon")?.addEventListener("click", (event) => {
        event.stopPropagation();

        startDetailFieldEdit($("shipmentDetailModal"), shipment, itemIndex, field, area);
    });
}

async function saveDetailField(modal, shipment, itemIndex, field, value, oldValue) {
    if (!shipment.items?.[itemIndex]) {
        return;
    }

    if (field === "packingQty") {
        return;
    }

    let newValue = String(value ?? "").trim();

    if (field === "qtyTarget" || field === "casePack") {
        const numberValue = Number(newValue);

        if (!Number.isInteger(numberValue)) {
            toast("Nilai harus berupa angka bulat.", "error");

            return;
        }

        if (field === "qtyTarget" && numberValue <= 0) {
            toast("Qty harus lebih dari 0.", "error");

            return;
        }

        if (field === "casePack" && numberValue <= 0) {
            toast("Case Pack harus lebih dari 0.", "error");

            return;
        }

        newValue = numberValue;
    }

    if (String(newValue) === String(oldValue)) {
        restoreDetailField(shipment, itemIndex, field, oldValue, modal.querySelector(`[data-item-index="${itemIndex}"][data-field="${field}"]`));

        return;
    }

    try {
        busy(true);

        const updatedShipment = {
            shipmentId: shipment.shipmentId,

            date: convertDetailDateToInput(shipment.date),

            poTitle: shipment.poTitle || "",

            items: shipment.items.map((item) => {
                const qtyTarget = Number(item.qtyTarget) || 0;

                const casePack = Number(item.casePack) || 0;

                return {
                    sku: String(item.sku || ""),

                    upc: String(item.upc || ""),

                    name: String(item.name || ""),

                    qtyTarget,

                    casePack,

                    packingQty: calculatePackingQty(qtyTarget, casePack),

                    packingMethod: String(item.packingMethod || ""),
                };
            }),
        };

        updatedShipment.items[itemIndex][field] = newValue;

        if (field === "qtyTarget") {
            updatedShipment.items[itemIndex].packingQty = calculatePackingQty(newValue, updatedShipment.items[itemIndex].casePack);
        }

        if (field === "casePack") {
            updatedShipment.items[itemIndex].packingQty = calculatePackingQty(updatedShipment.items[itemIndex].qtyTarget, newValue);
        }

        if (field === "sku") {
            const lookup = await api("lookupSKU", {
                sku: newValue,
            });

            if (!lookup?.success) {
                throw new Error(lookup?.message || "SKU tidak ditemukan di Master Data.");
            }

            const masterItem = lookup?.item || lookup?.data?.item;

            if (!masterItem) {
                throw new Error("Data SKU tidak valid.");
            }

            updatedShipment.items[itemIndex].sku = String(masterItem.sku || newValue);

            updatedShipment.items[itemIndex].upc = String(masterItem.upc || "");

            updatedShipment.items[itemIndex].name = String(masterItem.name || "");
        }

        const result = await api("updateShipment", updatedShipment);

        if (!result?.success) {
            throw new Error(result?.message || "Gagal menyimpan perubahan.");
        }

        const savedShipment = result?.shipment || result?.data?.shipment;

        if (savedShipment) {
            shipment.items = savedShipment.items || updatedShipment.items;

            shipment.date = savedShipment.date || shipment.date;

            shipment.poTitle = savedShipment.poTitle ?? shipment.poTitle;
        } else {
            shipment.items = updatedShipment.items;
        }

        const row = modal.querySelector(`[data-item-index="${itemIndex}"][data-field="${field}"]`);

        if (row) {
            renderDetailFieldAfterSave(modal, shipment, itemIndex, field);
        }

        if (field === "sku" || field === "qtyTarget" || field === "casePack") {
            refreshDetailRow(modal, shipment, itemIndex);
        }

        await loadShipments();

        toast("Perubahan berhasil disimpan.", "success");
    } catch (error) {
        console.error(error);

        toast(error?.message || "Gagal menyimpan perubahan.", "error");
    } finally {
        busy(false);
    }
}

function renderDetailFieldAfterSave(modal, shipment, itemIndex, field) {
    const area = modal.querySelector(`[data-item-index="${itemIndex}"][data-field="${field}"]`);

    if (!area) {
        return;
    }

    const value = getDetailFieldValue(shipment.items[itemIndex], field);

    area.innerHTML = `
        <div class="shipment-detail-value">
            ${esc(value || "-")}
        </div>

        ${createEditIcon()}
    `;

    area.querySelector(".shipment-detail-edit-icon")?.addEventListener("click", (event) => {
        event.stopPropagation();

        startDetailFieldEdit(modal, shipment, itemIndex, field, area);
    });
}

function refreshDetailRow(modal, shipment, itemIndex) {
    const item = shipment.items?.[itemIndex];

    if (!item) {
        return;
    }

    const row = modal.querySelector(`tbody tr:nth-child(${itemIndex + 1})`);

    if (!row) {
        return;
    }

    const upcCell = row.children[1];

    const nameCell = row.children[2];

    const packingQtyCell = row.children[5];

    if (upcCell) {
        upcCell.innerHTML = `
            <div class="shipment-detail-value">
                ${esc(item.upc || "-")}
            </div>
        `;
    }

    if (nameCell) {
        nameCell.innerHTML = `
            <div class="shipment-detail-value">
                ${esc(item.name || "-")}
            </div>
        `;
    }

    if (packingQtyCell) {
        const packingQty = calculatePackingQty(item.qtyTarget, item.casePack);

        item.packingQty = packingQty;

        packingQtyCell.innerHTML = `
            <div class="shipment-detail-value">
                ${esc(packingQty || "-")}
            </div>
        `;
    }
}

function convertDetailDateToInput(dateValue) {
    const value = String(dateValue || "").trim();

    if (!value) {
        return getTodayInputValue();
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    const parts = value.split("-");

    if (parts.length === 3 && parts[0].length === 2) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    return value;
}

async function deleteShipment(shipmentId) {
    if (!isAdmin()) {
        toast("Hanya ADMIN yang dapat menghapus Shipment.", "error");

        return;
    }

    openDeleteShipmentModal(shipmentId);
}

function openDeleteShipmentModal(shipmentId) {
    $("shipmentDeleteConfirmModal")?.remove();

    const modal = document.createElement("div");

    modal.id = "shipmentDeleteConfirmModal";

    modal.className = "shipment-modal shipment-delete-confirm-modal";

    modal.innerHTML = `
        <div
            class="shipment-modal-backdrop"
            data-delete-shipment-close>
        </div>

        <div
            class="shipment-modal-dialog shipment-confirm-dialog">

            <div
                class="shipment-modal-header">

                <div>

                    <h3>
                        Hapus Shipment?
                    </h3>

                    <p>
                        Shipment ini akan dihapus secara permanen.
                    </p>

                </div>

                <button
                    type="button"
                    class="shipment-modal-close"
                    data-delete-shipment-close
                    aria-label="Tutup">
                    ×
                </button>

            </div>

            <div
                class="shipment-confirm-content">

                <div
                    class="shipment-confirm-item">

                    <div>

                        <span>
                            Shipment / DPV
                        </span>

                        <strong>
                            ${esc(shipmentId)}
                        </strong>

                    </div>

                </div>

                <p
                    class="shipment-confirm-warning">
                    Data Shipment, transaksi terkait, dan DPV akan dihapus.
                    Tindakan ini tidak dapat dibatalkan.
                </p>

            </div>

            <div
                class="shipment-modal-footer">

                <button
                    class="btn btn-soft"
                    type="button"
                    data-delete-shipment-close>
                    Batal
                </button>

                <button
                    id="confirmDeleteShipmentBtn"
                    class="btn btn-danger"
                    type="button">
                    Hapus
                </button>

            </div>

        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll("[data-delete-shipment-close]").forEach((element) => {
        element.addEventListener("click", () => modal.remove());
    });

    $("confirmDeleteShipmentBtn")?.addEventListener("click", async () => {
        await executeDeleteShipment(shipmentId, modal);
    });
}

async function executeDeleteShipment(shipmentId, modal) {
    try {
        busy(true);

        const result = await api("deleteShipment", {
            shipmentId,
        });

        if (!result?.success) {
            throw new Error(result?.message || "Gagal menghapus Shipment.");
        }

        modal.remove();

        $("shipmentDetailModal")?.remove();

        await loadShipments();

        toast("Shipment berhasil dihapus.");
    } catch (error) {
        console.error(error);

        toast(error?.message || "Gagal menghapus Shipment.", "error");
    } finally {
        busy(false);
    }
}

function toggleArchive() {
    archiveMode = !archiveMode;

    const button = $("archiveShipmentBtn");

    if (button) {
        button.classList.toggle("active", archiveMode);

        const span = button.querySelector("span");

        if (span) {
            span.textContent = archiveMode ? "Kembali" : "Arsip";
        }
    }

    renderShipments();
}

export function bindShipment() {
    $("addShipmentBtn")?.addEventListener("click", openShipmentForm);

    $("archiveShipmentBtn")?.addEventListener("click", toggleArchive);

    $("shipmentSearch")?.addEventListener("input", renderShipments);
}
