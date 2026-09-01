// Update an existing app user — used by the user edit view in
// Settings > משתמשים (src/pages/Settings.jsx UserEditModal).
//
// Two actions, both auth'd the same way as invite-user (caller's own
// session JWT, checked against app_users/permissions('users','edit')):
//
//   { action: 'list_emails' }
//     -> { emails: { [user_id]: email } } for every app_users row.
//     Needed because auth.users (where email actually lives) isn't
//     readable from the client — app_users has no email column.
//
//   { action: 'update', user_id, full_name?, phone?, notes?, email? }
//     -> patches the app_users row (full_name/phone/notes) and, if `email`
//     is present and differs from the current auth email, updates the
//     Supabase Auth user's email via the admin API (service role only —
//     the client can only ever change its OWN email, never another
//     user's, without this function).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// supabase-js's functions.invoke() sends the caller's session as an
// Authorization header, which makes this a cross-origin request the browser
// preflights with an OPTIONS request before the real POST. Without these
// headers (and without answering OPTIONS at all) the browser's CORS check on
// the preflight fails and supabase-js reports it as a generic "Failed to
// send a request to the Edge Function" — same fix applied to invite-user.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return jsonResponse({ error: "missing session token" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return jsonResponse({ error: "invalid session" }, 401);
  const callerId = userData.user.id;

  const { data: caller } = await admin.from("app_users").select("role_id, is_active").eq("id", callerId).single();
  if (!caller?.is_active) return jsonResponse({ error: "inactive account" }, 403);

  const body = await req.json().catch(() => null);
  if (!body?.action) return jsonResponse({ error: "action is required" }, 400);

  if (body.action === "list_emails") {
    // Any active user with users:view can see the roster; the email list
    // powers the same table, so gate it the same way.
    const { data: perm } = await admin.from("permissions").select("can_view").eq("role_id", caller.role_id).eq("resource", "users").maybeSingle();
    if (!perm?.can_view) return jsonResponse({ error: "not permitted to view users" }, 403);

    const emails: Record<string, string> = {};
    let page = 1;
    // listUsers is paginated (default 50/page) — walk pages until exhausted.
    // App user counts are small, so this stays a handful of requests.
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return jsonResponse({ error: error.message }, 400);
      for (const u of data.users) emails[u.id] = u.email || "";
      if (data.users.length < 200) break;
      page += 1;
    }
    return jsonResponse({ emails });
  }

  if (body.action === "update") {
    const { data: perm } = await admin.from("permissions").select("can_edit").eq("role_id", caller.role_id).eq("resource", "users").maybeSingle();
    if (!perm?.can_edit) return jsonResponse({ error: "not permitted to edit users" }, 403);

    const userId: string | undefined = body.user_id;
    if (!userId) return jsonResponse({ error: "user_id is required" }, 400);

    const patch: Record<string, unknown> = {};
    for (const field of ["full_name", "phone", "notes"]) {
      if (field in body) patch[field] = body[field] || null;
    }
    if (Object.keys(patch).length) {
      const { error: rowErr } = await admin.from("app_users").update(patch).eq("id", userId);
      if (rowErr) return jsonResponse({ error: rowErr.message }, 400);
    }

    if (body.email) {
      const { data: existing } = await admin.auth.admin.getUserById(userId);
      if (existing?.user && existing.user.email !== body.email) {
        const { error: emailErr } = await admin.auth.admin.updateUserById(userId, { email: body.email });
        if (emailErr) return jsonResponse({ error: emailErr.message }, 400);
      }
    }

    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: `unknown action "${body.action}"` }, 400);
});
