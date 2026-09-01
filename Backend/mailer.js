const nodemailer = require("nodemailer");

function smtpConfigured() {
    return Boolean(
        process.env.SMTP_HOST
        && process.env.SMTP_USER
        && process.env.SMTP_PASS
        && process.env.PHOCLOUD_FROM_EMAIL
    );
}

function createTransport() {
    if (!smtpConfigured()) return null;

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function sendAccountLink({ to, displayName, purpose, link }) {
    const transporter = createTransport();
    const isVerification = purpose === "verify_email";
    const action = isVerification ? "Verificar mi correo" : "Crear nueva contraseña";
    const subject = isVerification
        ? "Confirma tu cuenta de PHOcloud"
        : "Recupera tu cuenta de PHOcloud";

    if (!transporter) {
        if (process.env.NODE_ENV !== "test") {
            console.info(`[PHOcloud correo local] ${subject}: ${link}`);
        }
        return { delivered: false, devLink: link };
    }

    await transporter.sendMail({
        from: process.env.PHOCLOUD_FROM_EMAIL,
        to,
        subject,
        text: `Hola ${displayName || "fotógrafo"}. ${action}: ${link}`,
        html: `
            <div style="max-width:560px;margin:auto;padding:36px;font-family:Arial,sans-serif;color:#171717">
                <p style="font-size:12px;letter-spacing:.16em;color:#8d7041">PHOCLOUD</p>
                <h1 style="font-family:Georgia,serif;font-weight:400">${escapeHtml(subject)}</h1>
                <p>Hola ${escapeHtml(displayName || "fotógrafo")},</p>
                <p>${isVerification
                    ? "Confirma tu dirección para activar tu cuenta y empezar a crear galerías."
                    : "Hemos recibido una solicitud para cambiar tu contraseña."}</p>
                <p style="margin:30px 0">
                    <a href="${escapeHtml(link)}" style="padding:14px 22px;border-radius:99px;background:#111;color:#fff;text-decoration:none">${action}</a>
                </p>
                <p style="font-size:13px;color:#666">Si no has solicitado esto, puedes ignorar este correo.</p>
            </div>
        `
    });

    return { delivered: true, devLink: null };
}

async function sendGalleryDelivery({
    to, clientName, photographerName, galleryName, link, protectedGallery
}) {
    const transporter = createTransport();
    const subject = `${photographerName || "Tu fotógrafo"} ha publicado tu galería`;
    const accessNote = protectedGallery
        ? "La galería está protegida. Tu fotógrafo te facilitará la contraseña por separado."
        : "Puedes abrirla directamente desde este enlace.";

    if (!transporter) {
        if (process.env.NODE_ENV !== "test") {
            console.info(`[PHOcloud correo local] ${subject}: ${link}`);
        }
        return { delivered: false, devLink: link };
    }

    await transporter.sendMail({
        from: process.env.PHOCLOUD_FROM_EMAIL,
        to,
        subject,
        text: `Hola ${clientName}. Tu galería ${galleryName} ya está disponible: ${link}. ${accessNote}`,
        html: `
            <div style="max-width:580px;margin:auto;padding:40px;font-family:Arial,sans-serif;color:#171717">
                <p style="font-size:12px;letter-spacing:.16em;color:#8d7041">PHOCLOUD</p>
                <h1 style="font-family:Georgia,serif;font-weight:400">Tu galería ya está disponible</h1>
                <p>Hola ${escapeHtml(clientName)},</p>
                <p>${escapeHtml(photographerName || "Tu fotógrafo")} ha preparado la galería <strong>${escapeHtml(galleryName)}</strong> para ti.</p>
                <p style="margin:30px 0">
                    <a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 22px;border-radius:99px;background:#111;color:#fff;text-decoration:none">Ver mi galería</a>
                </p>
                <p style="font-size:13px;color:#666">${escapeHtml(accessNote)}</p>
            </div>
        `
    });

    return { delivered: true, devLink: null };
}

async function sendTransferDelivery({
    to, senderName, title, message, link, protectedTransfer, expiresAt
}) {
    const transporter = createTransport();
    const subject = `${senderName || "PHOcloud"} te ha enviado archivos`;
    const protection = protectedTransfer
        ? "La transferencia está protegida; pide la contraseña al remitente por separado."
        : "Puedes descargarla directamente desde el enlace.";
    const expiry = new Intl.DateTimeFormat("es-ES", {
        day: "numeric", month: "long", year: "numeric"
    }).format(new Date(expiresAt));
    if (!transporter) {
        if (process.env.NODE_ENV !== "test") {
            console.info(`[PHOcloud correo local] ${subject}: ${link}`);
        }
        return { delivered: false, devLink: link };
    }
    await transporter.sendMail({
        from: process.env.PHOCLOUD_FROM_EMAIL,
        to,
        subject,
        text: `${senderName || "PHOcloud"} te ha enviado “${title}”: ${link}. Disponible hasta el ${expiry}. ${protection}`,
        html: `
            <div style="max-width:580px;margin:auto;padding:40px;font-family:Arial,sans-serif;color:#171717">
                <p style="font-size:12px;letter-spacing:.16em;color:#8d7041">PHOCLOUD TRANSFER</p>
                <h1 style="font-family:Georgia,serif;font-weight:400">Te han enviado archivos</h1>
                <p><strong>${escapeHtml(senderName || "PHOcloud")}</strong> ha preparado <strong>${escapeHtml(title)}</strong> para ti.</p>
                ${message ? `<p>${escapeHtml(message)}</p>` : ""}
                <p style="margin:30px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 22px;border-radius:99px;background:#111;color:#fff;text-decoration:none">Ver y descargar archivos</a></p>
                <p style="font-size:13px;color:#666">Disponible hasta el ${escapeHtml(expiry)}. ${escapeHtml(protection)}</p>
            </div>
        `
    });
    return { delivered: true, devLink: null };
}

module.exports = {
    sendAccountLink, sendGalleryDelivery, sendTransferDelivery, smtpConfigured
};
