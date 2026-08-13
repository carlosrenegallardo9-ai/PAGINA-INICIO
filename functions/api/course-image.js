// Cloudflare Pages Function: sube una imagen para un paso o pregunta de un curso de Ruta Estelar.
// POST (multipart/form-data: username, image) -> sube a Supabase Storage y devuelve la URL pública.

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET = "course-images";

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extFromType(type) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
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
    const detail = await res.text().catch(() => "");
    console.error("Supabase storage upload error", res.status, detail);
    return { ok: false, error: `Supabase ${res.status}: ${detail}` };
  }
  return { ok: true, url: `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path}` };
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

  let form;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: "No se pudo leer el formulario" }, 400);
  }

  const username = typeof form.get("username") === "string" ? form.get("username").trim().slice(0, 40) : "";
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
  const uploadResult = await uploadImage(env, arrayBuffer, file.type);
  if (!uploadResult.ok) {
    return jsonResponse({ error: "No se pudo subir la imagen — " + uploadResult.error }, 502);
  }

  return jsonResponse({ ok: true, url: uploadResult.url }, 200);
}
