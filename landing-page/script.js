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
