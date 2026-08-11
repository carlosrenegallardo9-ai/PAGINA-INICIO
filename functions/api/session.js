// Cloudflare Pages Function: guarda usuario + nivel en Supabase cada vez que alguien
// inicia sesión o cambia de nivel en la capa adaptativa de Nébula. También calcula la
// racha real de días consecutivos y devuelve un resumen de la última sesión de chat,
// para que el Capitán Cósmico pueda dar continuidad al volver a entrar.

import { supabaseInsert, supabaseSelect, supabaseUpsert } from "../_lib/supabase.js";

const VALID_LEVELS = ["principiante", "intermedio", "avanzado"];

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function isYesterday(dateStr, today) {
  const d = new Date(`${dateStr}T00:00:00Z`).getTime();
  const t = new Date(`${today}T00:00:00Z`).getTime();
  return Math.round((t - d) / 86400000) === 1;
}

async function computeStreak(env, username, today) {
  const existing = await supabaseSelect(
    env,
    "nebula_progress",
    `username=eq.${encodeURIComponent(username)}&select=streak,last_active_date,unlocked_level`,
  );
  const priorRow = existing.ok && Array.isArray(existing.data) ? existing.data[0] : null;

  let streak = 1;
  if (priorRow) {
    if (priorRow.last_active_date === today) streak = priorRow.streak;
    else if (isYesterday(priorRow.last_active_date, today)) streak = priorRow.streak + 1;
    else streak = 1;
  }
  const unlockedLevel = priorRow && typeof priorRow.unlocked_level === "number" ? priorRow.unlocked_level : 1;

  const upsertResult = await supabaseUpsert(
    env,
    "nebula_progress",
    { username, streak, last_active_date: today },
    "username",
  );
  if (!upsertResult.ok) console.error("Supabase progress upsert error", upsertResult.error);

  return { streak, unlockedLevel };
}

async function fetchRecentMessages(env, username) {
  const result = await supabaseSelect(
    env,
    "nebula_chat_messages",
    `username=eq.${encodeURIComponent(username)}&select=user_message,ai_reply&order=created_at.desc&limit=5`,
  );
  if (!result.ok || !Array.isArray(result.data)) return [];
  return result.data.reverse();
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

  const insertResult = await supabaseInsert(env, "nebula_sessions", { username, level });
  if (!insertResult.ok) console.error("Supabase session insert error", insertResult.error);

  const { streak, unlockedLevel } = await computeStreak(env, username, todayUTC());
  const recentMessages = await fetchRecentMessages(env, username);

  return jsonResponse({ ok: true, streak, unlockedLevel, recentMessages }, 200);
}
