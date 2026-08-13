// Helper compartido: inserta filas en Supabase vía su API REST (PostgREST).
// Usa siempre la service_role key desde el entorno del servidor — nunca del navegador.

export async function supabaseInsert(env, table, row) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, error: "Supabase no configurado (faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" };

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Supabase ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function supabaseSelect(env, table, query) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, error: "Supabase no configurado", data: null };

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Supabase ${res.status}: ${text}`, data: null };
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: String(err), data: null };
  }
}

export async function supabaseDelete(env, table, query) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, error: "Supabase no configurado" };

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}?${query}`, {
      method: "DELETE",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Supabase ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function supabaseUpsert(env, table, row, onConflict) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, error: "Supabase no configurado" };

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Supabase ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
