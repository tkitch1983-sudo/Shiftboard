// Shiftboard sender: isolated delegated connection. Connection plus one fixed-recipient setup test; no schedules are activated.
// No Microsoft tokens or service credentials are returned to the browser.
const CLIENT_ID = "79a5c576-5ded-4d41-95cb-48e514ba32c3";
const TENANT_ID = "37fc2f44-6eb7-42b2-9c1f-792abab41652";
const EXPECTED_MAILBOX = "shiftboard@neautoservices.com";
const AUTH_BASE = "https://login.microsoftonline.com/" + TENANT_ID + "/oauth2/v2.0";
const SCOPE = "offline_access User.Read Mail.Send";
const SESSION_LIMIT_MS = 25 * 60 * 1000;
const STORE_URL = Deno.env.get("SUPABASE_URL") || "";
const STORE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const WEB_ORIGIN = "https://northeastautoservices.pages.dev";
const WEB_PAGE = WEB_ORIGIN + "/sender-connect.html";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": WEB_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin"
};

function reply(status: number, result: Record<string, unknown>) {
  return Response.json(result, { status, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer", ...CORS_HEADERS
  }});
}
async function db(tableAndQuery: string, method = "GET", body?: unknown, prefer?: string): Promise<any> {
  if (!STORE_URL || !STORE_KEY) throw new Error("Server not configured");
  const headers: Record<string,string> = { "apikey": STORE_KEY,
    "Authorization": "Bearer " + STORE_KEY, "Accept": "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers["Prefer"] = prefer;
  const response = await fetch(STORE_URL + "/rest/v1/" + tableAndQuery, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("Storage operation failed");
  const content = await response.text();
  return content ? JSON.parse(content) : null;
}
function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map(x => x.toString(16).padStart(2, "0")).join("");
}
async function digest(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}
function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
async function cryptoKey(): Promise<CryptoKey> {
  // Encryption key stays in the Edge Function environment; never written to GitHub or browser.
  // Reconnect this mailbox before rotating the Supabase service-role key.
  const material = new TextEncoder().encode("shiftboard-sender-ms-graph-v1:" + STORE_KEY);
  const bytes = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encrypt(value: string): Promise<{ciphertext: string, iv: string}> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(value);
  const result = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), data);
  return { ciphertext: b64(new Uint8Array(result)), iv: b64(iv) };
}
async function decrypt(ciphertext: string, iv: string): Promise<string> {
  const buf = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const nonce = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const result = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, await cryptoKey(), buf);
  return new TextDecoder().decode(result);
}
async function msTokenPost(url: string, data: Record<string,string>) {
  const response = await fetch(url, { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
    body: new URLSearchParams(data), signal: AbortSignal.timeout(15000) });
  const payload = await response.json();
  return { response, payload };
}
async function validInvite(invite: string, allowUsed = false) {
  if (!/^[a-f0-9]{64}$/.test(invite)) return null;
  const hashed = await digest(invite);
  const q = "sender_outlook_connect_invites?select=id,expires_at,used_at&token_sha256=eq." +
    hashed + (allowUsed ? "" : "&used_at=is.null") + "&expires_at=gt." + encodeURIComponent(new Date().toISOString()) +
    "&limit=1";
  const rows = await db(q);
  return rows && rows.length === 1 ? rows[0] : null;
}
async function connectionStart(invite: string) {
  const row = await validInvite(invite);
  if (!row) return reply(403, { error: "This invitation is missing, used or expired." });
  const existing = await db("sender_outlook_connect_sessions?select=id,user_code,expires_at,status,interval_seconds&invite_id=eq." + row.id + "&limit=1");
  if (existing && existing.length) {
    const session = existing[0];
    if (session.status !== "pending" || Date.parse(session.expires_at) < Date.now())
      return reply(403, { error: "This sign-in session has expired. Please request a new link." });
    return reply(200, { ok: true, session_id: session.id, user_code: session.user_code,
      verification_uri: "https://microsoft.com/devicelogin", interval_seconds: session.interval_seconds });
  }
  const { response, payload } = await msTokenPost(AUTH_BASE + "/devicecode", {
    client_id: CLIENT_ID, scope: SCOPE
  });
  if (!response.ok || !payload.device_code || !payload.user_code) {
    return reply(502, { error: "Microsoft sign-in could not be started. Try again later." });
  }
  const device = await encrypt(payload.device_code);
  const interval = Math.min(60, Math.max(5, Number(payload.interval) || 5));
  const expires = new Date(Date.now() + Math.min(SESSION_LIMIT_MS, Number(payload.expires_in || 900) * 1000)).toISOString();
  const inserted = await db("sender_outlook_connect_sessions", "POST", [{
    invite_id: row.id, device_ciphertext: device.ciphertext, device_iv: device.iv,
    user_code: String(payload.user_code), verification_uri: "https://microsoft.com/devicelogin",
    interval_seconds: interval, expires_at: expires, status: "pending"
  }], "return=representation");
  const session = inserted[0];
  return reply(200, { ok: true, session_id: session.id, user_code: session.user_code,
    verification_uri: session.verification_uri, interval_seconds: interval });
}
async function connectionPoll(invite: string, sessionId: string) {
  const row = await validInvite(invite, true);
  if (!row) return reply(403, { error: "This invitation has expired or already been used." });
  if (!/^[a-f0-9-]{36}$/i.test(sessionId)) return reply(400, { error: "Invalid session." });
  const q = "sender_outlook_connect_sessions?select=*&id=eq." + sessionId +
    "&invite_id=eq." + row.id + "&limit=1";
  const matches = await db(q);
  if (!matches.length) return reply(404, { error: "Sign-in session not found." });
  const session = matches[0];
  if (session.status === "connected") return reply(200, { status: "connected", mailbox: EXPECTED_MAILBOX });
  if (row.used_at) return reply(403, { error: "Invitation already used." });
  if (session.status === "processing") {
    if (Date.now() - Date.parse(session.last_polled_at) > 60000)
      return reply(409, { error: "The connection check was interrupted. Please return to the chat for a fresh link." });
    return reply(200, { status: "pending", interval_seconds: 6 });
  }
  if (session.status !== "pending" || Date.parse(session.expires_at) <= Date.now()) {
    return reply(403, { error: "Sign-in session has ended. Request a new link." });
  }
  const interval = Math.max(5, Number(session.interval_seconds) || 5);
  if (session.last_polled_at && Date.now() - Date.parse(session.last_polled_at) < interval * 1000) {
    return reply(200, { status: "pending", interval_seconds: interval });
  }
  const claimed = await db("sender_outlook_connect_sessions?id=eq." + session.id + "&status=eq.pending",
    "PATCH", { status: "processing", last_polled_at: new Date().toISOString() }, "return=representation");
  if (!claimed?.length) return reply(200, { status: "pending", interval_seconds: interval });
  const device = await decrypt(session.device_ciphertext, session.device_iv);
  const { response, payload } = await msTokenPost(AUTH_BASE + "/token", {
    client_id: CLIENT_ID, grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    device_code: device
  });
  if (!response.ok) {
    if (payload.error === "authorization_pending" || payload.error === "slow_down") {
      const next = payload.error === "slow_down" ? Math.min(60, interval + 5) : interval;
      await db("sender_outlook_connect_sessions?id=eq." + session.id,
        "PATCH", { status: "pending", interval_seconds: next }, "return=minimal");
      return reply(200, { status: "pending", interval_seconds: next });
    }
    if (payload.error === "expired_token" || payload.error === "access_denied" || payload.error === "authorization_declined") {
      await db("sender_outlook_connect_sessions?id=eq." + session.id,
        "PATCH", { status: "failed" }, "return=minimal");
      return reply(403, { error: "Sign-in expired or was declined. Request a fresh link." });
    }
    return reply(502, { error: "Microsoft sign-in is unavailable. Please try again shortly." });
  }
  if (!String(payload.scope || "").split(/\s+/).some(s => s.toLowerCase().replace("https://graph.microsoft.com/", "") === "mail.send"))
    return reply(403, { error: "Microsoft did not grant Mail.Send. Add the delegated permission and authorise again with a fresh link." });
  if (!payload.access_token || !payload.refresh_token)
    return reply(502, { error: "Microsoft did not grant offline access. Check the delegated permissions and try again." });
  const who = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { Authorization: "Bearer " + payload.access_token },
    signal: AbortSignal.timeout(15000)
  });
  if (!who.ok) return reply(502, { error: "Microsoft identity check failed." });
  const profile = await who.json();
  const mail = String(profile.mail || "").trim().toLowerCase();
  const upn = String(profile.userPrincipalName || "").trim().toLowerCase();
  if (mail !== EXPECTED_MAILBOX && upn !== EXPECTED_MAILBOX) {
    await db("sender_outlook_connect_sessions?id=eq." + session.id,
      "PATCH", { status: "failed" }, "return=minimal");
    return reply(403, { error: "Wrong account. Sign in using shiftboard@neautoservices.com." });
  }
  const encrypted = await encrypt(payload.refresh_token);
  await db("sender_outlook_mailbox_connections?on_conflict=mailbox", "POST", [{
    mailbox: EXPECTED_MAILBOX, encrypted_refresh_token: encrypted.ciphertext,
    refresh_iv: encrypted.iv, client_id: CLIENT_ID, tenant_id: TENANT_ID,
    granted_scopes: String(payload.scope || ""), connected_at: new Date().toISOString(),
    last_verified_at: new Date().toISOString()
  }], "resolution=merge-duplicates,return=minimal");
  await db("sender_outlook_connect_sessions?id=eq." + session.id,
    "PATCH", { status: "connected", device_ciphertext: "", device_iv: "" }, "return=minimal");
  await db("sender_outlook_connect_invites?id=eq." + row.id,
    "PATCH", { used_at: new Date().toISOString() }, "return=minimal");
  return reply(200, { status: "connected", mailbox: EXPECTED_MAILBOX });
}
// One setup test per connection invitation. Recipient and content are fixed server-side.
async function sendSetupTest(invite: string) {
  const row = await validInvite(invite, true);
  if (!row || !row.used_at) return reply(403, { error: "A completed connection invitation is required." });
  const sessions = await db("sender_outlook_connect_sessions?select=id,status,test_status&invite_id=eq." + row.id + "&limit=1");
  const session = sessions?.[0];
  if (!session || session.status !== "connected") return reply(403, { error: "Connect the mailbox first." });
  if (session.test_status !== "not_sent") return reply(200, { status: session.test_status, already_attempted: true });
  const claimed = await db("sender_outlook_connect_sessions?id=eq." + session.id + "&test_status=eq.not_sent", "PATCH",
    { test_status: "preparing", test_attempted_at: new Date().toISOString() }, "return=representation");
  if (!claimed?.length) return reply(409, { error: "Test already being prepared." });
  let submitting = false;
  try {
    const rows = await db("sender_outlook_mailbox_connections?select=*&mailbox=eq." + EXPECTED_MAILBOX + "&limit=1");
    const connection = rows?.[0];
    if (!connection || connection.client_id !== CLIENT_ID || connection.tenant_id !== TENANT_ID) throw new Error("Connection unavailable");
    const refresh = await decrypt(connection.encrypted_refresh_token, connection.refresh_iv);
    const { response, payload } = await msTokenPost(AUTH_BASE + "/token", {
      client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: refresh, scope: SCOPE
    });
    if (!response.ok || !payload.access_token || !String(payload.scope || "").split(/\s+/).some(s => s.toLowerCase().replace("https://graph.microsoft.com/", "") === "mail.send"))
      throw new Error("Microsoft sending authorisation failed");
    if (payload.refresh_token) {
      const encrypted = await encrypt(payload.refresh_token);
      await db("sender_outlook_mailbox_connections?mailbox=eq." + EXPECTED_MAILBOX, "PATCH", {
        encrypted_refresh_token: encrypted.ciphertext, refresh_iv: encrypted.iv,
        granted_scopes: String(payload.scope), last_verified_at: new Date().toISOString()
      }, "return=minimal");
    }
    const who = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
      headers: { Authorization: "Bearer " + payload.access_token }, signal: AbortSignal.timeout(15000)
    });
    if (!who.ok) throw new Error("Identity check failed");
    const profile = await who.json();
    if (![profile.mail, profile.userPrincipalName].some(v => String(v || "").toLowerCase() === EXPECTED_MAILBOX))
      throw new Error("Unexpected sender");
    const html = `<!doctype html><html lang="en"><body style="margin:0;background:#edf2f7;font-family:Arial,sans-serif;color:#172b43;padding:24px"><table role="presentation" style="max-width:600px;width:100%;margin:auto;border-collapse:collapse;background:white"><tr><td style="padding:28px;background:#10233a;color:white;font-size:24px;font-weight:bold">SHIFTBOARD</td></tr><tr><td style="padding:28px"><p style="font-size:12px;color:#287353;font-weight:bold;letter-spacing:1px">EMAIL CONNECTION TEST</p><h1 style="font-size:25px">Your new sender is connected</h1><p>Hi Tony,</p><p>This HTML email was sent directly by Shiftboard using <strong>shiftboard@neautoservices.com</strong>.</p><table role="presentation" style="width:100%;background:#f0f5f9;padding:16px;line-height:1.8"><tr><td><strong>From</strong></td><td>shiftboard@neautoservices.com</td></tr><tr><td><strong>To</strong></td><td>tony@neautoservices.com only</td></tr><tr><td><strong>Mode</strong></td><td>Setup test — automatic schedules remain off</td></tr></table><p>No centre or staff recipients have been included.</p><p>Once delivery is confirmed, we can finish configuring the reports and notifications.</p><p style="color:#607080;font-size:12px">North East Auto Services · Shiftboard<br>Reference: SB-SENDER-SETUP-${session.id}</p></td></tr></table></body></html>`;
    await db("sender_outlook_connect_sessions?id=eq." + session.id, "PATCH", { test_status: "sending" }, "return=minimal");
    submitting = true;
    const result = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST", headers: { Authorization: "Bearer " + payload.access_token, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ message: { subject: "Shiftboard — new email sender test", body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: "tony@neautoservices.com" } }] }, saveToSentItems: true })
    });
    const status = result.status === 202 ? "accepted" : "rejected";
    await db("sender_outlook_connect_sessions?id=eq." + session.id, "PATCH", {
      test_status: status, test_http_status: result.status, test_finished_at: new Date().toISOString()
    }, "return=minimal");
    return reply(result.status === 202 ? 200 : 502, { status, microsoft_status: result.status,
      sender: EXPECTED_MAILBOX, recipient: "tony@neautoservices.com", delivery_confirmed: false });
  } catch (_e) {
    // Never automatically retry a potentially accepted send.
    await db("sender_outlook_connect_sessions?id=eq." + session.id, "PATCH", {
      test_status: submitting ? "unknown" : "failed", test_finished_at: new Date().toISOString()
    }, "return=minimal");
    return reply(502, { error: submitting ? "Delivery outcome unknown. Check Tony's inbox before any retry." : "Test preparation failed. No email was submitted." });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    // Supabase's shared function domain intentionally rewrites HTML to text/plain.
    // A 302 Location without a fragment preserves the caller's #invite fragment.
    return new Response(null, { status: 302, headers: {
      "Location": WEB_PAGE, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"
    } });
  }
  if (req.method === "OPTIONS") {
    if (req.headers.get("Origin") !== WEB_ORIGIN) return reply(403, { error: "Invalid origin." });
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  if (req.headers.get("Origin") !== WEB_ORIGIN)
    return reply(403, { error: "Invalid origin." });
  if ((Number(req.headers.get("Content-Length") || 0)) > 4096)
    return reply(413, { error: "Request too large." });
  try {
    const raw = await req.text();
    if (raw.length > 4096) return reply(413, { error: "Request too large." });
    const body = JSON.parse(raw);
    const invite = String(body.invite || "");
    if (body.action === "test") return await sendSetupTest(invite);
    if (body.action === "start") return await connectionStart(invite);
    if (body.action === "poll") return await connectionPoll(invite, String(body.session_id || ""));
    return reply(400, { error: "Unknown request." });
  } catch (e) {
    console.error("Outlook connect request failed", e instanceof Error ? e.name : "unknown");
    return reply(500, { error: "Connection service temporarily unavailable." });
  }
});

