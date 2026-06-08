/**
 * Email sending service — reads active config from email_configs table.
 * Supports: SMTP (nodemailer), SendGrid, Mailgun, Postmark, AWS SES (SMTP relay).
 */
import nodemailer from "nodemailer";
import { db, emailConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

type SendResult = { ok: true; provider: string; messageId?: string } | { ok: false; error: string; provider: string };

async function getActiveConfig() {
  const [cfg] = await db
    .select()
    .from(emailConfigsTable)
    .where(and(eq(emailConfigsTable.isActive, true)))
    .orderBy(emailConfigsTable.createdAt)
    .limit(1);
  return cfg ?? null;
}

async function sendViaSMTP(cfg: typeof emailConfigsTable.$inferSelect, payload: EmailPayload): Promise<SendResult> {
  if (!cfg.smtpHost || !cfg.username || !cfg.password) {
    return { ok: false, provider: "smtp", error: "SMTP host/username/password not configured" };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort ?? 587,
      secure: cfg.smtpSecure ?? false,
      auth: { user: cfg.username, pass: cfg.password },
      tls: { rejectUnauthorized: process.env.NODE_ENV === "production" },
      connectionTimeout: 8000,
      greetingTimeout: 5000,
    });
    const info = await transporter.sendMail({
      from: cfg.fromEmail ? `"${cfg.fromName || "CryptoX"}" <${cfg.fromEmail}>` : cfg.username,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text ?? payload.html.replace(/<[^>]+>/g, ""),
    });
    logger.info({ messageId: info.messageId, to: payload.to }, "Email sent via SMTP");
    return { ok: true, provider: "smtp", messageId: info.messageId };
  } catch (e: any) {
    logger.error({ err: e.message, provider: "smtp" }, "SMTP send failed");
    return { ok: false, provider: "smtp", error: e.message };
  }
}

async function sendViaSendGrid(cfg: typeof emailConfigsTable.$inferSelect, payload: EmailPayload): Promise<SendResult> {
  if (!cfg.apiKey) return { ok: false, provider: "sendgrid", error: "API key not configured" };
  try {
    const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { "Authorization": `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }], subject: payload.subject }],
        from: { email: cfg.fromEmail || "no-reply@cryptox.in", name: cfg.fromName || "CryptoX" },
        content: [
          { type: "text/plain", value: payload.text ?? payload.html.replace(/<[^>]+>/g, "") },
          { type: "text/html", value: payload.html },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      const errText = await r.text();
      return { ok: false, provider: "sendgrid", error: `SendGrid ${r.status}: ${errText.slice(0, 200)}` };
    }
    const msgId = r.headers.get("x-message-id") ?? undefined;
    logger.info({ to: payload.to, msgId }, "Email sent via SendGrid");
    return { ok: true, provider: "sendgrid", messageId: msgId };
  } catch (e: any) {
    return { ok: false, provider: "sendgrid", error: e.message };
  }
}

async function sendViaMailgun(cfg: typeof emailConfigsTable.$inferSelect, payload: EmailPayload): Promise<SendResult> {
  if (!cfg.apiKey || !cfg.domain) return { ok: false, provider: "mailgun", error: "API key and domain required" };
  try {
    const formData = new URLSearchParams({
      from: cfg.fromEmail ? `${cfg.fromName || "CryptoX"} <${cfg.fromEmail}>` : `CryptoX <no-reply@${cfg.domain}>`,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text ?? payload.html.replace(/<[^>]+>/g, ""),
    });
    const baseUrl = cfg.region === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
    const r = await fetch(`${baseUrl}/v3/${cfg.domain}/messages`, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`api:${cfg.apiKey}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      const errText = await r.text();
      return { ok: false, provider: "mailgun", error: `Mailgun ${r.status}: ${errText.slice(0, 200)}` };
    }
    const json: any = await r.json();
    logger.info({ to: payload.to, id: json.id }, "Email sent via Mailgun");
    return { ok: true, provider: "mailgun", messageId: json.id };
  } catch (e: any) {
    return { ok: false, provider: "mailgun", error: e.message };
  }
}

async function sendViaPostmark(cfg: typeof emailConfigsTable.$inferSelect, payload: EmailPayload): Promise<SendResult> {
  if (!cfg.apiKey) return { ok: false, provider: "postmark", error: "Server token not configured" };
  try {
    const r = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": cfg.apiKey },
      body: JSON.stringify({
        From: cfg.fromEmail ? `${cfg.fromName || "CryptoX"} <${cfg.fromEmail}>` : "no-reply@cryptox.in",
        To: payload.to,
        Subject: payload.subject,
        HtmlBody: payload.html,
        TextBody: payload.text ?? payload.html.replace(/<[^>]+>/g, ""),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      const errText = await r.text();
      return { ok: false, provider: "postmark", error: `Postmark ${r.status}: ${errText.slice(0, 200)}` };
    }
    const json: any = await r.json();
    return { ok: true, provider: "postmark", messageId: json.MessageID };
  } catch (e: any) {
    return { ok: false, provider: "postmark", error: e.message };
  }
}

/** Main send function — reads config from DB and dispatches via correct provider. */
export async function sendEmail(payload: EmailPayload): Promise<SendResult> {
  const cfg = await getActiveConfig();
  if (!cfg) {
    logger.warn({ to: payload.to }, "No active email config — email not sent");
    return { ok: false, provider: "none", error: "No active email provider configured. Configure one in Admin → API Integrations → Email." };
  }
  switch (cfg.provider) {
    case "smtp":     return sendViaSMTP(cfg, payload);
    case "sendgrid": return sendViaSendGrid(cfg, payload);
    case "mailgun":  return sendViaMailgun(cfg, payload);
    case "postmark": return sendViaPostmark(cfg, payload);
    default:         return { ok: false, provider: cfg.provider, error: `Provider "${cfg.provider}" not implemented` };
  }
}

/** OTP-specific email template */
export async function sendOtpEmail(to: string, code: string, purpose: string): Promise<SendResult> {
  const purposeLabel: Record<string, string> = {
    signup: "Account Verification", login: "Login Verification", withdraw: "Withdrawal Verification",
    kyc: "KYC Verification", "2fa": "Two-Factor Authentication", reset: "Password Reset",
  };
  const label = purposeLabel[purpose] || "Verification";
  return sendEmail({
    to,
    subject: `Your CryptoX ${label} Code: ${code}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;border:1px solid #30363d">
        <div style="text-align:center;margin-bottom:24px">
          <div style="font-size:28px;font-weight:700;color:#f0b429;letter-spacing:-0.5px">CryptoX</div>
          <div style="color:#7d8590;font-size:13px;margin-top:4px">India's Professional Crypto Exchange</div>
        </div>
        <h2 style="font-size:18px;font-weight:600;color:#e6edf3;margin:0 0 8px">${label}</h2>
        <p style="color:#7d8590;font-size:14px;margin:0 0 24px">Use the code below to verify your identity. It expires in <strong>10 minutes</strong>.</p>
        <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px">
          <div style="font-family:monospace;font-size:36px;font-weight:700;color:#f0b429;letter-spacing:12px">${code}</div>
        </div>
        <p style="color:#7d8590;font-size:12px;margin:0">If you didn't request this, please ignore this email. Never share this code with anyone.</p>
        <div style="border-top:1px solid #30363d;margin-top:24px;padding-top:16px;text-align:center;color:#484f58;font-size:11px">
          © ${new Date().getFullYear()} CryptoX · Secure Indian Crypto Exchange
        </div>
      </div>
    `,
    text: `Your CryptoX ${label} Code: ${code}\n\nThis code expires in 10 minutes. Never share it with anyone.`,
  });
}

/** Trade confirmation email */
export async function sendTradeConfirmEmail(to: string, opts: {
  symbol: string; side: string; qty: string; price: string; total: string; tds: string; fee: string;
}): Promise<SendResult> {
  const isSell = opts.side === "sell";
  return sendEmail({
    to,
    subject: `Trade ${isSell ? "Sold" : "Bought"} ${opts.qty} ${opts.symbol.split("/")[0]} on CryptoX`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;border:1px solid #30363d">
        <div style="text-align:center;margin-bottom:24px">
          <div style="font-size:24px;font-weight:700;color:#f0b429">CryptoX</div>
        </div>
        <h2 style="font-size:18px;font-weight:600;margin:0 0 16px">Trade Executed ✅</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="color:#7d8590;padding:6px 0">Pair</td><td style="text-align:right;font-weight:600">${opts.symbol}</td></tr>
          <tr><td style="color:#7d8590;padding:6px 0">Side</td><td style="text-align:right;color:${isSell?"#f85149":"#3fb950"};font-weight:700;text-transform:uppercase">${opts.side}</td></tr>
          <tr><td style="color:#7d8590;padding:6px 0">Quantity</td><td style="text-align:right;font-family:monospace">${opts.qty}</td></tr>
          <tr><td style="color:#7d8590;padding:6px 0">Price</td><td style="text-align:right;font-family:monospace">₹${opts.price}</td></tr>
          <tr><td style="color:#7d8590;padding:6px 0">Total</td><td style="text-align:right;font-family:monospace;font-weight:700">₹${opts.total}</td></tr>
          <tr><td style="color:#7d8590;padding:6px 0">Fee</td><td style="text-align:right;font-family:monospace">₹${opts.fee}</td></tr>
          ${isSell ? `<tr><td style="color:#7d8590;padding:6px 0">TDS (1%)</td><td style="text-align:right;font-family:monospace;color:#f0b429">₹${opts.tds}</td></tr>` : ""}
        </table>
        <p style="color:#484f58;font-size:11px;margin-top:24px;text-align:center">TDS is deducted as per Indian crypto regulations (Section 194S)</p>
      </div>
    `,
  });
}

/** Deposit credited email */
export async function sendDepositEmail(to: string, opts: { amount: string; currency: string; method: string }): Promise<SendResult> {
  return sendEmail({
    to,
    subject: `₹${opts.amount} Credited to Your CryptoX Wallet`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;border:1px solid #30363d">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:24px;font-weight:700;color:#f0b429">CryptoX</div></div>
        <h2 style="font-size:18px;font-weight:600;margin:0 0 16px">Deposit Credited ✅</h2>
        <div style="background:#161b22;border:1px solid #3fb950;border-radius:8px;padding:20px;text-align:center">
          <div style="font-size:32px;font-weight:700;color:#3fb950">+${opts.currency} ${opts.amount}</div>
          <div style="color:#7d8590;font-size:13px;margin-top:4px">via ${opts.method}</div>
        </div>
        <p style="color:#7d8590;font-size:14px;margin-top:20px">Your wallet has been credited. You can now start trading on CryptoX.</p>
      </div>
    `,
  });
}

/** ─── Welcome / account created email ──────────────────────────────────── */
export async function sendWelcomeEmail(to: string, opts: { name?: string }): Promise<SendResult> {
  const name = opts.name || "Trader";
  return sendEmail({
    to,
    subject: "Welcome to CryptoX — Your Account Is Ready",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;border:1px solid #30363d">
        <div style="text-align:center;margin-bottom:28px">
          <div style="font-size:28px;font-weight:700;color:#f0b429;letter-spacing:-0.5px">CryptoX</div>
          <div style="color:#7d8590;font-size:13px;margin-top:4px">India's Professional Crypto Exchange</div>
        </div>
        <h2 style="font-size:20px;font-weight:700;margin:0 0 8px">Welcome, ${name}! 🎉</h2>
        <p style="color:#7d8590;font-size:14px;margin:0 0 24px;line-height:1.6">Your CryptoX account is ready. Here's what you can do right away:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
          <tr><td style="padding:8px 0;color:#7d8590">🔐</td><td style="padding:8px 0">Enable 2FA in <strong>Settings → Security</strong></td></tr>
          <tr><td style="padding:8px 0;color:#7d8590">✅</td><td style="padding:8px 0">Complete KYC to unlock higher limits</td></tr>
          <tr><td style="padding:8px 0;color:#7d8590">💰</td><td style="padding:8px 0">Deposit INR via UPI / IMPS / NEFT</td></tr>
          <tr><td style="padding:8px 0;color:#7d8590">📈</td><td style="padding:8px 0">Start trading 200+ spot and futures markets</td></tr>
        </table>
        <div style="text-align:center;margin-bottom:24px">
          <a href="https://cryptox.in/user/markets" style="display:inline-block;background:#f0b429;color:#000;font-weight:700;font-size:14px;padding:12px 32px;border-radius:8px;text-decoration:none">Start Trading</a>
        </div>
        <div style="border-top:1px solid #30363d;padding-top:16px;text-align:center;color:#484f58;font-size:11px">
          © ${new Date().getFullYear()} CryptoX · Secure Indian Crypto Exchange · <a href="https://cryptox.in/user/support-tickets" style="color:#484f58">Support</a>
        </div>
      </div>
    `,
    text: `Welcome to CryptoX, ${name}!\n\nYour account is ready. Enable 2FA, complete KYC, and start trading 200+ markets.\n\nhttps://cryptox.in`,
  });
}

/** ─── KYC status emails ─────────────────────────────────────────────────── */
export async function sendKycApprovedEmail(to: string, opts: { name?: string; level: number }): Promise<SendResult> {
  const name = opts.name || "Trader";
  return sendEmail({
    to,
    subject: `KYC Level ${opts.level} Approved — CryptoX`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;border:1px solid #30363d">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:24px;font-weight:700;color:#f0b429">CryptoX</div></div>
        <div style="background:#161b22;border:1px solid #3fb950;border-radius:8px;padding:20px;text-align:center;margin-bottom:20px">
          <div style="font-size:40px">✅</div>
          <div style="font-size:18px;font-weight:700;color:#3fb950;margin-top:8px">KYC Level ${opts.level} Approved</div>
        </div>
        <p style="color:#e6edf3;font-size:14px;margin:0 0 12px">Hi ${name},</p>
        <p style="color:#7d8590;font-size:14px;margin:0 0 20px;line-height:1.6">Your KYC Level ${opts.level} verification has been <strong style="color:#3fb950">approved</strong>. Your withdrawal limits and trading features have been upgraded.</p>
        <div style="text-align:center">
          <a href="https://cryptox.in/user/wallet" style="display:inline-block;background:#f0b429;color:#000;font-weight:700;font-size:14px;padding:10px 28px;border-radius:8px;text-decoration:none">Go to Wallet</a>
        </div>
        <div style="border-top:1px solid #30363d;margin-top:24px;padding-top:16px;text-align:center;color:#484f58;font-size:11px">
          © ${new Date().getFullYear()} CryptoX
        </div>
      </div>
    `,
  });
}

export async function sendKycRejectedEmail(to: string, opts: { name?: string; level: number; reason: string }): Promise<SendResult> {
  const name = opts.name || "Trader";
  return sendEmail({
    to,
    subject: `KYC Level ${opts.level} Requires Resubmission — CryptoX`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;border:1px solid #30363d">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:24px;font-weight:700;color:#f0b429">CryptoX</div></div>
        <div style="background:#161b22;border:1px solid #f85149;border-radius:8px;padding:20px;text-align:center;margin-bottom:20px">
          <div style="font-size:40px">⚠️</div>
          <div style="font-size:18px;font-weight:700;color:#f85149;margin-top:8px">KYC Level ${opts.level} — Action Required</div>
        </div>
        <p style="color:#e6edf3;font-size:14px;margin:0 0 12px">Hi ${name},</p>
        <p style="color:#7d8590;font-size:14px;margin:0 0 16px;line-height:1.6">Your KYC Level ${opts.level} submission could not be approved. Please review the reason below and resubmit.</p>
        <div style="background:#1c1112;border:1px solid #f85149;border-radius:8px;padding:14px;margin-bottom:20px">
          <div style="font-size:12px;color:#f85149;font-weight:600;margin-bottom:4px">Reason</div>
          <div style="font-size:14px;color:#e6edf3">${opts.reason}</div>
        </div>
        <p style="color:#7d8590;font-size:12px;margin:0 0 20px">Ensure documents are clear, well-lit, and match your registered details exactly. Screenshots are not accepted.</p>
        <div style="text-align:center">
          <a href="https://cryptox.in/user/kyc" style="display:inline-block;background:#f0b429;color:#000;font-weight:700;font-size:14px;padding:10px 28px;border-radius:8px;text-decoration:none">Resubmit KYC</a>
        </div>
        <div style="border-top:1px solid #30363d;margin-top:24px;padding-top:16px;text-align:center;color:#484f58;font-size:11px">
          © ${new Date().getFullYear()} CryptoX
        </div>
      </div>
    `,
  });
}

/** ─── Withdrawal emails ─────────────────────────────────────────────────── */
export async function sendWithdrawalInitiatedEmail(to: string, opts: {
  amount: string; currency: string; address?: string; method: string; txId?: string;
}): Promise<SendResult> {
  return sendEmail({
    to,
    subject: `Withdrawal of ${opts.currency} ${opts.amount} Initiated — CryptoX`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;border:1px solid #30363d">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:24px;font-weight:700;color:#f0b429">CryptoX</div></div>
        <h2 style="font-size:18px;font-weight:600;margin:0 0 16px">Withdrawal Initiated 🔄</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
          <tr><td style="color:#7d8590;padding:6px 0">Asset</td><td style="text-align:right;font-weight:600">${opts.currency}</td></tr>
          <tr><td style="color:#7d8590;padding:6px 0">Amount</td><td style="text-align:right;font-family:monospace;font-weight:700">${opts.amount}</td></tr>
          <tr><td style="color:#7d8590;padding:6px 0">Method</td><td style="text-align:right">${opts.method}</td></tr>
          ${opts.address ? `<tr><td style="color:#7d8590;padding:6px 0">Address</td><td style="text-align:right;font-family:monospace;font-size:11px;word-break:break-all">${opts.address}</td></tr>` : ""}
          ${opts.txId ? `<tr><td style="color:#7d8590;padding:6px 0">Tx ID</td><td style="text-align:right;font-family:monospace;font-size:11px">${opts.txId}</td></tr>` : ""}
        </table>
        <div style="background:#161b22;border:1px solid #f0b429;border-radius:8px;padding:12px;font-size:12px;color:#7d8590">
          ⏱ Your withdrawal is under risk review. Processing typically completes within 30 minutes for crypto and up to 2 hours for INR transfers.
        </div>
        <p style="color:#484f58;font-size:11px;margin-top:20px;text-align:center">If you did not initiate this withdrawal, contact support immediately.</p>
        <div style="border-top:1px solid #30363d;margin-top:16px;padding-top:16px;text-align:center;color:#484f58;font-size:11px">
          © ${new Date().getFullYear()} CryptoX
        </div>
      </div>
    `,
  });
}

export async function sendWithdrawalCompletedEmail(to: string, opts: {
  amount: string; currency: string; txHash?: string; method: string;
}): Promise<SendResult> {
  return sendEmail({
    to,
    subject: `Withdrawal of ${opts.currency} ${opts.amount} Completed — CryptoX`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;border:1px solid #30363d">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:24px;font-weight:700;color:#f0b429">CryptoX</div></div>
        <h2 style="font-size:18px;font-weight:600;margin:0 0 16px">Withdrawal Completed ✅</h2>
        <div style="background:#161b22;border:1px solid #3fb950;border-radius:8px;padding:20px;text-align:center;margin-bottom:20px">
          <div style="font-size:28px;font-weight:700;color:#f85149">−${opts.currency} ${opts.amount}</div>
          <div style="color:#7d8590;font-size:13px;margin-top:4px">via ${opts.method}</div>
        </div>
        ${opts.txHash ? `<p style="color:#7d8590;font-size:12px;word-break:break-all"><strong style="color:#e6edf3">Tx Hash:</strong> ${opts.txHash}</p>` : ""}
        <p style="color:#7d8590;font-size:14px;margin-top:12px">Your funds have been sent. Please allow time for network confirmation.</p>
        <div style="border-top:1px solid #30363d;margin-top:24px;padding-top:16px;text-align:center;color:#484f58;font-size:11px">
          © ${new Date().getFullYear()} CryptoX
        </div>
      </div>
    `,
  });
}

/** ─── Security alert email ──────────────────────────────────────────────── */
export async function sendSecurityAlertEmail(to: string, opts: {
  event: string; ip?: string; device?: string; time?: string;
}): Promise<SendResult> {
  const time = opts.time || new Date().toUTCString();
  return sendEmail({
    to,
    subject: `Security Alert: ${opts.event} — CryptoX`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;border:1px solid #30363d">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:24px;font-weight:700;color:#f0b429">CryptoX</div></div>
        <div style="background:#1c1112;border:1px solid #f85149;border-radius:8px;padding:16px;margin-bottom:20px">
          <div style="font-size:16px;font-weight:700;color:#f85149">🚨 Security Alert</div>
          <div style="font-size:14px;color:#e6edf3;margin-top:6px">${opts.event}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
          <tr><td style="color:#7d8590;padding:5px 0">Time</td><td style="text-align:right">${time}</td></tr>
          ${opts.ip ? `<tr><td style="color:#7d8590;padding:5px 0">IP Address</td><td style="text-align:right;font-family:monospace">${opts.ip}</td></tr>` : ""}
          ${opts.device ? `<tr><td style="color:#7d8590;padding:5px 0">Device</td><td style="text-align:right">${opts.device}</td></tr>` : ""}
        </table>
        <p style="color:#7d8590;font-size:13px;margin:0 0 16px">If this was you, no action is needed. If this was <strong style="color:#f85149">not you</strong>, take these steps immediately:</p>
        <ol style="color:#7d8590;font-size:13px;padding-left:20px;margin:0 0 20px;line-height:2">
          <li>Change your password</li>
          <li>Enable or reset 2FA</li>
          <li>Revoke all active sessions from Settings → Security</li>
          <li>Open a high-priority support ticket</li>
        </ol>
        <div style="text-align:center">
          <a href="https://cryptox.in/user/settings" style="display:inline-block;background:#f85149;color:#fff;font-weight:700;font-size:14px;padding:10px 28px;border-radius:8px;text-decoration:none">Secure My Account</a>
        </div>
        <div style="border-top:1px solid #30363d;margin-top:24px;padding-top:16px;text-align:center;color:#484f58;font-size:11px">
          © ${new Date().getFullYear()} CryptoX
        </div>
      </div>
    `,
  });
}

/** ─── New login notification email ─────────────────────────────────────── */
export async function sendNewLoginEmail(to: string, opts: {
  ip?: string; device?: string; location?: string; time?: string;
}): Promise<SendResult> {
  const time = opts.time || new Date().toUTCString();
  return sendEmail({
    to,
    subject: "New Sign-In to Your CryptoX Account",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;border:1px solid #30363d">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:24px;font-weight:700;color:#f0b429">CryptoX</div></div>
        <h2 style="font-size:18px;font-weight:600;margin:0 0 16px">New Sign-In Detected 🔑</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
          <tr><td style="color:#7d8590;padding:6px 0">Time</td><td style="text-align:right">${time}</td></tr>
          ${opts.ip ? `<tr><td style="color:#7d8590;padding:6px 0">IP Address</td><td style="text-align:right;font-family:monospace">${opts.ip}</td></tr>` : ""}
          ${opts.location ? `<tr><td style="color:#7d8590;padding:6px 0">Location</td><td style="text-align:right">${opts.location}</td></tr>` : ""}
          ${opts.device ? `<tr><td style="color:#7d8590;padding:6px 0">Device / Browser</td><td style="text-align:right">${opts.device}</td></tr>` : ""}
        </table>
        <p style="color:#7d8590;font-size:13px;margin:0 0 20px">If this sign-in was you, no action is needed. If you don't recognise this activity, secure your account immediately.</p>
        <div style="text-align:center">
          <a href="https://cryptox.in/user/settings" style="display:inline-block;background:#f0b429;color:#000;font-weight:700;font-size:14px;padding:10px 28px;border-radius:8px;text-decoration:none">Review Sessions</a>
        </div>
        <div style="border-top:1px solid #30363d;margin-top:24px;padding-top:16px;text-align:center;color:#484f58;font-size:11px">
          © ${new Date().getFullYear()} CryptoX
        </div>
      </div>
    `,
  });
}

/** ─── Password reset email ──────────────────────────────────────────────── */
export async function sendPasswordResetEmail(to: string, opts: { resetLink: string; expiresMinutes?: number }): Promise<SendResult> {
  const exp = opts.expiresMinutes ?? 30;
  return sendEmail({
    to,
    subject: "Reset Your CryptoX Password",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;border:1px solid #30363d">
        <div style="text-align:center;margin-bottom:24px">
          <div style="font-size:28px;font-weight:700;color:#f0b429">CryptoX</div>
          <div style="color:#7d8590;font-size:13px;margin-top:4px">India's Professional Crypto Exchange</div>
        </div>
        <h2 style="font-size:18px;font-weight:600;margin:0 0 8px">Password Reset Request</h2>
        <p style="color:#7d8590;font-size:14px;margin:0 0 24px">We received a request to reset your CryptoX password. Click the button below to set a new password. This link expires in <strong>${exp} minutes</strong>.</p>
        <div style="text-align:center;margin-bottom:24px">
          <a href="${opts.resetLink}" style="display:inline-block;background:#f0b429;color:#000;font-weight:700;font-size:14px;padding:12px 32px;border-radius:8px;text-decoration:none">Reset Password</a>
        </div>
        <p style="color:#7d8590;font-size:12px;margin:0 0 8px">Or copy this link into your browser:</p>
        <p style="color:#7d8590;font-size:11px;word-break:break-all;margin:0 0 20px;font-family:monospace">${opts.resetLink}</p>
        <p style="color:#484f58;font-size:12px;margin:0">If you did not request a password reset, please ignore this email. Your password will not change.</p>
        <div style="border-top:1px solid #30363d;margin-top:24px;padding-top:16px;text-align:center;color:#484f58;font-size:11px">
          © ${new Date().getFullYear()} CryptoX
        </div>
      </div>
    `,
    text: `Reset your CryptoX password by visiting: ${opts.resetLink}\n\nThis link expires in ${exp} minutes. If you didn't request this, ignore this email.`,
  });
}

/** ─── AI trading plan credited email ───────────────────────────────────── */
export async function sendAiEarningEmail(to: string, opts: {
  planName: string; amountUsdt: string; totalEarnedUsdt: string;
}): Promise<SendResult> {
  return sendEmail({
    to,
    subject: `AI Trade Earning of $${opts.amountUsdt} USDT Credited — CryptoX`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;border:1px solid #30363d">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:24px;font-weight:700;color:#f0b429">CryptoX</div></div>
        <div style="background:#130d1f;border:1px solid #7c3aed;border-radius:8px;padding:20px;text-align:center;margin-bottom:20px">
          <div style="font-size:13px;color:#a78bfa;margin-bottom:6px">🤖 AI Trading Earning</div>
          <div style="font-size:32px;font-weight:700;color:#a78bfa">+$${opts.amountUsdt} USDT</div>
          <div style="color:#7d8590;font-size:13px;margin-top:6px">Plan: ${opts.planName}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
          <tr><td style="color:#7d8590;padding:6px 0">Total Earned (plan)</td><td style="text-align:right;font-family:monospace;font-weight:700;color:#a78bfa">$${opts.totalEarnedUsdt} USDT</td></tr>
        </table>
        <p style="color:#7d8590;font-size:13px">Earnings have been credited to your spot wallet. View full history on your <a href="https://cryptox.in/user/ledger" style="color:#f0b429;text-decoration:none">Fund Ledger</a>.</p>
        <div style="border-top:1px solid #30363d;margin-top:24px;padding-top:16px;text-align:center;color:#484f58;font-size:11px">
          © ${new Date().getFullYear()} CryptoX
        </div>
      </div>
    `,
  });
}

/** ─── P2P order matched email ───────────────────────────────────────────── */
export async function sendP2PMatchedEmail(to: string, opts: {
  orderId: string; side: "buy" | "sell"; amount: string; currency: string;
  price: string; counterparty: string; paymentMethod: string;
}): Promise<SendResult> {
  const isSell = opts.side === "sell";
  return sendEmail({
    to,
    subject: `P2P Order Matched — ${isSell ? "Sell" : "Buy"} ${opts.amount} ${opts.currency}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;border:1px solid #30363d">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:24px;font-weight:700;color:#f0b429">CryptoX P2P</div></div>
        <h2 style="font-size:18px;font-weight:600;margin:0 0 16px">Order Matched ✅</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
          <tr><td style="color:#7d8590;padding:6px 0">Order ID</td><td style="text-align:right;font-family:monospace">#${opts.orderId}</td></tr>
          <tr><td style="color:#7d8590;padding:6px 0">Side</td><td style="text-align:right;color:${isSell?"#f85149":"#3fb950"};font-weight:700;text-transform:uppercase">${opts.side}</td></tr>
          <tr><td style="color:#7d8590;padding:6px 0">Amount</td><td style="text-align:right;font-family:monospace">${opts.amount} ${opts.currency}</td></tr>
          <tr><td style="color:#7d8590;padding:6px 0">Price</td><td style="text-align:right;font-family:monospace">₹${opts.price}</td></tr>
          <tr><td style="color:#7d8590;padding:6px 0">Counterparty</td><td style="text-align:right">${opts.counterparty}</td></tr>
          <tr><td style="color:#7d8590;padding:6px 0">Payment Method</td><td style="text-align:right">${opts.paymentMethod}</td></tr>
        </table>
        <p style="color:#7d8590;font-size:13px;margin:0 0 16px">${isSell ? "Wait for the buyer to complete payment, then release the crypto from escrow." : "Complete the payment within the time limit, then mark it as paid."}</p>
        <div style="text-align:center">
          <a href="https://cryptox.in/user/p2p" style="display:inline-block;background:#f0b429;color:#000;font-weight:700;font-size:14px;padding:10px 28px;border-radius:8px;text-decoration:none">View Order</a>
        </div>
        <div style="border-top:1px solid #30363d;margin-top:24px;padding-top:16px;text-align:center;color:#484f58;font-size:11px">
          © ${new Date().getFullYear()} CryptoX
        </div>
      </div>
    `,
  });
}

/** ─── Referral bonus email ──────────────────────────────────────────────── */
export async function sendReferralBonusEmail(to: string, opts: {
  bonusUsdt: string; referredUser: string;
}): Promise<SendResult> {
  return sendEmail({
    to,
    subject: `You Earned a Referral Bonus of $${opts.bonusUsdt} USDT — CryptoX`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;border:1px solid #30363d">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:24px;font-weight:700;color:#f0b429">CryptoX</div></div>
        <div style="background:#161b22;border:1px solid #f0b429;border-radius:8px;padding:20px;text-align:center;margin-bottom:20px">
          <div style="font-size:13px;color:#f0b429;margin-bottom:6px">🎁 Referral Bonus</div>
          <div style="font-size:32px;font-weight:700;color:#f0b429">+$${opts.bonusUsdt} USDT</div>
          <div style="color:#7d8590;font-size:13px;margin-top:6px">${opts.referredUser} joined using your referral link</div>
        </div>
        <p style="color:#7d8590;font-size:14px">Your bonus has been credited to your spot wallet. Keep sharing your referral link to earn more!</p>
        <div style="text-align:center;margin-top:20px">
          <a href="https://cryptox.in/user/referrals" style="display:inline-block;background:#f0b429;color:#000;font-weight:700;font-size:14px;padding:10px 28px;border-radius:8px;text-decoration:none">View Referrals</a>
        </div>
        <div style="border-top:1px solid #30363d;margin-top:24px;padding-top:16px;text-align:center;color:#484f58;font-size:11px">
          © ${new Date().getFullYear()} CryptoX
        </div>
      </div>
    `,
  });
}
