// Cloudflare Pages Function: Comunidad Nébula.
// GET  -> devuelve los últimos posts (preguntas y fotos aprobadas).
// POST -> crea un post nuevo: pregunta de texto (JSON) o foto (multipart/form-data).
// Toda imagen y todo texto pasa primero por una revisión automática con Gemini
// antes de guardarse — si no pasa, nunca llega a Supabase.

import { supabaseInsert, supabaseSelect } from "../_lib/supabase.js";

const GEMINI_MODEL = "gemini-3.6-flash";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET = "community-photos";

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function extFromType(type) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

async function callGemini(env, parts) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { maxOutputTokens: 120, temperature: 0, thinkingConfig: { thinkingLevel: "LOW" } },
      }),
    },
  );
  if (!res.ok) {
    console.error("Gemini moderation API error", res.status, await res.text().catch(() => ""));
    return null;
  }
  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
}

function parseModerationVerdict(text) {
  if (!text) return { safe: false, reason: "No se pudo verificar el contenido en este momento. Intenta de nuevo." };
  if (/^SEGURO/i.test(text)) return { safe: true };
  const m = text.match(/RECHAZADO:?\s*(.*)/is);
  return { safe: false, reason: m && m[1].trim() ? m[1].trim() : "El contenido no pasó la revisión automática." };
}

async function moderateImage(env, base64, mimeType) {
  const text = await callGemini(env, [
    {
      text:
        "Eres un moderador de contenido para una comunidad educativa familiar sobre astronomía y el espacio. " +
        "Evalúa esta imagen. Responde EXACTAMENTE con la palabra SEGURO si es apropiada para todo público " +
        "(sin desnudez, violencia gráfica, odio, contenido sexual o material perturbador) — no hace falta que sea " +
        "sobre astronomía, solo que sea apropiada. Si NO es apropiada, responde EXACTAMENTE con " +
        "'RECHAZADO: ' seguido de una razón breve en español.",
    },
    { inlineData: { mimeType, data: base64 } },
  ]);
  return parseModerationVerdict(text);
}

async function moderateText(env, message) {
  const text = await callGemini(env, [
    {
      text:
        "Eres un moderador de una comunidad educativa familiar sobre astronomía y el espacio. Evalúa este mensaje " +
        'de un usuario: "' +
        message.replace(/"/g, "'") +
        '". Responde EXACTAMENTE con la palabra SEGURO si es apropiado para todo público (no hace falta que sea ' +
        "sobre astronomía). Si contiene odio, insultos, contenido sexual, spam o algo inapropiado, responde " +
        "EXACTAMENTE con 'RECHAZADO: ' seguido de una razón breve en español.",
    },
  ]);
  return parseModerationVerdict(text);
}

async function uploadImage(env, arrayBuffer, mimeType) {
  const path = `${Date.now()}-${crypto.randomUUID()}.${extFromType(mimeType)}`;
  const url = `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": mimeType,
    },
    body: arrayBuffer,
  });
  if (!res.ok) {
    console.error("Supabase storage upload error", res.status, await res.text().catch(() => ""));
    return null;
  }
  return `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path}`;
}

export async function onRequestGet({ env }) {
  const result = await supabaseSelect(
    env,
    "nebula_community_posts",
    "select=id,username,type,text_content,image_url,created_at&order=created_at.desc&limit=30",
  );
  if (!result.ok) {
    console.error("Supabase community fetch error", result.error);
    return jsonResponse({ ok: true, posts: [] }, 200);
  }
  return jsonResponse({ ok: true, posts: result.data }, 200);
}

export async function onRequestPost({ request, env }) {
  const host = new URL(request.url).host;
  const origin = request.headers.get("Origin") || request.headers.get("Referer") || "";
  if (origin && !origin.includes(host)) {
    return jsonResponse({ error: "Origen no permitido" }, 403);
  }

  if (!env.GEMINI_API_KEY) return jsonResponse({ error: "Falta configurar GEMINI_API_KEY" }, 500);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Falta configurar Supabase" }, 500);
  }

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    let form;
    try {
      form = await request.formData();
    } catch {
      return jsonResponse({ error: "No se pudo leer el formulario" }, 400);
    }

    const username = typeof form.get("username") === "string" ? form.get("username").trim().slice(0, 40) : "";
    const caption = typeof form.get("caption") === "string" ? form.get("caption").trim().slice(0, 200) : "";
    const file = form.get("image");

    if (!username) return jsonResponse({ error: "Falta el usuario" }, 400);
    if (!(file && typeof file.arrayBuffer === "function")) return jsonResponse({ error: "Falta la imagen" }, 400);
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return jsonResponse({ error: "Formato de imagen no soportado (usa JPG, PNG o WEBP)" }, 400);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return jsonResponse({ error: "La imagen es muy grande (máximo 5 MB)" }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);

    const verdict = await moderateImage(env, base64, file.type);
    if (!verdict.safe) return jsonResponse({ error: verdict.reason }, 422);

    const imageUrl = await uploadImage(env, arrayBuffer, file.type);
    if (!imageUrl) return jsonResponse({ error: "No se pudo subir la imagen. Intenta de nuevo." }, 502);

    const insertResult = await supabaseInsert(env, "nebula_community_posts", {
      username,
      type: "photo",
      text_content: caption || null,
      image_url: imageUrl,
    });
    if (!insertResult.ok) {
      console.error("Supabase community insert error", insertResult.error);
      return jsonResponse({ error: "No se pudo guardar la publicación" }, 502);
    }
    return jsonResponse({ ok: true }, 200);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const username = typeof body?.username === "string" ? body.username.trim().slice(0, 40) : "";
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 400) : "";
  if (!username) return jsonResponse({ error: "Falta el usuario" }, 400);
  if (!text) return jsonResponse({ error: "Escribe tu pregunta" }, 400);

  const verdict = await moderateText(env, text);
  if (!verdict.safe) return jsonResponse({ error: verdict.reason }, 422);

  const insertResult = await supabaseInsert(env, "nebula_community_posts", {
    username,
    type: "question",
    text_content: text,
    image_url: null,
  });
  if (!insertResult.ok) {
    console.error("Supabase community insert error", insertResult.error);
    return jsonResponse({ error: "No se pudo guardar la publicación" }, 502);
  }
  return jsonResponse({ ok: true }, 200);
}
