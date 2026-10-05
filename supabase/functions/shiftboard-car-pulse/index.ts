import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Workshop = { id: string; key: string; name: string };
type SalesRow = { snapshot_date: string; site_key: string; total_current: number | string | null };

const WORKSHOPS: Workshop[] = [
  { id: "s1", key: "seaham", name: "Seaham" },
  { id: "s2", key: "peterlee", name: "ETAC Workshop" },
  { id: "s3", key: "middlesbrough", name: "Middlesbrough" },
  { id: "s4", key: "hartlepool", name: "Hartlepool" },
  { id: "s5", key: "gateshead", name: "Gateshead" },
  { id: "s6", key: "fairfield", name: "Fairfield" },
  { id: "s7", key: "chester-le-street", name: "Chester le Street" },
  { id: "s8", key: "lido", name: "Lido" },
];

const TONY_EMAIL = "tony@neautoservices.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function numberValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function londonDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function publishableKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    if (keys.default) return String(keys.default);
  } catch (_) {}
  return Deno.env.get("SUPABASE_ANON_KEY") || "";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const apiKey = publishableKey();
  const authorization = req.headers.get("Authorization") || "";

  if (!supabaseUrl || !apiKey) return json({ error: "Function configuration is incomplete" }, 500);
  if (!authorization.startsWith("Bearer ")) return json({ error: "Sign in required" }, 401);

  const scopedHeaders = { apikey: apiKey, Authorization: authorization };

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: scopedHeaders });
    if (!userResponse.ok) return json({ error: "Session is not valid" }, 401);

    const user = await userResponse.json();
    const email = String(user?.email || "").trim().toLowerCase();
    if (email !== TONY_EMAIL) {
      return json({ error: "This view is currently available to Tony only" }, 403);
    }

    const today = londonDate();
    const currentMonth = today.slice(0, 7);
    const monthStart = `${currentMonth}-01`;

    const targetUrl = `${supabaseUrl}/rest/v1/shift_board?key=eq.targetSheets&select=value`;
    const salesUrl =
      `${supabaseUrl}/rest/v1/sales_daily_snapshots?select=snapshot_date,site_key,total_current` +
      `&snapshot_date=gte.${encodeURIComponent(monthStart)}&snapshot_date=lte.${encodeURIComponent(today)}` +
      `&order=snapshot_date.asc`;

    const [targetResponse, salesResponse] = await Promise.all([
      fetch(targetUrl, { headers: scopedHeaders }),
      fetch(salesUrl, { headers: scopedHeaders }),
    ]);

    if (!targetResponse.ok || !salesResponse.ok) {
      return json({
        error: "Shiftboard data could not be loaded",
        targetStatus: targetResponse.status,
        salesStatus: salesResponse.status,
      }, 502);
    }

    const targetRows = await targetResponse.json();
    const salesRows = (await salesResponse.json()) as SalesRow[];

    let targetSheets: any = targetRows?.[0]?.value || {};
    if (typeof targetSheets === "string") {
      try { targetSheets = JSON.parse(targetSheets); } catch (_) { targetSheets = {}; }
    }

    const latestDate = salesRows
      .map((row) => String(row.snapshot_date || "").slice(0, 10))
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || null;

    if (!latestDate) {
      return json({
        asOf: null, today, stale: true, sales: 0, target: 0, variance: 0,
        attainment: null, workshops: WORKSHOPS.length, trading: 0, ahead: 0,
        behind: 0, sites: [], attention: [], generatedAt: new Date().toISOString(),
      });
    }

    const targetMonth = targetSheets?.[latestDate.slice(0, 7)]?.sites || {};

    const sites = WORKSHOPS.map((workshop) => {
      const rows = salesRows
        .filter((row) => String(row.site_key) === workshop.key)
        .sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));

      const latestIndex = rows.findIndex(
        (row) => String(row.snapshot_date).slice(0, 10) === latestDate,
      );

      let sales: number | null = null;
      if (latestIndex >= 0) {
        const latestValue = numberValue(rows[latestIndex].total_current);
        const previousValue =
          latestIndex > 0 &&
          String(rows[latestIndex - 1].snapshot_date).slice(0, 7) === latestDate.slice(0, 7)
            ? numberValue(rows[latestIndex - 1].total_current)
            : 0;
        sales = Math.max(0, latestValue - previousValue);
      }

      const day = (targetMonth?.[workshop.id]?.days || []).find(
        (entry: any) => String(entry?.date) === latestDate,
      );
      const target = day?.open ? numberValue(day?.target) : 0;
      const variance = sales == null ? null : sales - target;

      return {
        id: workshop.id,
        name: workshop.name,
        sales,
        target,
        variance,
        attainment: sales != null && target > 0 ? (sales / target) * 100 : null,
        trading: target > 0,
        dataAvailable: sales != null,
      };
    });

    const sales = sites.reduce((sum, site) => sum + numberValue(site.sales), 0);
    const target = sites.reduce((sum, site) => sum + numberValue(site.target), 0);
    const variance = sales - target;
    const trading = sites.filter((site) => site.trading).length;
    const ahead = sites.filter((site) =>
      site.trading && site.sales != null && numberValue(site.variance) >= 0
    ).length;
    const behind = sites.filter((site) =>
      site.trading && site.sales != null && numberValue(site.variance) < 0
    ).length;

    const attention = sites
      .filter((site) => site.trading && site.sales != null && numberValue(site.variance) < 0)
      .sort((a, b) => numberValue(a.variance) - numberValue(b.variance))
      .slice(0, 3)
      .map((site) => ({ name: site.name, variance: site.variance }));

    const topSite = sites
      .filter((site) => site.sales != null)
      .sort((a, b) => numberValue(b.variance) - numberValue(a.variance))[0] || null;

    return json({
      asOf: latestDate,
      today,
      stale: latestDate !== today,
      sales,
      target,
      variance,
      attainment: target > 0 ? (sales / target) * 100 : null,
      workshops: WORKSHOPS.length,
      trading,
      ahead,
      behind,
      topSite,
      attention,
      sites,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("shiftboard-car-pulse failed", error);
    return json({ error: "Shiftboard pulse failed" }, 500);
  }
});
