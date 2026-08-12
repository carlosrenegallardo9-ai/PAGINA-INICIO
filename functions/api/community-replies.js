// Cloudflare Pages Function: respuestas a publicaciones de la Comunidad Nébula.
// GET  ?post_id=123 -> devuelve las respuestas de esa publicación, ordenadas por fecha.
// POST { post_id, username, text } -> crea una respuesta nueva.

import { supabaseInsert, supabaseSelect } from "../_lib/supabase.js";

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const postId = Number(url.searchParams.get("post_id"));
  if (!Number.isInteger(postId)) return jsonResponse({ error: "Falta post_id" }, 400);

  const result = await supabaseSelect(
    env,
    "nebula_community_replies",
    `post_id=eq.${postId}&select=id,username,text_content,created_at&order=created_at.asc&limit=200`,
  );
  if (!result.ok) {
    console.error("Supabase replies fetch error", result.error);
    return jsonResponse({ ok: true, replies: [] }, 200);
  }
  return jsonResponse({ ok: true, replies: result.data }, 200);
}

export async function onRequestPost({ request, env }) {
  const host = new URL(request.url).host;
  const origin = request.headers.get("Origin") || request.headers.get("Referer") || "";
  if (origin && !origin.includes(host)) {
    return jsonResponse({ error: "Origen no permitido" }, 403);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Falta configurar Supabase" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const postId = Number(body?.post_id);
  const username = typeof body?.username === "string" ? body.username.trim().slice(0, 40) : "";
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 300) : "";

  if (!Number.isInteger(postId)) return jsonResponse({ error: "Falta post_id" }, 400);
  if (!username) return jsonResponse({ error: "Falta el usuario" }, 400);
  if (!text) return jsonResponse({ error: "Escribe una respuesta" }, 400);

  const insertResult = await supabaseInsert(env, "nebula_community_replies", {
    post_id: postId,
    username,
    text_content: text,
  });
  if (!insertResult.ok) {
    console.error("Supabase reply insert error", insertResult.error);
    return jsonResponse({ error: "No se pudo publicar la respuesta — " + insertResult.error }, 502);
  }
  return jsonResponse({ ok: true }, 200);
}
