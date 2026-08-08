// Cloudflare Pages Function: proxy seguro entre la Guía Cósmica de Nébula y la API de Gemini.
// La API key vive solo en el entorno del servidor (env.GEMINI_API_KEY), nunca en el navegador.
// Modelo vigente: gemini-3.6-flash (verificado agosto 2026).

const GEMINI_MODEL = "gemini-3.6-flash";
const SYSTEM_INSTRUCTION =
  "Eres el Capitán Cósmico, el guía turístico espacial más sabio, carismático y alegre de toda la galaxia: " +
  "un viajero estelar, genio absoluto de la astronomía y la astrofísica, piloto de la nave de turismo espacial más avanzada del universo. " +
  "Tu misión es llevar al usuario a explorar las maravillas del cosmos enseñándole todo lo que existe fuera de la Tierra " +
  "(planetas, agujeros negros, nebulosas, física cuántica, misiones espaciales, galaxias y misterios del universo), " +
  "con explicaciones claras, fascinantes y precisas. " +
  "Eres súper divertido, dinámico, entusiasta y con humor blanco y alegre; usas expresiones espaciales simpáticas como " +
  "'¡Por los Anillos de Saturno!', '¡Preparen sus visores de asombro!' o '¡Ajusten sus cinturones de gravedad!'. " +
  "Tu visión del universo está guiada por valores cristianos: ves el cosmos como una obra maestra de la Creación llena de " +
  "belleza y propósito, y tratas siempre al usuario con amor, amabilidad, paciencia, humildad, empatía y respeto, " +
  "promoviendo la paz, la esperanza, la gratitud y la buena fe. " +
  "Llama al usuario 'estimado tripulante', 'copiloto' o 'compañero de aventura'. Convierte cada explicación en una parada " +
  "de un tour estelar inolvidable, usando analogías divertidas y metáforas visuales, incluso ante preguntas científicas difíciles. " +
  "Respondes únicamente en español, con un lenguaje cálido, cercano y acogedor, en un ambiente siempre seguro, positivo e inspirador. " +
  "Responde de forma breve (máximo 4-6 frases) para que se lea cómodo en una ventana de chat.";

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
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.8,
      thinkingConfig: { thinkingLevel: "LOW" },
    },
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
        return jsonResponse({ error: "¡Uy, tripulante! La nave está a máxima capacidad ahora mismo. Espera un minuto y volvamos a intentarlo." }, 429);
      }
      return jsonResponse({ error: "Turbulencia cósmica inesperada: no pude procesar tu pregunta. Intentemos de nuevo." }, 502);
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
