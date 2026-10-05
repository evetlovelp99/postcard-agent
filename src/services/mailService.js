const { Resend } = require('resend');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeBase64(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const trimmed = raw.trim();
  if (trimmed.includes(',')) return trimmed.split(',')[1].trim();
  return trimmed;
}

function isSmtpConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

async function sendPostcardEmail({ recipientEmail, postcardImageBase64, caption, city }) {
  if (!isSmtpConfigured()) {
    throw new Error('Email is not configured. Set RESEND_API_KEY in your environment.');
  }

  const base64 = normalizeBase64(postcardImageBase64);
  if (!base64) throw new Error('A postcard image is required to send email.');

  const safeCity = escapeHtml(city || 'Your postcard');
  const captionHtml = caption?.trim()
    ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#2c2017;">${escapeHtml(caption.trim())}</p>`
    : '<p style="margin:0 0 16px;font-size:15px;color:#6b5b4f;font-style:italic;">No caption — silence says more.</p>';

  const html = `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f4efe6;font-family:Georgia,serif;">
    <p style="margin:0 0 8px;font-size:13px;color:#8a7a6a;">PostCard Agent</p>
    <h1 style="margin:0 0 20px;font-size:22px;color:#2c2017;">A postcard from ${safeCity}</h1>
    ${captionHtml}
    <img src="data:image/png;base64,${base64}" alt="Postcard" width="640" style="max-width:100%;height:auto;border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,0.15);" />
  </body>
</html>`.trim();

  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: 'PostCard Agent <onboarding@resend.dev>',
    to: recipientEmail.trim(),
    subject: `Postcard from ${city || 'PostCard Agent'}`,
    html,
  });
}

module.exports = {
  sendPostcardEmail,
  isSmtpConfigured,
};