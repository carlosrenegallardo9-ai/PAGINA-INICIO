// Cloudflare Pages Function: guarda usuario + nivel en Supabase cada vez que alguien
// inicia sesión o cambia de nivel en la capa adaptativa de Nébula.

import { supabaseInsert } from "../_lib/supabase.js";

const VALID_LEVELS = ["principiante", "intermedio", "avanzado"];

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
  const level = typeof body?.level === "string" ? body.level.trim() : "";

  if (!username || !VALID_LEVELS.includes(level)) {
    return jsonResponse({ error: "Datos inválidos" }, 400);
  }

  const result = await supabaseInsert(env, "nebula_sessions", { username, level });
  if (!result.ok) console.error("Supabase session insert error", result.error);

  return jsonResponse({ ok: result.ok }, result.ok ? 200 : 502);
}
