import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function cors(): Response {
  return new Response("ok", { headers: CORS_HEADERS });
}

function adminDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const BRAND = {
  name: "Engagera",
  company: "AfuChat Technologies Limited",
  domain: "https://engagera.afuchat.com",
  logoUrl: "https://engagera.afuchat.com/logo.png",
  fromEmail: "noreply@afuchat.com",
  fromName: "Engagera",
  year: new Date().getFullYear(),
};

// ── HTML email — dark, monochrome, matches the app exactly ────────────────────
function buildEmailHtml(resetUrl: string, recipientEmail: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no"/>
  <title>Reset your Engagera password</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#000000;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <!--[if !vml]><!-->
  <span style="display:none;font-size:1px;color:#000000;max-height:0;overflow:hidden;opacity:0;">
    Reset your Engagera password &mdash; this link is valid for 1&nbsp;hour.
    &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </span>
  <!--<![endif]-->

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#000000;">
    <tr>
      <td align="center" style="padding:48px 16px 56px;">

        <!-- Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">

          <!-- ── Wordmark ── -->
          <tr>
            <td align="left" style="padding-bottom:36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:9px;">
                    <img src="${BRAND.logoUrl}" alt="Engagera" width="28" height="28"
                         style="display:block;border-radius:6px;width:28px;height:28px;border:0;outline:0;"/>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:16px;font-weight:700;color:#f4f4f5;letter-spacing:-0.3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">Engagera</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Card ── -->
          <tr>
            <td style="background-color:#0d0d0d;border:1px solid #1c1c1c;border-radius:12px;padding:36px 36px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

                <!-- Lock mark — pure table/text, works in Outlook & all clients -->
                <tr>
                  <td style="padding-bottom:22px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="40" height="40" style="width:40px;height:40px;background-color:#141414;border:1px solid #262626;border-radius:8px;text-align:center;vertical-align:middle;font-size:18px;line-height:40px;color:#a1a1aa;font-family:Arial,sans-serif;">
                          &#128274;
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Heading -->
                <tr>
                  <td style="padding-bottom:10px;">
                    <h1 style="margin:0;font-size:20px;font-weight:700;color:#f4f4f5;letter-spacing:-0.4px;line-height:1.3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                      Reset your password
                    </h1>
                  </td>
                </tr>

                <!-- Body text -->
                <tr>
                  <td style="padding-bottom:28px;">
                    <p style="margin:0;font-size:14px;color:#a1a1aa;line-height:1.65;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                      We received a request to reset the password for the account linked to
                      <strong style="color:#d4d4d8;font-weight:500;">${recipientEmail}</strong>.
                      Click the button below to create a new password.
                      This link is valid for <strong style="color:#d4d4d8;font-weight:500;">1 hour</strong>.
                    </p>
                  </td>
                </tr>

                <!-- CTA button — white on black, matches app exactly -->
                <tr>
                  <td style="padding-bottom:28px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${resetUrl}" style="height:42px;v-text-anchor:middle;width:180px;" arcsize="18%" fillcolor="#ffffff" strokecolor="#ffffff">
                      <w:anchorlock/>
                      <center style="color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;">Reset password</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:11px 24px;background-color:#ffffff;color:#000000;font-size:14px;font-weight:600;text-decoration:none;border-radius:7px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:-0.1px;mso-hide:all;">
                      Reset password &rarr;
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="border-top:1px solid #1c1c1c;padding-top:22px;">
                    <p style="margin:0;font-size:12px;color:#71717a;line-height:1.65;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                      If you didn't request a password reset, you can safely ignore this email. Your account is secure and your password will not change.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="padding-top:28px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#52525b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                <a href="${BRAND.domain}" style="color:#52525b;text-decoration:none;font-weight:500;">Engagera</a>
                &nbsp;&middot;&nbsp;
                AfuChat Technologies Limited
              </p>
              <p style="margin:0;font-size:11px;color:#3f3f46;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                This security email was sent to ${recipientEmail}.
                &copy; ${BRAND.year} AfuChat Technologies Limited.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

// ── Plain text version (critical for spam score) ──────────────────────────────
function buildEmailText(resetUrl: string, recipientEmail: string): string {
  return [
    `Reset your Engagera password`,
    ``,
    `We received a request to reset the password for the Engagera account linked to ${recipientEmail}.`,
    ``,
    `Click the link below to create a new password (valid for 1 hour):`,
    ``,
    resetUrl,
    ``,
    `If you did not request this, you can ignore this email. Your password will not change.`,
    ``,
    `--`,
    `Engagera by AfuChat Technologies Limited`,
    `${BRAND.domain}`,
    `(c) ${BRAND.year} AfuChat Technologies Limited`,
  ].join("\n");
}

// ── Handler ────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return cors();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let email: string;
  try {
    const body = await req.json();
    email = (body.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) return json({ error: "Invalid email address" }, 400);
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json({ error: "Email service not configured" }, 500);

  try {
    // Generate a Supabase password recovery link via admin API
    const admin = adminDb();
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${BRAND.domain}/reset-password`,
      },
    });

    if (linkError) {
      // Prevent email enumeration — silently succeed if user not found
      if (
        linkError.message?.toLowerCase().includes("not found") ||
        linkError.message?.toLowerCase().includes("no user") ||
        linkError.message?.toLowerCase().includes("unable to find")
      ) {
        return json({ success: true });
      }
      console.error("generateLink error:", linkError.message);
      return json({ error: "Failed to generate reset link" }, 500);
    }

    const resetUrl = linkData?.properties?.action_link;
    if (!resetUrl) return json({ error: "Could not produce reset link" }, 500);

    // ── Primary send: noreply@afuchat.com ─────────────────────────────────────
    const sendEmail = async (from: string) => {
      return fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${BRAND.fromName} <${from}>`,
          to: [email],
          reply_to: "support@afuchat.com",
          subject: "Reset your Engagera password",
          html: buildEmailHtml(resetUrl, email),
          text: buildEmailText(resetUrl, email),
          headers: {
            "X-Entity-Ref-ID": `reset-${Date.now()}`,
          },
          tags: [
            { name: "category", value: "password-reset" },
            { name: "product", value: "engagera" },
          ],
        }),
      });
    };

    let emailRes = await sendEmail(BRAND.fromEmail);

    // ── Fallback: Resend's verified sender ────────────────────────────────────
    if (!emailRes.ok) {
      const errBody = await emailRes.json().catch(() => ({}));
      console.error("Resend primary error:", emailRes.status, JSON.stringify(errBody));

      emailRes = await sendEmail("onboarding@resend.dev");

      if (!emailRes.ok) {
        const fallbackErr = await emailRes.text();
        console.error("Resend fallback error:", emailRes.status, fallbackErr);
        return json({ error: "Failed to send email" }, 500);
      }
    }

    return json({ success: true });
  } catch (err) {
    console.error("send-reset-email error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
