// Shiftboard Jobs: one-time, read-only delegated Outlook connection.
// No Microsoft tokens or service credentials are returned to the browser.
const CLIENT_ID = "79a5c576-5ded-4d41-95cb-48e514ba32c3";
const TENANT_ID = "37fc2f44-6eb7-42b2-9c1f-792abab41652";
const EXPECTED_MAILBOX = "tony@neautoservices.com";
const AUTH_BASE = "https://login.microsoftonline.com/" + TENANT_ID + "/oauth2/v2.0";
const SCOPE = "offline_access User.Read Mail.Read";
const SESSION_LIMIT_MS = 25 * 60 * 1000;
const STORE_URL = Deno.env.get("SUPABASE_URL") || "";
const STORE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const WEB_ORIGIN = "https://northeastautoservices.pages.dev";
const WEB_PAGE = WEB_ORIGIN + "/outlook-connect.html";
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
  // Rotate by reconnecting Tony's mailbox before rotating the Supabase service-role key.
  const material = new TextEncoder().encode("shiftboard-jobs-ms-graph-v1:" + STORE_KEY);
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
async function validInvite(invite: string) {
  if (!/^[a-f0-9]{64}$/.test(invite)) return null;
  const hashed = await digest(invite);
  const q = "jobs_outlook_connect_invites?select=id,expires_at,used_at&token_sha256=eq." +
    hashed + "&used_at=is.null&expires_at=gt." + encodeURIComponent(new Date().toISOString()) +
    "&limit=1";
  const rows = await db(q);
  return rows && rows.length === 1 ? rows[0] : null;
}
async function connectionStart(invite: string) {
  const row = await validInvite(invite);
  if (!row) return reply(403, { error: "This invitation is missing, used or expired." });
  const existing = await db("jobs_outlook_connect_sessions?select=id,user_code,expires_at,status,interval_seconds&invite_id=eq." + row.id + "&limit=1");
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
  const inserted = await db("jobs_outlook_connect_sessions", "POST", [{
    invite_id: row.id, device_ciphertext: device.ciphertext, device_iv: device.iv,
    user_code: String(payload.user_code), verification_uri: "https://microsoft.com/devicelogin",
    interval_seconds: interval, expires_at: expires, status: "pending"
  }], "return=representation");
  const session = inserted[0];
  return reply(200, { ok: true, session_id: session.id, user_code: session.user_code,
    verification_uri: session.verification_uri, interval_seconds: interval });
}
async function connectionPoll(invite: string, sessionId: string) {
  const row = await validInvite(invite);
  if (!row) return reply(403, { error: "This invitation has expired or already been used." });
  if (!/^[a-f0-9-]{36}$/i.test(sessionId)) return reply(400, { error: "Invalid session." });
  const q = "jobs_outlook_connect_sessions?select=*&id=eq." + sessionId +
    "&invite_id=eq." + row.id + "&limit=1";
  const matches = await db(q);
  if (!matches.length) return reply(404, { error: "Sign-in session not found." });
  const session = matches[0];
  if (session.status !== "pending" || Date.parse(session.expires_at) <= Date.now()) {
    return reply(403, { error: "Sign-in session has ended. Request a new link." });
  }
  const interval = Math.max(5, Number(session.interval_seconds) || 5);
  if (session.last_polled_at && Date.now() - Date.parse(session.last_polled_at) < interval * 1000) {
    return reply(200, { status: "pending", interval_seconds: interval });
  }
  await db("jobs_outlook_connect_sessions?id=eq." + session.id,
    "PATCH", { last_polled_at: new Date().toISOString() }, "return=minimal");
  const device = await decrypt(session.device_ciphertext, session.device_iv);
  const { response, payload } = await msTokenPost(AUTH_BASE + "/token", {
    client_id: CLIENT_ID, grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    device_code: device
  });
  if (!response.ok) {
    if (payload.error === "authorization_pending" || payload.error === "slow_down") {
      const next = payload.error === "slow_down" ? Math.min(60, interval + 5) : interval;
      if (next !== interval) await db("jobs_outlook_connect_sessions?id=eq." + session.id,
        "PATCH", { interval_seconds: next }, "return=minimal");
      return reply(200, { status: "pending", interval_seconds: next });
    }
    if (payload.error === "expired_token" || payload.error === "access_denied" || payload.error === "authorization_declined") {
      await db("jobs_outlook_connect_sessions?id=eq." + session.id,
        "PATCH", { status: "failed" }, "return=minimal");
      return reply(403, { error: "Sign-in expired or was declined. Request a fresh link." });
    }
    return reply(502, { error: "Microsoft sign-in is unavailable. Please try again shortly." });
  }
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
    await db("jobs_outlook_connect_sessions?id=eq." + session.id,
      "PATCH", { status: "failed" }, "return=minimal");
    return reply(403, { error: "Wrong account. Only Tony's company Outlook account can connect." });
  }
  const encrypted = await encrypt(payload.refresh_token);
  await db("jobs_outlook_mailbox_connections?on_conflict=mailbox", "POST", [{
    mailbox: EXPECTED_MAILBOX, encrypted_refresh_token: encrypted.ciphertext,
    refresh_iv: encrypted.iv, client_id: CLIENT_ID, tenant_id: TENANT_ID,
    granted_scopes: String(payload.scope || ""), connected_at: new Date().toISOString(),
    last_verified_at: new Date().toISOString()
  }], "resolution=merge-duplicates,return=minimal");
  await db("jobs_outlook_connect_sessions?id=eq." + session.id,
    "PATCH", { status: "connected", device_ciphertext: "", device_iv: "" }, "return=minimal");
  await db("jobs_outlook_connect_invites?id=eq." + row.id,
    "PATCH", { used_at: new Date().toISOString() }, "return=minimal");
  return reply(200, { status: "connected", mailbox: EXPECTED_MAILBOX });
}
const PAGE = "<!doctype html>\n<html lang=\"en-GB\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>Shiftboard · Connect Tony's Outlook</title>\n<style nonce=\"__NONCE__\">\n:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;background:#071525;color:#f0f6fa}\n*{box-sizing:border-box}body{margin:0;min-height:100svh;display:flex;justify-content:center;align-items:center;padding:24px}\nmain{max-width:510px;width:100%;border:1px solid #314258;border-radius:20px;background:#10233a;padding:28px;box-shadow:0 18px 60px #0005}\nheader{display:flex;align-items:center;gap:12px}h1{font-size:24px;margin:22px 0 12px}p,li{color:#d0dce7;line-height:1.58}\n.brand{font-weight:900;letter-spacing:.7px;font-size:22px;color:white}.tag{margin-left:auto;border-radius:20px;padding:6px 9px;background:#223950;font-size:11px;color:#9ed4ff}\n.small{font-size:13px;color:#9caebc}.card{border:1px solid #41617e;border-radius:12px;padding:14px;background:#0a1d31;margin:20px 0}\n.code{font-size:32px;font-weight:800;letter-spacing:3px;text-align:center;user-select:all;color:#fff;margin:12px 0}\nbutton,a.action{appearance:none;display:block;width:100%;padding:15px 18px;text-align:center;font-size:16px;font-weight:700;border:0;border-radius:12px;background:#56b6fa;color:#081a2d;cursor:pointer;text-decoration:none;margin:12px 0}\nbutton:disabled{background:#536e80;color:#bac8d1;cursor:default}.secondary{background:#233e59!important;color:#fff!important}\n.notice{border-radius:9px;padding:12px;background:#193a54;color:#d9ecfa;margin-top:16px}\n.warning{background:#50301f;color:#ffe0c0}.success{background:#1b483c;color:#d3ffe7}\n[hidden]{display:none!important}\n</style></head>\n<body><main>\n<header><span class=\"brand\">SHIFTBOARD</span><span class=\"tag\">Secure Outlook connection</span></header>\n<h1>Connect Tony's Outlook</h1>\n<p>Connect <strong>tony@neautoservices.com</strong> to import workshop day sheets. Shiftboard will request <strong>read-only</strong> email access.</p>\n<div class=\"card\"><strong>What will be read?</strong><p class=\"small\">Day Sheets folder: seven workshops. Inbox: Lido emails only. No emails will be deleted, moved or changed.</p></div>\n<section id=\"start\"><button id=\"connect\" type=\"button\">Start secure Microsoft sign-in</button>\n<p class=\"small\">You'll use Microsoft's official sign-in page. No password or verification code is entered into Shiftboard.</p></section>\n<section id=\"challenge\" hidden>\n<p>1. Copy this short Microsoft sign-in code:</p>\n<div class=\"card\"><div id=\"code\" class=\"code\"></div><button class=\"secondary\" id=\"copy\" type=\"button\">Copy code</button></div>\n<p>2. Open Microsoft's secure sign-in page, enter the code and sign in as Tony.</p>\n<a id=\"microsoft\" class=\"action\" href=\"https://microsoft.com/devicelogin\" target=\"_blank\" rel=\"noopener noreferrer\">Open Microsoft sign-in <span aria-hidden=\"true\">↗</span></a>\n<p class=\"small\">3. Return to this tab when you finish. Connection status checks automatically.</p>\n<button class=\"secondary\" type=\"button\" id=\"check\">Check connection</button>\n</section>\n<div id=\"status\" role=\"status\" aria-live=\"polite\" class=\"notice\">Ready when you are.</div>\n<p class=\"small\">This is a one-time connection invitation. The historical import remains in review until reports and classifications are verified.</p>\n</main>\n<script nonce=\"__NONCE__\">\n(function(){\n\"use strict\";\nconst form = document.getElementById(\"start\");\nconst challenge = document.getElementById(\"challenge\");\nconst status = document.getElementById(\"status\");\nconst copy = document.getElementById(\"copy\");\nconst code = document.getElementById(\"code\");\nconst checkButton = document.getElementById(\"check\");\nconst link = document.getElementById(\"microsoft\");\nconst connect = document.getElementById(\"connect\");\nconst hash = new URLSearchParams(window.location.hash.slice(1));\nconst invite = hash.get(\"invite\") || \"\";\nwindow.history.replaceState(null, \"\", window.location.pathname);\nlet session = null, interval = null, busy = false, connected = false;\nfunction notice(text, kind) {status.textContent = text;status.className=\"notice \"+(kind||\"\");}\nasync function api(body) {\n  const res = await fetch(location.pathname,{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},\n    cache:\"no-store\",body:JSON.stringify(Object.assign({invite:invite},body))});\n  const result = await res.json();\n  if(!res.ok)throw new Error(result.error||\"Couldn't connect. Try again.\");\n  return result;\n}\nasync function poll() {\n if(!session || busy || connected)return;\n busy=true;\n try{\n  const answer=await api({action:\"poll\",session_id:session});\n  if(answer.status===\"connected\"){\n    connected=true;\n    if(interval)clearInterval(interval);\n    challenge.hidden=true;form.hidden=true;\n    notice(\"Connected successfully: \"+answer.mailbox+\". Your day-sheet history is ready for the staging importer.\",\"success\");\n  }else notice(\"Waiting for Tony to finish signing in at Microsoft…\");\n }catch(e){\n   if(interval)clearInterval(interval);\n   notice(e.message||\"Connection check failed.\",\"warning\");\n }finally{busy=false;}\n}\nconnect.addEventListener(\"click\",async()=>{\n connect.disabled=true;notice(\"Contacting Microsoft securely…\");\n try{\n  const response=await api({action:\"start\"});\n  session=response.session_id;code.textContent=response.user_code;\n  link.href=response.verification_uri;\n  form.hidden=true;challenge.hidden=false;\n  notice(\"Code ready. Open the Microsoft sign-in page and enter it.\");\n  interval=setInterval(poll,Math.max(6,response.interval_seconds+2)*1000);\n }catch(e){connect.disabled=false;notice(e.message||\"Unable to start.\",\"warning\");}\n});\ncopy.addEventListener(\"click\",async()=>{\n try{await navigator.clipboard.writeText(code.textContent||\"\");notice(\"Code copied. Open Microsoft sign-in and paste it.\");}\n catch{notice(\"Press and hold the code above to copy it.\",\"warning\");}\n});\ncheckButton.addEventListener(\"click\",poll);\ndocument.addEventListener(\"visibilitychange\",()=>{if(!document.hidden)poll();});\nif(!/^[a-f0-9]{64}$/.test(invite)){connect.disabled=true;notice(\"A valid one-time connection link is required. Please request a fresh link from Shiftboard.\",\"warning\");}\n})();\n</script></body></html>";
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
    const body = await req.json();
    const invite = String(body.invite || "");
    if (body.action === "start") return await connectionStart(invite);
    if (body.action === "poll") return await connectionPoll(invite, String(body.session_id || ""));
    return reply(400, { error: "Unknown request." });
  } catch (e) {
    console.error("Outlook connect request failed", e instanceof Error ? e.name : "unknown");
    return reply(500, { error: "Connection service temporarily unavailable." });
  }
});
