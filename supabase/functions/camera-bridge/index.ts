// Shift Board — camera bridge pairing and status
// Custom auth: Tony-only browser actions + one-time pairing/bridge token for the Chester PC.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return keys.default || "";
  } catch {
    return "";
  }
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes = 32) {
  const out = new Uint8Array(bytes);
  crypto.getRandomValues(out);
  return Array.from(out).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode() {
  const out = new Uint32Array(1);
  crypto.getRandomValues(out);
  return String(out[0] % 100000000).padStart(8, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_KEY = serviceKey();
    if (!SUPABASE_URL || !SERVICE_KEY) return reply({ error: "Server configuration unavailable" }, 500);

    let body: any = {};
    try { body = await req.json(); } catch { return reply({ error: "Invalid JSON" }, 400); }
    const action = String(body?.action || "");
    const siteId = String(body?.site_id || "chester").toLowerCase();

    const adminHeaders = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    };

    // Bridge-side registration: one-time pairing code, no user JWT.
    if (action === "register") {
      if (siteId !== "chester") return reply({ error: "Unknown site" }, 400);
      const pairingCode = String(body?.pairing_code || "").trim();
      const baseUrl = String(body?.base_url || "").trim().replace(/\/$/, "");
      const pathToken = String(body?.path_token || "").trim();
      const channels = Math.max(1, Math.min(16, Number(body?.channels || 16) || 16));

      if (!/^\d{8}$/.test(pairingCode)) return reply({ error: "Invalid pairing code" }, 400);
      if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(baseUrl)) return reply({ error: "Unexpected bridge URL" }, 400);
      if (!/^[a-f0-9]{48,128}$/i.test(pathToken)) return reply({ error: "Invalid path token" }, 400);

      const pRes = await fetch(
        `${SUPABASE_URL}/rest/v1/camera_bridge_pairings?site_id=eq.${encodeURIComponent(siteId)}&select=code_hash,expires_at`,
        { headers: adminHeaders },
      );
      if (!pRes.ok) return reply({ error: "Could not verify pairing" }, 500);
      const rows = await pRes.json();
      const pairing = rows?.[0];
      if (!pairing) return reply({ error: "Pairing code not found. Generate a new code in Shiftboard." }, 401);
      if (new Date(pairing.expires_at).getTime() < Date.now()) return reply({ error: "Pairing code expired. Generate a new code in Shiftboard." }, 401);
      if (await sha256(pairingCode) !== pairing.code_hash) return reply({ error: "Pairing code not recognised" }, 401);

      const bridgeToken = randomHex(32);
      const bridgeTokenHash = await sha256(bridgeToken);
      const now = new Date().toISOString();

      const up = await fetch(`${SUPABASE_URL}/rest/v1/camera_bridges?on_conflict=site_id`, {
        method: "POST",
        headers: { ...adminHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          site_id: siteId,
          public_base_url: baseUrl,
          path_token: pathToken,
          bridge_token_hash: bridgeTokenHash,
          channels,
          last_seen: now,
          updated_at: now,
        }),
      });
      if (!up.ok) return reply({ error: `Could not register bridge (${up.status})` }, 500);

      await fetch(`${SUPABASE_URL}/rest/v1/camera_bridge_pairings?site_id=eq.${encodeURIComponent(siteId)}`, {
        method: "DELETE",
        headers: adminHeaders,
      });

      return reply({ ok: true, bridge_token: bridgeToken });
    }

    // Bridge-side heartbeat. A valid bridge token can update its ephemeral tunnel URL.
    if (action === "heartbeat") {
      if (siteId !== "chester") return reply({ error: "Unknown site" }, 400);
      const bridgeToken = String(body?.bridge_token || "");
      const baseUrl = String(body?.base_url || "").trim().replace(/\/$/, "");
      const pathToken = String(body?.path_token || "").trim();
      if (!bridgeToken) return reply({ error: "Missing bridge token" }, 401);
      if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(baseUrl)) return reply({ error: "Unexpected bridge URL" }, 400);
      if (!/^[a-f0-9]{48,128}$/i.test(pathToken)) return reply({ error: "Invalid path token" }, 400);

      const bRes = await fetch(
        `${SUPABASE_URL}/rest/v1/camera_bridges?site_id=eq.${encodeURIComponent(siteId)}&select=bridge_token_hash`,
        { headers: adminHeaders },
      );
      if (!bRes.ok) return reply({ error: "Could not verify bridge" }, 500);
      const rows = await bRes.json();
      const bridge = rows?.[0];
      if (!bridge || await sha256(bridgeToken) !== bridge.bridge_token_hash) return reply({ error: "Bridge token not recognised" }, 401);

      const now = new Date().toISOString();
      const patch = await fetch(
        `${SUPABASE_URL}/rest/v1/camera_bridges?site_id=eq.${encodeURIComponent(siteId)}`,
        {
          method: "PATCH",
          headers: { ...adminHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({ public_base_url: baseUrl, path_token: pathToken, last_seen: now, updated_at: now }),
        },
      );
      if (!patch.ok) return reply({ error: "Heartbeat update failed" }, 500);
      return reply({ ok: true });
    }

    // Browser-side actions require Tony's current Shiftboard session.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return reply({ error: "Not signed in" }, 401);

    const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) return reply({ error: "Not signed in" }, 401);
    const me = await meRes.json();
    const email = String(me?.email || "").toLowerCase();
    if (me?.app_metadata?.role !== "super" || email !== "tony@neautoservices.com") {
      return reply({ error: "Tony only" }, 403);
    }

    if (action === "create_pairing") {
      if (siteId !== "chester") return reply({ error: "Unknown site" }, 400);
      const code = randomCode();
      const now = Date.now();
      const expiresAt = new Date(now + 20 * 60 * 1000).toISOString();
      const up = await fetch(`${SUPABASE_URL}/rest/v1/camera_bridge_pairings?on_conflict=site_id`, {
        method: "POST",
        headers: { ...adminHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          site_id: siteId,
          code_hash: await sha256(code),
          expires_at: expiresAt,
          created_by: me.id,
          created_at: new Date(now).toISOString(),
        }),
      });
      if (!up.ok) return reply({ error: `Could not create pairing code (${up.status})` }, 500);
      return reply({ ok: true, pairing_code: code, expires_at: expiresAt });
    }

    if (action === "status") {
      if (siteId !== "chester") return reply({ error: "Unknown site" }, 400);
      const bRes = await fetch(
        `${SUPABASE_URL}/rest/v1/camera_bridges?site_id=eq.${encodeURIComponent(siteId)}&select=public_base_url,path_token,channels,last_seen,updated_at`,
        { headers: adminHeaders },
      );
      if (!bRes.ok) return reply({ error: "Could not read bridge status" }, 500);
      const rows = await bRes.json();
      const bridge = rows?.[0];
      if (!bridge) return reply({ online: false, configured: false });
      const last = new Date(bridge.last_seen).getTime();
      const online = Number.isFinite(last) && Date.now() - last < 100000;
      return reply({
        online,
        configured: true,
        base_url: bridge.public_base_url,
        path_token: bridge.path_token,
        channels: bridge.channels,
        last_seen: bridge.last_seen,
      });
    }

    if (action === "disconnect") {
      if (siteId !== "chester") return reply({ error: "Unknown site" }, 400);
      await fetch(`${SUPABASE_URL}/rest/v1/camera_bridges?site_id=eq.${encodeURIComponent(siteId)}`, {
        method: "DELETE",
        headers: adminHeaders,
      });
      await fetch(`${SUPABASE_URL}/rest/v1/camera_bridge_pairings?site_id=eq.${encodeURIComponent(siteId)}`, {
        method: "DELETE",
        headers: adminHeaders,
      });
      return reply({ ok: true });
    }

    return reply({ error: "Unknown action" }, 400);
  } catch (err) {
    return reply({ error: "Server error: " + (err instanceof Error ? err.message : String(err)) }, 500);
  }
});