// Cloudflare Pages Function: registra en Supabase que un usuario aprobó el quiz de un
// nivel de la Ruta Estelar, desbloqueando el siguiente.

import { supabaseSelect, supabaseUpsert } from "../_lib/supabase.js";

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost({ request, env }) {
  const host = new URL(request.url).host;
  const origin = request.headers.get("Origin") || request.headers.get("Referer") || "";
  if (origin && !origin.includes(host)) {
    return jsonResponse({ error: "Origen no permitido" }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const username = typeof body?.username === "string" ? body.username.trim().slice(0, 40) : "";
  const level = Number.isInteger(body?.level) ? body.level : NaN;

  if (!username || !Number.isInteger(level) || level < 1) {
    return jsonResponse({ error: "Datos inválidos" }, 400);
  }

  const existing = await supabaseSelect(
    env,
    "nebula_progress",
    `username=eq.${encodeURIComponent(username)}&select=unlocked_level`,
  );
  const priorRow = existing.ok && Array.isArray(existing.data) ? existing.data[0] : null;
  const currentUnlocked = priorRow && typeof priorRow.unlocked_level === "number" ? priorRow.unlocked_level : 1;
  const unlockedLevel = Math.max(currentUnlocked, level + 1);

  const result = await supabaseUpsert(env, "nebula_progress", { username, unlocked_level: unlockedLevel }, "username");
  if (!result.ok) console.error("Supabase level-complete upsert error", result.error);

  return jsonResponse({ ok: result.ok, unlockedLevel }, result.ok ? 200 : 502);
}
