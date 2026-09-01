// Invite a new user — owner-only. Creates the Supabase Auth user (email
// invite, no password set by us — they set it via the emailed link) and
// the matching app_users row with the chosen role.
//
// POST { email, full_name, role_key }
// Auth: caller's own Supabase session JWT (not an API key) — this is an
// in-app action, not an external integration. Verified against app_users
// + permissions('users','create').

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// supabase-js's functions.invoke() sends the caller's session as an
// Authorization header, which makes this a cross-origin request the browser
// preflights with an OPTIONS request before the real POST. Without these
// headers (and without answering OPTIONS at all) the browser's CORS check on
// the preflight fails silently and supabase-js reports it as a generic
// "Failed to send a request to the Edge Function" — the actual bug behind
// the invite flow's reported failure, not anything in the function's own
// logic below.
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

  // Identify the caller from their own JWT, then check permission as them.
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return jsonResponse({ error: "invalid session" }, 401);
  const callerId = userData.user.id;

  // can_access() relies on auth.uid(), which only resolves inside a real
  // RLS-authenticated request — not this service-role call — so check
  // directly against app_users/permissions instead.
  const { data: caller } = await admin.from("app_users").select("role_id, is_active").eq("id", callerId).single();
  if (!caller?.is_active) return jsonResponse({ error: "inactive account" }, 403);
  const { data: perm } = await admin.from("permissions").select("can_create").eq("role_id", caller.role_id).eq("resource", "users").maybeSingle();
  if (!perm?.can_create) return jsonResponse({ error: "not permitted to invite users" }, 403);

  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.full_name || !body?.role_key) {
    return jsonResponse({ error: "email, full_name and role_key are required" }, 400);
  }

  // department/permission_profile are optional free-standing metadata added
  // alongside the pre-existing role/role_id RBAC pair (see Settings.jsx's
  // InviteUserModal) — not validated against an enum here since the UI only
  // ever sends one of the three fixed dropdown values.
  const department: string | null = body.department || null;
  const permission_profile: string | null = body.permission_profile || null;

  const { data: role } = await admin.from("roles").select("id").eq("key", body.role_key).maybeSingle();
  if (!role) return jsonResponse({ error: `unknown role_key "${body.role_key}"` }, 400);

  // Direct-create (Goldi 01.09 #10): the admin sets the email + password in
  // the invite modal — NO invite email is sent (the old emailed link opened
  // nothing useful). Password optional: omit it and Supabase generates a
  // strong one we return once so the admin can hand it over.
  const password: string = body.password || crypto.randomUUID().slice(0, 12) + "Aa1!";

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: body.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: body.full_name },
  });
  if (createErr) return jsonResponse({ error: createErr.message }, 400);

  const { error: rowErr } = await admin.from("app_users").insert({
    id: created.user.id,
    full_name: body.full_name,
    role_id: role.id,
    department,
    permission_profile,
  });
  if (rowErr) return jsonResponse({ error: rowErr.message }, 400);

  return jsonResponse({ success: true, user_id: created.user.id, password }, 201);
});
