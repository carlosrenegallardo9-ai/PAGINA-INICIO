// Cloudflare Pages Function: proxy seguro entre la Guía Cósmica de Nébula y la API de Gemini.
// La API key vive solo en el entorno del servidor (env.GEMINI_API_KEY), nunca en el navegador.

const GEMINI_MODEL = "gemini-3.6-flash";
const SYSTEM_INSTRUCTION =
  "Eres la guía cósmica de Nébula, un observatorio digital educativo sobre astronomía y el universo. " +
  "Responde siempre en español, de forma breve (máximo 4-5 frases), clara y entusiasta, con un tono cálido. " +
  "Si la pregunta no tiene relación con astronomía, el espacio o el universo, redirige amablemente la conversación hacia esos temas.";

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

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return jsonResponse({ error: "Falta el mensaje" }, 400);
  if (message.length > 1000) return jsonResponse({ error: "Mensaje demasiado largo" }, 400);

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return jsonResponse({ error: "Falta configurar GEMINI_API_KEY" }, 500);

  const payload = {
    contents: [{ role: "user", parts: [{ text: message }] }],
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
  };

  try {
    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!apiRes.ok) {
      console.error("Gemini API error", apiRes.status, await apiRes.text().catch(() => ""));
      if (apiRes.status === 429) {
        return jsonResponse({ error: "La guía cósmica está muy solicitada ahora mismo. Espera un minuto e intenta de nuevo." }, 429);
      }
      return jsonResponse({ error: "La IA no respondió correctamente" }, 502);
    }

    const data = await apiRes.json();
    const reply = (data?.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || "")
      .join("")
      .trim();

    if (!reply) return jsonResponse({ error: "Respuesta vacía de la IA" }, 502);

    return jsonResponse({ reply }, 200);
  } catch (err) {
    console.error("Chat function error", err);
    return jsonResponse({ error: "Error interno" }, 500);
  }
}

export function onRequestGet() {
  return jsonResponse(
    { ok: true, info: "Usa POST con { message } para hablar con la guía cósmica de Nébula." },
    200,
  );
}
