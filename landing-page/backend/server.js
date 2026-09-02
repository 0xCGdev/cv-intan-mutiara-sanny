require("dotenv").config();

const express = require("express");

const cors = require("cors");

const nodemailer = require("nodemailer");

const rateLimit = require("express-rate-limit");

const app = express();

app.set("trust proxy", 1);

const PORT = process.env.PORT || 3001;

// ---------- Middleware ----------

app.use(express.json({ limit: "100kb" }));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: function (origin, callback) {
            // Izinkan request tanpa origin (misal Postman) dan origin yang terdaftar
            if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
    }),
);

// Batasi request untuk mencegah spam/abuse (maks 5 submit per 15 menit per IP)
const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        ok: false,
        error: "Too many attempts. Please try again later.",
    },
});

// ---------- Helper: validasi input ----------

function validateContactPayload(body) {
    const errors = [];

    const { name, email, company, country, productInterest, message, honeypot } = body;

    // Honeypot field - bot biasanya mengisi field tersembunyi ini
    if (honeypot) {
        errors.push("spam_detected");
    }

    if (!name || typeof name !== "string" || name.trim().length < 2) {
        errors.push("Name is required (minimum 2 characters).");
    }

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push("Invalid email address.");
    }

    if (message && message.length > 3000) {
        errors.push("Message is too long (maximum 3000 characters).");
    }

    if (company && company.length > 200) {
        errors.push("Company name is too long.");
    }

    if (country && country.length > 100) {
        errors.push("Country name is too long.");
    }

    return errors;
}

function escapeHtml(str = "") {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ---------- Mailer setup ----------

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    return transporter;
}

// ---------- Routes ----------

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        status: "running",
    });
});

app.post("/api/contact", contactLimiter, async (req, res) => {
    try {
        const errors = validateContactPayload(req.body || {});

        if (errors.length > 0) {
            return res.status(400).json({
                ok: false,
                error: errors.join(" "),
            });
        }

        const { name, email, company, country, productInterest, message } = req.body;

        const mailHtml = `
            <h2>New Quote Request — Intan Mutiara Sanny Website</h2>

            <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
                <tr>
                    <td><strong>Name</strong></td>
                    <td>${escapeHtml(name)}</td>
                </tr>

                <tr>
                    <td><strong>Email</strong></td>
                    <td>${escapeHtml(email)}</td>
                </tr>

                <tr>
                    <td><strong>Company</strong></td>
                    <td>${escapeHtml(company || "-")}</td>
                </tr>

                <tr>
                    <td><strong>Destination Country</strong></td>
                    <td>${escapeHtml(country || "-")}</td>
                </tr>

                <tr>
                    <td><strong>Product Interest</strong></td>
                    <td>${escapeHtml(productInterest || "-")}</td>
                </tr>

                <tr>
                    <td valign="top">
                        <strong>Message</strong>
                    </td>
                    <td>
                        ${escapeHtml(message || "-").replace(/\n/g, "<br/>")}
                    </td>
                </tr>
            </table>
        `;

        const mail = getTransporter();

        await mail.sendMail({
            from: `"Website Intan Mutiara Sanny" <${process.env.CONTACT_FROM_EMAIL}>`,
            to: process.env.CONTACT_TO_EMAIL,
            replyTo: email,
            subject: `New Quote Request from ${name}`,
            html: mailHtml,
        });

        return res.json({
            ok: true,
            message: "Thank you — our export team will reach out shortly.",
        });
    } catch (err) {
        console.error("Contact form error:", err);

        return res.status(500).json({
            ok: false,
            error: "Something went wrong on the server. Please try again later.",
        });
    }
});

app.listen(PORT, () => {
    console.log(`Contact backend is running at http://localhost:${PORT}`);
});
