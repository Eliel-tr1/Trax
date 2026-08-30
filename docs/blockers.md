# Blockers and open questions

Live as of 2026-08-30, from ClickUp's gaps hub (`86cbaaghg`, list
`901524934835`). Update this file as items resolve — don't let it go stale,
it's the one place both a human and an AI session can check before assuming
a value is final.

## 🔴 Blocking, needs the client

1. **Journeys list** — destination, departure/return dates, price/person,
   seat count, at least for October's departure. Promised 21.08, still
   late. Blocks all of Wave 2.
2. **Business verification docs for Meta** — business/incorporation
   certificate + address proof. Longest lead time in the project.
3. **Meta Business Manager admin access**, via the client's marketing
   agency (Laos). Without it, no WhatsApp Business permission — blocks the
   WhatsApp/voice agent entirely (not this CRM's build, but downstream of
   it).
4. **Price decision — three conflicting numbers, unresolved:**
   - $5,200/ticket (said live in the 09.08 spec meeting)
   - €5,000 (written in the CRM spec doc)
   - ≈€500/person excluding flights (said in the intro call — described as
     the real price, with website prices deliberately inflated)

   This is the number the AI agent will eventually quote real customers.
   **Do not seed/hardcode a price anywhere until this is resolved.**
5. Sumit account access, for the second business unit / payment
   integration.

## 🟠 Content approvals needed from Goldi

- Entity/field name sign-off — renaming after build cascades into every
  automation and AI-agent prompt.
- Which email address shows on the WhatsApp business card.
- Delivery-hours sign-off (proposed: Sun–Thu 08:00–21:00, Fri to 14:00).
- Avatar concept sign-off (illustrated character, not photorealistic —
  already decided, concept itself pending).

## 🔵 In Vitrue's own court

- Coordinating ad-account access / measurement params with Laos.
- Determining Xcon's existing lead-data state (unknown if there's anything
  to migrate).

## ⚖️ Unresolved disagreements between sources (owner: Sahar)

- Deadline anchor: "immediately after the spec meeting" (04.08 transcript)
  → 23.08 target, now passed, vs. "from system connection" → 03.09 target.
- Chapter-7 naming ambiguity ("מסע ליד ולקוח" collides with "מסע" =
  journey elsewhere) — alternative proposed: "מסלול הליד והלקוח".
- Whether "cost per qualified lead" belongs on the sales dashboard, and
  where the cost figure would come from.
- A Make.com account was opened despite N8N being the locked automation
  engine — unclear if it's backup/unused or should be closed.

## ✅ Locked decisions — do not reopen without a new decision record

Origami as CRM *(superseded for this repo — see
[decisions/0001-replace-origami-with-custom-crm.md](decisions/0001-replace-origami-with-custom-crm.md);
still the locked decision as far as the client knows)* · Voicenter as PBX,
3 numbers, all calls recorded+transcribed · Sumit for payments (2nd business
activity under the existing account) · multi-currency rejected · new
dedicated WhatsApp number · agent name "Max" · Hebrew-only agent,
multilingual out of scope · zero buttons in any client-facing message, even
templates (buttons only in internal alerts) · avatar = illustrated
character, not photorealistic · Lovable access (not SFTP/DNS) to the
client's own sites · club membership is not a trip-eligibility gate · a
repeat inquiry always opens a new deal, even for an existing customer ·
vendors out of scope · gpt-4.1 for agent conversations, gpt-4o-mini for
simple ops (intent/classification/routing) — **not Claude**, this is the
client's agent stack, unrelated to this repo's own tooling.
