// NOTE: cannot use `import "server-only"` here — this file is consumed by
// pages/api/auth/[...nextauth].ts (Pages Router), and the server-only
// package's runtime check throws when imported from any non-App-Router
// context. Server-side use is enforced by convention and by the fact that
// every consumer is a server file (`pages/api/*` or `"use server"` action).

import nodemailer, { type Transporter } from "nodemailer";

/**
 * Mailer infrastructure — Gmail SMTP transport.
 *
 * The transporter is cached on globalThis (matching `src/lib/prisma.ts`) so
 * Next.js hot-reload in dev does not create a new SMTP connection per change.
 *
 * GMAIL_APP_PASSWORD must be a 16-character Gmail App Password — NOT the
 * account password. Generate one at:
 *   Google Account → Security → 2-Step Verification → App passwords
 *
 * Dev fallback: if creds are missing in non-production, sends are logged to
 * the console and a mock { messageId: "dev-mode" } is returned. In production
 * the module throws on load.
 */

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const IS_PROD = process.env.NODE_ENV === "production";
const HAS_CREDS = !!(GMAIL_USER && GMAIL_APP_PASSWORD);

if (IS_PROD && !HAS_CREDS) {
  throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be set in production.");
}

const globalForMailer = globalThis as unknown as {
  mailerTransporter: Transporter | undefined;
};

function getTransporter(): Transporter {
  if (globalForMailer.mailerTransporter) return globalForMailer.mailerTransporter;
  const t = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  if (!IS_PROD) {
    globalForMailer.mailerTransporter = t;
  }
  return t;
}

export interface SendMailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
}

export interface SendMailResult {
  messageId: string;
}

export async function sendMail(args: SendMailArgs): Promise<SendMailResult> {
  if (!HAS_CREDS) {
    // Dev fallback — creds missing in non-production.
    console.log(`[mailer:dev] To: ${args.to} | Subject: ${args.subject}`);
    return { messageId: "dev-mode" };
  }

  const from = args.from ?? GMAIL_USER ?? "no-reply@localhost";
  const info = await getTransporter().sendMail({
    from,
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html,
  });
  return { messageId: info.messageId };
}

/**
 * Sends a 6-digit verification code with both plain-text and HTML bodies.
 * The actual code expiry is owned by the caller; the email simply states 10 min.
 */
export async function sendOtpEmail(to: string, code: string): Promise<SendMailResult> {
  const subject = "Your verification code";

  if (!HAS_CREDS) {
    // Dev fallback — surface the code in the terminal so local OTP flows work.
    console.log(`[mailer:dev] To: ${to} | Subject: ${subject} | Code: ${code}`);
    return { messageId: "dev-mode" };
  }

  const text = [
    `Your verification code is: ${code}`,
    "",
    "This code expires in 10 minutes.",
    "",
    "If you did not request this code, you can safely ignore this email.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
      <tr>
        <td style="padding:32px 32px 8px;">
          <h1 style="margin:0 0 6px;font-size:18px;font-weight:600;color:#1f2937;">Your verification code</h1>
          <p style="margin:0;font-size:13px;color:#6b7280;">Enter this code to finish signing in.</p>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:8px 32px 24px;">
          <div style="display:inline-block;padding:16px 28px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:28px;letter-spacing:8px;font-weight:600;color:#111827;">
            ${escapeHtml(code)}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 28px;">
          <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">This code expires in <strong>10 minutes</strong>.</p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">If you did not request this code, you can safely ignore this email.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return sendMail({ to, subject, text, html });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
