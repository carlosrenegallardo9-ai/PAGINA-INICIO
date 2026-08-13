// Cloudflare Pages Function: Cursos creados por usuarios de Nébula.
// GET    -> lista cursos (todos, o solo los de ?username= para "Mis cursos").
// POST   -> crea un curso nuevo (título, emoji, descripción y lecciones con pasos + quiz).
// DELETE -> borra un curso propio (?id=&username=).

import { supabaseInsert, supabaseSelect, supabaseDelete } from "../_lib/supabase.js";

const MAX_LESSONS = 12;
const MAX_STEPS = 8;
const MAX_QUIZ = 8;
const MAX_OPTIONS = 5;

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cleanText(value, maxLen) {
  return typeof value === "string" ? value.trim().slice(0, maxLen) : "";
}

function validateStep(step) {
  if (!step || typeof step !== "object") return null;
  const title = cleanText(step.title, 80);
  const text = cleanText(step.text, 800);
  if (!text) return null;
  const imageUrl = typeof step.image_url === "string" ? step.image_url.trim().slice(0, 500) : "";
  return { title, text, image_url: imageUrl || null };
}

function validateQuestion(q) {
  if (!q || typeof q !== "object") return null;
  const question = cleanText(q.question, 300);
  const explain = cleanText(q.explain, 400);
  if (!question) return null;
  const imageUrl = typeof q.image_url === "string" ? q.image_url.trim().slice(0, 500) : "";

  if (q.type === "tf") {
    return { type: "tf", question, answer: q.answer === true, explain, image_url: imageUrl || null };
  }

  if (q.type === "mcq") {
    const options = Array.isArray(q.options)
      ? q.options.map((o) => cleanText(o, 150)).filter(Boolean).slice(0, MAX_OPTIONS)
      : [];
    const answer = Number.isInteger(q.answer) ? q.answer : -1;
    if (options.length < 2 || answer < 0 || answer >= options.length) return null;
    return { type: "mcq", question, options, answer, explain, image_url: imageUrl || null };
  }

  return null;
}

function validateLesson(lesson) {
  if (!lesson || typeof lesson !== "object") return null;
  const title = cleanText(lesson.title, 80);
  if (!title) return null;

  const steps = Array.isArray(lesson.steps)
    ? lesson.steps.map(validateStep).filter(Boolean).slice(0, MAX_STEPS)
    : [];
  const quiz = Array.isArray(lesson.quiz)
    ? lesson.quiz.map(validateQuestion).filter(Boolean).slice(0, MAX_QUIZ)
    : [];

  if (steps.length === 0 || quiz.length === 0) return null;
  return { title, steps, quiz };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const username = cleanText(url.searchParams.get("username") || "", 40);

  const query = username
    ? `select=id,username,title,emoji,description,content,created_at&username=eq.${encodeURIComponent(username)}&order=created_at.desc&limit=60`
    : `select=id,username,title,emoji,description,content,created_at&order=created_at.desc&limit=60`;

  const result = await supabaseSelect(env, "nebula_courses", query);
  if (!result.ok) {
    console.error("Supabase courses fetch error", result.error);
    return jsonResponse({ ok: true, courses: [] }, 200);
  }
  return jsonResponse({ ok: true, courses: result.data }, 200);
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

  const username = cleanText(body?.username, 40);
  const title = cleanText(body?.title, 80);
  const emoji = cleanText(body?.emoji, 8) || "🚀";
  const description = cleanText(body?.description, 300);

  if (!username) return jsonResponse({ error: "Falta el usuario" }, 400);
  if (!title) return jsonResponse({ error: "Ponle un título al curso" }, 400);

  const lessonsInput = Array.isArray(body?.content?.lessons) ? body.content.lessons : [];
  const lessons = lessonsInput.map(validateLesson).filter(Boolean).slice(0, MAX_LESSONS);

  if (lessons.length === 0) {
    return jsonResponse({ error: "Agrega al menos una lección con contenido y una pregunta de quiz" }, 400);
  }

  const insertResult = await supabaseInsert(env, "nebula_courses", {
    username,
    title,
    emoji,
    description: description || null,
    content: { lessons },
  });
  if (!insertResult.ok) {
    console.error("Supabase courses insert error", insertResult.error);
    return jsonResponse({ error: "No se pudo guardar el curso — " + insertResult.error }, 502);
  }
  return jsonResponse({ ok: true }, 200);
}

export async function onRequestDelete({ request, env }) {
  const host = new URL(request.url).host;
  const origin = request.headers.get("Origin") || request.headers.get("Referer") || "";
  if (origin && !origin.includes(host)) {
    return jsonResponse({ error: "Origen no permitido" }, 403);
  }

  const url = new URL(request.url);
  const id = cleanText(url.searchParams.get("id") || "", 64);
  const username = cleanText(url.searchParams.get("username") || "", 40);
  if (!id || !username) return jsonResponse({ error: "Falta el id o el usuario" }, 400);

  const result = await supabaseDelete(
    env,
    "nebula_courses",
    `id=eq.${encodeURIComponent(id)}&username=eq.${encodeURIComponent(username)}`,
  );
  if (!result.ok) {
    console.error("Supabase courses delete error", result.error);
    return jsonResponse({ error: "No se pudo borrar el curso — " + result.error }, 502);
  }
  return jsonResponse({ ok: true }, 200);
}
