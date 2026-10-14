/* Static Cloudflare Pages frontend. Secrets stay only in the fragment and server-side. */
(() => {
  "use strict";
  const API = "https://disgpocvqitpeceqhuim.supabase.co/functions/v1/shiftboard-outlook-connect";
  const form = document.getElementById("start");
  const challenge = document.getElementById("challenge");
  const status = document.getElementById("status");
  const copy = document.getElementById("copy");
  const code = document.getElementById("code");
  const checkButton = document.getElementById("check");
  const link = document.getElementById("microsoft");
  const connect = document.getElementById("connect");
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const invite = hash.get("invite") || "";
  let session = null, interval = null, busy = false, connected = false;
  function notice(message, kind = "") {
    status.textContent = message;
    status.className = "notice " + kind;
  }
  async function api(body) {
    const res = await fetch(API, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: JSON.stringify({ invite, ...body })
    });
    let result;
    try { result = await res.json(); }
    catch (_e) { throw new Error("The connection server did not respond correctly."); }
    if (!res.ok) throw new Error(result.error || "Connection failed. Try again.");
    return result;
  }
  async function poll() {
    if (!session || busy || connected) return;
    busy = true;
    try {
      const answer = await api({ action: "poll", session_id: session });
      if (answer.status === "connected") {
        connected = true;
        if (interval) clearInterval(interval);
        challenge.hidden = true;
        form.hidden = true;
        // Clear the one-use token from the visible URL once it has been consumed.
        history.replaceState(null, "", location.pathname);
        notice("Connected successfully: " + answer.mailbox + ". Your mailbox is authorised for historical staging.", "success");
      } else {
        notice("Waiting for Tony to finish signing in at Microsoft…");
      }
    } catch (e) {
      if (interval) clearInterval(interval);
      notice(e.message || "Connection check failed.", "warning");
    } finally { busy = false; }
  }
  connect.addEventListener("click", async () => {
    connect.disabled = true;
    notice("Contacting Microsoft securely…");
    try {
      const answer = await api({ action: "start" });
      session = answer.session_id;
      code.textContent = answer.user_code;
      link.href = answer.verification_uri;
      form.hidden = true;
      challenge.hidden = false;
      notice("Code ready. Open Microsoft sign-in and enter it.");
      interval = setInterval(poll, Math.max(6, Number(answer.interval_seconds) + 2) * 1000);
    } catch (e) {
      connect.disabled = false;
      notice(e.message || "Unable to start.", "warning");
    }
  });
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code.textContent || "");
      notice("Code copied. Open Microsoft's sign-in page and paste it.");
    } catch (_e) {
      notice("Press and hold the code above to copy it.", "warning");
    }
  });
  checkButton.addEventListener("click", poll);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) poll();
  });
  if (!/^[a-f0-9]{64}$/.test(invite)) {
    connect.disabled = true;
    notice("Please open your original one-time Shiftboard connection link.", "warning");
  }
})();