const burger = document.getElementById("burgerBtn");
const navLinks = document.getElementById("navLinks");

if (burger && navLinks) {
    burger.setAttribute("aria-expanded", "false");

    burger.addEventListener("click", () => {
        const isOpen = navLinks.classList.toggle("open");
        burger.setAttribute("aria-expanded", String(isOpen));
    });

    navLinks.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
            navLinks.classList.remove("open");
            burger.setAttribute("aria-expanded", "false");
        });
    });

    document.addEventListener("click", (event) => {
        if (!navLinks.contains(event.target) && !burger.contains(event.target)) {
            navLinks.classList.remove("open");
            burger.setAttribute("aria-expanded", "false");
        }
    });
}

const revealElements = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.15 },
    );

    revealElements.forEach((element) => revealObserver.observe(element));
} else {
    revealElements.forEach((element) => element.classList.add("is-visible"));
}

const catalogueGrid = document.getElementById("catalogueGrid");
const catalogueCount = document.getElementById("catalogueProductCount");
const catalogueEmpty = document.getElementById("catalogueEmpty");
const catalogueSort = document.getElementById("catalogueSort");
const collectionFilters = document.querySelectorAll(".collection-filter");
const materialFilters = document.querySelectorAll('.material-option input[type="checkbox"]');

if (catalogueGrid) {
    const productCards = Array.from(catalogueGrid.querySelectorAll(".catalogue-card"));
    let activeCategory = "all";

    const updateCatalogue = () => {
        const selectedMaterials = Array.from(materialFilters)
            .filter((input) => input.checked)
            .map((input) => input.value);

        const visibleCards = productCards.filter((card) => {
            const categoryMatch = activeCategory === "all" || card.dataset.category === activeCategory;
            const cardMaterials = (card.dataset.material || "").split(/\s+/).filter(Boolean);
            const materialMatch = selectedMaterials.length === 0 || selectedMaterials.some((material) => cardMaterials.includes(material));
            const isVisible = categoryMatch && materialMatch;

            card.hidden = !isVisible;
            return isVisible;
        });

        const sortValue = catalogueSort ? catalogueSort.value : "newest";
        const sortedCards = [...visibleCards];

        sortedCards.sort((a, b) => {
            const nameA = (a.dataset.name || "").toLocaleLowerCase();
            const nameB = (b.dataset.name || "").toLocaleLowerCase();
            const dateA = Number(a.dataset.date || 0);
            const dateB = Number(b.dataset.date || 0);

            if (sortValue === "oldest") return dateA - dateB;
            if (sortValue === "az") return nameA.localeCompare(nameB);
            if (sortValue === "za") return nameB.localeCompare(nameA);
            return dateB - dateA;
        });

        sortedCards.forEach((card) => catalogueGrid.appendChild(card));

        if (catalogueCount) {
            catalogueCount.textContent = String(visibleCards.length).padStart(2, "0");
        }

        if (catalogueEmpty) {
            catalogueEmpty.hidden = visibleCards.length !== 0;
        }

        collectionFilters.forEach((button) => {
            const category = button.dataset.category;
            const count = category === "all" ? productCards.length : productCards.filter((card) => card.dataset.category === category).length;
            const countElement = button.querySelector(".filter-count");

            if (countElement) {
                countElement.textContent = String(count).padStart(2, "0");
            }
        });
    };

    collectionFilters.forEach((button) => {
        button.addEventListener("click", () => {
            activeCategory = button.dataset.category || "all";
            collectionFilters.forEach((filter) => {
                filter.classList.toggle("active", filter === button);
            });
            updateCatalogue();
        });
    });

    materialFilters.forEach((input) => input.addEventListener("change", updateCatalogue));

    if (catalogueSort) {
        catalogueSort.addEventListener("change", updateCatalogue);
    }

    updateCatalogue();
}

const productDetailModal = document.getElementById("productDetailModal");
const detailClose = document.getElementById("detailClose");
const detailProductImage = document.getElementById("detailProductImage");
const detailProductName = document.getElementById("detailProductName");
const detailProductCode = document.getElementById("detailProductCode");
const detailProductMaterial = document.getElementById("detailProductMaterial");
const detailProductCollection = document.getElementById("detailProductCollection");
const detailProductDescription = document.getElementById("detailProductDescription");
const detailQuoteLink = document.getElementById("detailQuoteLink");
let previousDetailFocus = null;

const materialLabels = {
    wood: "Wood",
    stone: "Stone",
    glass: "Glass",
    rattan: "Rattan",
    bamboo: "Bamboo",
    "natural-fiber": "Natural Fiber",
};

const collectionLabels = {
    statues: "Statues & Sculptures",
    wood: "Wood Collection",
    stone: "Stone Collection",
    hanging: "Hanging Decor",
    tables: "Tables & Furniture",
};

const productDescriptions = {
    46637: "A Thai sitting Buddha decorative sculpture, designed to bring a calm and contemplative presence to an interior space.",
    49201: "A decorative piece inspired by the organic form of parasit oyster mushrooms, suited to nature-inspired displays.",
    20167: "A stone shade lantern with a sculptural silhouette, created as an accent for decorative settings.",
    71318: "A raindrop butterfly mobile featuring a light, suspended composition for adding movement to an interior space.",
    "FS-Z": "A collection of miracle beach pebble zodiac stones, bringing natural pebble forms together with zodiac-inspired styling.",
    47235: "A Habini teak mosaic stool that combines a practical furniture form with a patterned surface.",
};

const openProductDetail = (card, trigger) => {
    if (!productDetailModal) return;

    const productCode = (card.dataset.product || "").trim();
    const productName = (card.dataset.name || card.querySelector(".product-title")?.textContent || "").trim();
    const productImage = card.querySelector(".product-image img, img");
    const category = (card.dataset.category || "").trim();
    const materials = (card.dataset.material || "").split(/\s+/).filter(Boolean);
    const materialText = materials.map((material) => materialLabels[material] || material).join(", ");

    if (detailProductImage) {
        detailProductImage.src = productImage ? productImage.currentSrc || productImage.src : "";
        detailProductImage.alt = productImage ? productImage.alt || productName : productName;
    }

    if (detailProductName) detailProductName.textContent = productName || "Product Details";
    if (detailProductCode) detailProductCode.textContent = productCode ? `Product Code: ${productCode}` : "";
    if (detailProductMaterial) detailProductMaterial.textContent = materialText || "Please enquire";
    if (detailProductCollection) detailProductCollection.textContent = collectionLabels[category] || category || "Unlimited4Decor Collection";
    if (detailProductDescription) {
        detailProductDescription.textContent = card.dataset.description || productDescriptions[productCode] || "A decorative piece from the Unlimited4Decor collection. Contact our team for further product information.";
    }

    if (detailQuoteLink) {
        const quoteMessage = `I would like to request a quote for ${productName || "this product"}${productCode ? ` (Code: ${productCode})` : ""}.`;
        detailQuoteLink.href = `#contact`;
        detailQuoteLink.dataset.quoteMessage = quoteMessage;
    }

    previousDetailFocus = trigger || document.activeElement;
    productDetailModal.classList.add("is-open");
    productDetailModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("detail-modal-open");

    if (detailClose) detailClose.focus();
};

const closeProductDetail = (restoreFocus = true) => {
    if (!productDetailModal) return;

    productDetailModal.classList.remove("is-open");
    productDetailModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("detail-modal-open");

    if (restoreFocus && previousDetailFocus && typeof previousDetailFocus.focus === "function") {
        previousDetailFocus.focus();
    }
};

if (detailQuoteLink) {
    detailQuoteLink.addEventListener("click", () => {
        closeProductDetail(false);
    });
}

if (catalogueGrid && productDetailModal) {
    catalogueGrid.addEventListener("click", (event) => {
        const trigger = event.target.closest(".product-open");
        if (!trigger) return;

        const card = trigger.closest(".catalogue-card");
        if (card) openProductDetail(card, trigger);
    });

    if (detailClose) {
        detailClose.addEventListener("click", closeProductDetail);
    }

    productDetailModal.addEventListener("click", (event) => {
        if (event.target === productDetailModal) {
            closeProductDetail();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (!productDetailModal.classList.contains("is-open")) return;

        if (event.key === "Escape") {
            closeProductDetail();
        }

        if (event.key === "Tab") {
            const focusableElements = Array.from(productDetailModal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((element) => element.offsetParent !== null);

            if (focusableElements.length === 0) return;

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            } else if (!event.shiftKey && document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        }
    });
}

const CONTACT_API_URL = "https://api.unlimited4decor.com/api/contact";
const contactForm = document.getElementById("contactForm");
const submitButton = document.getElementById("contactSubmitBtn");
const submitMessage = document.getElementById("contactSubmitMsg");

if (contactForm && submitButton && submitMessage) {
    contactForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const formData = new FormData(contactForm);
        const payload = Object.fromEntries(formData.entries());

        submitButton.disabled = true;
        submitButton.textContent = "Sending...";
        submitMessage.style.display = "none";
        submitMessage.textContent = "";

        try {
            const response = await fetch(CONTACT_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            let result = {};

            try {
                result = await response.json();
            } catch {
                result = {};
            }

            submitMessage.style.display = "block";

            if (response.ok && result.ok) {
                submitMessage.style.color = "var(--green-bright, #1a7f4b)";
                submitMessage.textContent = result.message || "Thank you — our export team will reach out shortly.";
                contactForm.reset();
            } else {
                submitMessage.style.color = "#c0392b";
                submitMessage.textContent = result.error || "Something went wrong. Please try again.";
            }
        } catch (error) {
            submitMessage.style.display = "block";
            submitMessage.style.color = "#c0392b";
            submitMessage.textContent = "Could not reach the server. Please check your connection and try again.";
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Request a Quote";
        }
    });
}
