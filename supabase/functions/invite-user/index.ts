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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
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

  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(body.email);
  if (inviteErr) return jsonResponse({ error: inviteErr.message }, 400);

  const { error: rowErr } = await admin.from("app_users").insert({
    id: invited.user.id,
    full_name: body.full_name,
    role_id: role.id,
    department,
    permission_profile,
  });
  if (rowErr) return jsonResponse({ error: rowErr.message }, 400);

  return jsonResponse({ success: true, user_id: invited.user.id }, 201);
});
