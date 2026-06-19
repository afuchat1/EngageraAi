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
  address: "Entebbe Kiooro, Uganda",
  phone: "+256 703 464 913",
  domain: "https://engagera.afuchat.com",
  logoUrl: "https://engagera.afuchat.com/logo.png",
  primaryColor: "#6366f1",
  accentGradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)",
  fromEmail: "noreply@afuchat.com",
  fromName: "Engagera",
  year: new Date().getFullYear(),
};

// ── HTML email template ────────────────────────────────────────────────────────
function buildEmailHtml(resetUrl: string, recipientEmail: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Reset Your Engagera Password</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-text-size-adjust:100%;">

  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;color:#09090b;">
    Reset your Engagera password — your link is valid for 1 hour.
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#09090b;min-height:100vh;">
    <tr>
      <td align="center" valign="top" style="padding:40px 16px 60px;">

        <!-- Content card (max 600px) -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

          <!-- ── Header ── -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <!-- Logo row -->
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:10px;vertical-align:middle;">
                    <div style="width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:8px;display:flex;align-items:center;justify-content:center;">
                      <!-- Stylised "e" mark as SVG encoded inline -->
                      <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
                        <rect width="36" height="36" rx="8" fill="url(#grad)"/>
                        <defs>
                          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#6366f1"/>
                            <stop offset="100%" stop-color="#8b5cf6"/>
                          </linearGradient>
                        </defs>
                        <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle"
                              font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
                              font-size="20" font-weight="700" fill="#ffffff">e</text>
                      </svg>
                    </div>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Engagera</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Main card ── -->
          <tr>
            <td style="border-radius:16px;overflow:hidden;padding:1px;background:linear-gradient(135deg,#6366f1 0%,#4f46e5 40%,#1e1b4b 100%);">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f0f13;border-radius:15px;">
                <tr>
                  <td style="padding:0;">

                    <!-- Top gradient band -->
                    <div style="height:4px;background:linear-gradient(90deg,#6366f1,#8b5cf6,#a78bfa,#6366f1);background-size:200% auto;"></div>

                    <!-- Card body -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:48px 40px 40px;">

                          <!-- Lock icon -->
                          <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                            <tr>
                              <td>
                                <div style="width:56px;height:56px;background:linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.2));border:1px solid rgba(99,102,241,0.3);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;">
                                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="3" y="11" width="18" height="11" rx="2" stroke="#8b5cf6" stroke-width="1.5" stroke-linejoin="round"/>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round"/>
                                    <circle cx="12" cy="16" r="1.5" fill="#a78bfa"/>
                                  </svg>
                                </div>
                              </td>
                            </tr>
                          </table>

                          <!-- Heading -->
                          <h1 style="margin:0 0 12px;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;line-height:1.2;">
                            Password Reset Request
                          </h1>
                          <p style="margin:0 0 28px;font-size:15px;color:#a1a1aa;line-height:1.6;">
                            We received a request to reset the password for your Engagera account associated with
                            <strong style="color:#e4e4e7;">${recipientEmail}</strong>.
                            Click the button below to set a new password.
                          </p>

                          <!-- CTA Button -->
                          <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                            <tr>
                              <td align="left">
                                <a href="${resetUrl}"
                                   style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;letter-spacing:0.1px;mso-padding-alt:14px 32px;">
                                  Reset My Password →
                                </a>
                              </td>
                            </tr>
                          </table>

                          <!-- Expiry notice -->
                          <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;width:100%;">
                            <tr>
                              <td style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:14px 16px;">
                                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                                  <tr>
                                    <td style="width:20px;vertical-align:top;padding-top:1px;padding-right:10px;">
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="12" cy="12" r="9" stroke="#6366f1" stroke-width="1.5"/>
                                        <path d="M12 7v5l3 3" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round"/>
                                      </svg>
                                    </td>
                                    <td style="font-size:13px;color:#a1a1aa;line-height:1.5;">
                                      This link expires in <strong style="color:#c4b5fd;">1 hour</strong>. If you didn't request a reset, you can safely ignore this email — your password won't change.
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>

                          <!-- Divider -->
                          <hr style="border:none;border-top:1px solid #27272a;margin:0 0 24px;" />

                          <!-- Manual link fallback -->
                          <p style="margin:0 0 8px;font-size:12px;color:#71717a;line-height:1.5;">
                            Button not working? Copy and paste this URL into your browser:
                          </p>
                          <p style="margin:0;font-size:11px;color:#6366f1;word-break:break-all;line-height:1.6;">
                            <a href="${resetUrl}" style="color:#6366f1;text-decoration:none;">${resetUrl}</a>
                          </p>

                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Security badge row ── -->
          <tr>
            <td style="padding:24px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:20px;padding:7px 16px;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="padding-right:6px;vertical-align:middle;">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#10b981" stroke-width="1.5" stroke-linejoin="round"/>
                                  <path d="M9 12l2 2 4-4" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                              </td>
                              <td style="font-size:12px;color:#10b981;font-weight:500;">Secured &amp; encrypted by Engagera</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="padding:32px 0 0;">
              <!-- Divider line -->
              <hr style="border:none;border-top:1px solid #18181b;margin:0 0 28px;" />

              <!-- Company info -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <span style="font-size:13px;font-weight:600;color:#e4e4e7;letter-spacing:-0.2px;">AfuChat Technologies Limited</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:20px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <!-- Address -->
                        <td style="padding:0 12px;border-right:1px solid #27272a;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="padding-right:5px;vertical-align:middle;">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#52525b"/>
                                </svg>
                              </td>
                              <td style="font-size:11.5px;color:#52525b;">Entebbe Kiooro, Uganda</td>
                            </tr>
                          </table>
                        </td>
                        <!-- Phone -->
                        <td style="padding:0 12px;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="padding-right:5px;vertical-align:middle;">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" fill="#52525b"/>
                                </svg>
                              </td>
                              <td style="font-size:11.5px;color:#52525b;">
                                <a href="tel:+256703464913" style="color:#52525b;text-decoration:none;">+256 703 464 913</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Links row -->
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <a href="${BRAND.domain}" style="font-size:11.5px;color:#52525b;text-decoration:none;margin:0 10px;">Website</a>
                    <span style="color:#27272a;">·</span>
                    <a href="${BRAND.domain}/docs" style="font-size:11.5px;color:#52525b;text-decoration:none;margin:0 10px;">Documentation</a>
                    <span style="color:#27272a;">·</span>
                    <a href="${BRAND.domain}/sign-in" style="font-size:11.5px;color:#52525b;text-decoration:none;margin:0 10px;">Sign In</a>
                  </td>
                </tr>

                <!-- Copyright -->
                <tr>
                  <td align="center">
                    <p style="margin:0;font-size:11px;color:#3f3f46;line-height:1.6;">
                      &copy; ${BRAND.year} AfuChat Technologies Limited. All rights reserved.<br/>
                      This email was sent to <strong style="color:#3f3f46;">${recipientEmail}</strong> because a password reset was requested.<br/>
                      Engagera is a product of <a href="https://afuchat.com" style="color:#3f3f46;text-decoration:none;">AfuChat Technologies Limited</a>.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

        </table>
        <!-- /Content card -->

      </td>
    </tr>
  </table>
  <!-- /Wrapper -->

</body>
</html>`;
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
      // If the user doesn't exist, return success anyway (prevent email enumeration)
      if (linkError.message?.toLowerCase().includes("not found") ||
          linkError.message?.toLowerCase().includes("no user")) {
        return json({ success: true });
      }
      console.error("generateLink error:", linkError.message);
      return json({ error: "Failed to generate reset link" }, 500);
    }

    const resetUrl = linkData?.properties?.action_link;
    if (!resetUrl) return json({ error: "Could not produce reset link" }, 500);

    // Send the branded email via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${BRAND.fromName} <${BRAND.fromEmail}>`,
        to: [email],
        subject: "Reset your Engagera password",
        html: buildEmailHtml(resetUrl, email),
        tags: [
          { name: "category", value: "password-reset" },
          { name: "product", value: "engagera" },
        ],
      }),
    });

    if (!emailRes.ok) {
      const resendErr = await emailRes.json().catch(() => ({}));
      console.error("Resend error:", emailRes.status, JSON.stringify(resendErr));

      // Fallback: try sending from Resend's verified onboarding domain
      const fallbackRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Engagera <onboarding@resend.dev>",
          to: [email],
          subject: "Reset your Engagera password",
          html: buildEmailHtml(resetUrl, email),
        }),
      });

      if (!fallbackRes.ok) {
        const fallbackErr = await fallbackRes.text();
        console.error("Resend fallback error:", fallbackRes.status, fallbackErr);
        return json({ error: "Failed to send email" }, 500);
      }
    }

    return json({ success: true });
  } catch (err) {
    console.error("send-reset-email handler error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
