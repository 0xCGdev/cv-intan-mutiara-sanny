// mobile nav
const burger = document.getElementById("burgerBtn");
const links = document.getElementById("navLinks");
burger.addEventListener("click", () => links.classList.toggle("open"));
links.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => links.classList.remove("open")));

// scroll reveal
const io = new IntersectionObserver(
    (entries) => {
        entries.forEach((e) => {
            if (e.isIntersecting) {
                e.target.classList.add("is-visible");
                io.unobserve(e.target);
            }
        });
    },
    { threshold: 0.15 },
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// =============================
// Contact Form
// =============================

const CONTACT_API_URL = "http://localhost:3001/api/contact";

const contactForm = document.getElementById("contactForm");
const submitBtn = document.getElementById("contactSubmitBtn");
const submitMsg = document.getElementById("contactSubmitMsg");

contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(contactForm);
    const payload = Object.fromEntries(formData.entries());

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";
    submitMsg.style.display = "none";

    try {
        const response = await fetch(CONTACT_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const result = await response.json();

        submitMsg.style.display = "block";
        if (response.ok && result.ok) {
            submitMsg.style.color = "var(--green-bright, #1a7f4b)";
            submitMsg.textContent = result.message || "Thank you — our export team will reach out shortly.";
            contactForm.reset();
        } else {
            submitMsg.style.color = "#c0392b";
            submitMsg.textContent = result.error || "Something went wrong. Please try again.";
        }
    } catch (err) {
        submitMsg.style.display = "block";
        submitMsg.style.color = "#c0392b";
        submitMsg.textContent = "Could not reach the server. Please check your connection and try again.";
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Request a Quote";
    }
});
