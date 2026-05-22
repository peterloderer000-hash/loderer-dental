/**
 * send-push — Supabase Edge Function
 *
 * Volá sa pri INSERT do tabuľky notifications (DB trigger).
 * Načíta push_token z profiles a pošle notifikáciu cez Expo Push API
 * (Expo automaticky smeruje na FCM pre Android, APNs pre iOS).
 *
 * Env vars (nastavené cez `supabase secrets set`):
 *   SUPABASE_URL              — automaticky injektovaný Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — manuálne nastaviť
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL             = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPO_PUSH_URL             = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ ok: false, reason: "method_not_allowed" }, 405);
  }

  try {
    const payload = await req.json();

    // Supabase DB Webhook payload: { type, table, schema, record, old_record }
    // Priamy POST: { user_id, title, body, type }
    const record: Record<string, unknown> = payload.record ?? payload;
    const user_id  = record.user_id  as string | undefined;
    const title    = record.title    as string | undefined;
    const body     = record.body     as string | undefined;
    const notifType = record.type    as string | undefined;

    if (!user_id || !title) {
      return json({ ok: false, reason: "missing user_id or title" }, 400);
    }

    // Načítaj push token (service role obchádza RLS)
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile, error: profileErr } = await db
      .from("profiles")
      .select("push_token, full_name")
      .eq("id", user_id)
      .maybeSingle();

    if (profileErr) {
      console.error("[send-push] profile error:", profileErr.message);
      return json({ ok: false, error: profileErr.message }, 500);
    }

    const pushToken = profile?.push_token as string | null | undefined;
    if (!pushToken) {
      // Žiadny token — zariadenie nemá povolené notifikácie, preskočí ticho
      return json({ ok: true, skipped: "no_push_token" });
    }

    // Pošli cez Expo push API
    const message = {
      to:        pushToken,
      title:     title,
      body:      body ?? "",
      sound:     "default",
      priority:  notifType === "warning" ? "high" : "normal",
      channelId: "default",
      badge:     1,
      data:      { type: notifType ?? "info", user_id },
    };

    const expoRes = await fetch(EXPO_PUSH_URL, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "Accept":          "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(message),
    });

    const expoData = await expoRes.json();
    const ticket   = expoData.data ?? expoData;

    // Ak token vypršal / zariadenie odregistrované — vyčisti token
    if (ticket?.status === "error") {
      console.error(`[send-push] push failed for ${user_id}:`, ticket.message);
      if (ticket.details?.error === "DeviceNotRegistered") {
        await db.from("profiles").update({ push_token: null }).eq("id", user_id);
        console.log(`[send-push] cleared stale token for ${user_id}`);
      }
    }

    return json({ ok: true, ticket });
  } catch (err) {
    console.error("[send-push] unhandled error:", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
