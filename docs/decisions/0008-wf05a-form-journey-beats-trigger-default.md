# 0008 - Lead's form journey choice beats the auto-sale trigger default

**Context** (01.10, client complaint): every Facebook lead landed with
"מסע מבוקש" = Madeira regardless of the trip picked in the form. The
`customers_auto_create_sale` DB trigger (data/023, 041) opens a sale with the
nearest `פתוח להרשמה` journey on every customer INSERT. `wf05a-crm-sync` then
found that open sale and only set a journey "if empty", so the form choice
(resolved since 16.09) was never applied to a new lead.

**Decision**: in the open-sale branch, resolve the form choice with NO
default fallback. If it matches a journey and either the customer was created
in this request or the sale's journey still equals the nearest-open default,
set the choice. No choice: old behavior (default only if empty).

**Why not change the trigger**: the trigger has no access to the form
payload; passing it through would couple DB DDL to one intake path. The guard
(new customer or still-default) keeps a journey a rep picked by hand on an
existing customer from being overwritten by a repeat submission.
