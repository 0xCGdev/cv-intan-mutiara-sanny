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
const subcategoryFilters = document.querySelectorAll(".subcategory-filter");
const categoryGroups = document.querySelectorAll(".category-group");
const materialFilters = document.querySelectorAll('.material-option input[type="checkbox"]');

if (catalogueGrid) {
    const productCards = Array.from(catalogueGrid.querySelectorAll(".catalogue-card"));
    let activeCategory = "all";
    let activeSubcategory = "";

    const updateCatalogue = () => {
        const selectedMaterials = Array.from(materialFilters)
            .filter((input) => input.checked)
            .map((input) => input.value);

        const visibleCards = productCards.filter((card) => {
            const categoryMatch = activeCategory === "all" || card.dataset.category === activeCategory;
            const subcategoryMatch = !activeSubcategory || card.dataset.subcategory === activeSubcategory;
            const cardMaterials = (card.dataset.material || "").split(/\s+/).filter(Boolean);
            const materialMatch = selectedMaterials.length === 0 || selectedMaterials.some((material) => cardMaterials.includes(material));
            const isVisible = categoryMatch && subcategoryMatch && materialMatch;
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
            catalogueCount.textContent = String(visibleCards.length);
            const productLabel = catalogueCount.nextSibling;
            if (productLabel && productLabel.nodeType === Node.TEXT_NODE) {
                productLabel.textContent = visibleCards.length === 1 ? " Product" : " Products";
            }
        }
        if (catalogueEmpty) {
            catalogueEmpty.hidden = visibleCards.length !== 0;
            catalogueEmpty.classList.toggle("subcategory-empty", Boolean(activeSubcategory) && visibleCards.length === 0);
            const emptyHeading = catalogueEmpty.querySelector("h3");
            const emptyDescription = catalogueEmpty.querySelector("p");
            if (activeSubcategory && visibleCards.length === 0) {
                if (emptyHeading) emptyHeading.textContent = "Coming Soon";
                if (emptyDescription) emptyDescription.textContent = "This collection is being prepared.";
            } else {
                if (emptyHeading) emptyHeading.textContent = "No products found";
                if (emptyDescription) emptyDescription.textContent = "Try selecting another category or material.";
            }
        }

        const allCategoriesButton = document.querySelector('.collection-filter[data-category="all"]');
        if (allCategoriesButton) {
            let allCount = allCategoriesButton.querySelector(".filter-count");
            if (!allCount) {
                allCount = document.createElement("span");
                allCount.className = "filter-count";
                allCategoriesButton.appendChild(allCount);
            }
            allCount.textContent = `(${productCards.length})`;
        }

        subcategoryFilters.forEach((button) => {
            const category = button.dataset.category || "";
            const subcategory = button.dataset.subcategory || "";
            const count = productCards.filter((card) => card.dataset.category === category && card.dataset.subcategory === subcategory).length;
            let countElement = button.querySelector(".filter-count");
            if (!countElement) {
                countElement = document.createElement("span");
                countElement.className = "filter-count";
                button.appendChild(countElement);
            }
            countElement.textContent = String(count);
        });
    };

    const clearActiveFilters = () => {
        collectionFilters.forEach((filter) => filter.classList.remove("active"));
        subcategoryFilters.forEach((filter) => filter.classList.remove("active"));
    };

    collectionFilters.forEach((button) => {
        button.addEventListener("click", () => {
            const category = button.dataset.category || "all";
            if (category !== "all" && button.classList.contains("category-parent")) {
                const group = button.closest(".category-group");
                const willExpand = group && !group.classList.contains("is-expanded");
                categoryGroups.forEach((item) => item.classList.remove("is-expanded"));
                if (group && willExpand) group.classList.add("is-expanded");
            } else if (category === "all") {
                categoryGroups.forEach((item) => item.classList.remove("is-expanded"));
            }

            activeCategory = category;
            activeSubcategory = "";
            clearActiveFilters();
            button.classList.add("active");
            updateCatalogue();
        });
    });

    subcategoryFilters.forEach((button) => {
        button.addEventListener("click", () => {
            activeCategory = button.dataset.category || "all";
            activeSubcategory = button.dataset.subcategory || "";
            clearActiveFilters();
            const parent = button.closest(".category-group")?.querySelector(".category-parent");
            if (parent) parent.classList.add("active");
            button.classList.add("active");
            updateCatalogue();
        });
    });

    materialFilters.forEach((input) => input.addEventListener("change", updateCatalogue));
    if (catalogueSort) catalogueSort.addEventListener("change", updateCatalogue);

    const filterToggle = document.getElementById("catalogueFilterToggle");
    const filterPopup = document.getElementById("catalogueFilterPopup");
    const filterClose = document.getElementById("catalogueFilterClose");
    const closeFilterPopup = () => {
        if (!filterPopup || !filterToggle) return;
        filterPopup.hidden = true;
        filterToggle.setAttribute("aria-expanded", "false");
    };
    if (filterToggle && filterPopup) {
        filterToggle.addEventListener("click", () => {
            const isOpening = filterPopup.hidden;
            filterPopup.hidden = !isOpening;
            filterToggle.setAttribute("aria-expanded", String(isOpening));
        });
        filterClose?.addEventListener("click", closeFilterPopup);
        document.addEventListener("click", (event) => {
            if (!filterPopup.hidden && !filterPopup.contains(event.target) && !filterToggle.contains(event.target)) closeFilterPopup();
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") closeFilterPopup();
        });
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
const detailProductWeight = document.getElementById("detailProductWeight");
const detailProductDimensions = document.getElementById("detailProductDimensions");
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
    const subcategory = (card.dataset.subcategory || "").trim();
    const categoryLabels = { "home-decor": "Home Decor", "garden-decor": "Garden Decor", "engraving-stones": "Engraving Stones" };
    const subcategoryButton = document.querySelector(`.subcategory-filter[data-category="${category}"][data-subcategory="${subcategory}"]`);
    const subcategoryLabel = subcategoryButton
        ? Array.from(subcategoryButton.childNodes)
              .filter((node) => node.nodeType === Node.TEXT_NODE)
              .map((node) => node.textContent.trim())
              .filter(Boolean)
              .join(" ")
        : subcategory.replace(/-/g, " ");
    if (detailProductCollection) detailProductCollection.textContent = [categoryLabels[category] || category, subcategoryLabel].filter(Boolean).join(" — ");
    if (detailProductWeight) detailProductWeight.textContent = card.dataset.weight || "—";
    if (detailProductDimensions) detailProductDimensions.textContent = card.dataset.dimensions || "—";
    if (detailProductDescription) {
        detailProductDescription.textContent = card.dataset.description || productDescriptions[productCode] || "A decorative piece from the Unlimited4Decor collection. Contact our team for further product information.";
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

const aboutReadMore = document.getElementById("aboutReadMore");
const aboutDetails = document.getElementById("aboutDetails");

if (aboutReadMore && aboutDetails) {
    aboutReadMore.addEventListener("click", () => {
        const isExpanded = aboutReadMore.getAttribute("aria-expanded") === "true";
        aboutReadMore.setAttribute("aria-expanded", String(!isExpanded));
        aboutDetails.hidden = isExpanded;
        aboutReadMore.querySelector("span").textContent = isExpanded ? "Read More" : "Read Less";

        if (!isExpanded) {
            requestAnimationFrame(() => {
                aboutDetails.scrollIntoView({ behavior: "smooth", block: "nearest" });
            });
        }
    });
}
