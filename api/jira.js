/**
 * Vercel Serverless Function — Jira API Proxy
 *
 * Route: /api/jira/[...path]
 * Forwards requests to Jira Cloud REST API with credentials attached server-side.
 * This eliminates the browser CORS block entirely — credentials never touch the client.
 *
 * Environment variables (set in Vercel dashboard → Settings → Environment Variables):
 *   JIRA_BASE_URL   e.g. https://datman.atlassian.net
 *   JIRA_EMAIL      e.g. admin@datman.com
 *   JIRA_API_TOKEN  your Atlassian API token
 *
 * Usage from frontend:
 *   GET  /api/jira/rest/api/3/project/DN
 *   POST /api/jira/rest/api/3/version   (body: JSON)
 *   GET  /api/jira/rest/api/3/project/DN/versions
 */

export default async function handler(req, res) {
  // ── CORS headers so browser fetch() works ──────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // ── Validate env vars ──────────────────────────────────────────────────────
  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;

  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    return res.status(500).json({
      error: "Jira environment variables not configured.",
      missing: [
        !JIRA_BASE_URL   && "JIRA_BASE_URL",
        !JIRA_EMAIL      && "JIRA_EMAIL",
        !JIRA_API_TOKEN  && "JIRA_API_TOKEN",
      ].filter(Boolean),
    });
  }

  // ── Build Jira URL from the path after /api/jira/ ─────────────────────────
  // req.url = /api/jira/rest/api/3/project/DN  →  jiraPath = rest/api/3/project/DN
  const prefix = "/api/jira/";
  const rawPath = req.url || "";
  const jiraPath = rawPath.startsWith(prefix)
    ? rawPath.slice(prefix.length)
    : rawPath.replace(/^\/+/, "");

  const base = JIRA_BASE_URL.replace(/\/$/, "");
  const targetUrl = `${base}/${jiraPath}`;

  // ── Forward request ────────────────────────────────────────────────────────
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

  const fetchOptions = {
    method: req.method,
    headers: {
      "Authorization": `Basic ${auth}`,
      "Accept":        "application/json",
      "Content-Type":  "application/json",
    },
  };

  // Forward body for POST / PUT
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    fetchOptions.body = typeof req.body === "string"
      ? req.body
      : JSON.stringify(req.body);
  }

  try {
    const jiraRes = await fetch(targetUrl, fetchOptions);
    const contentType = jiraRes.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    const data = isJson ? await jiraRes.json() : await jiraRes.text();

    res.status(jiraRes.status);
    if (isJson) {
      res.json(data);
    } else {
      res.setHeader("Content-Type", "text/plain");
      res.send(data);
    }
  } catch (err) {
    res.status(502).json({ error: "Proxy fetch failed", detail: err.message });
  }
}
