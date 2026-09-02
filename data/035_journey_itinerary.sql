-- Journey full itinerary (Goldi 01.09: the CRM becomes the AI agent's
-- knowledge base — the site carries a full day-by-day route; "תיאור קצר"
-- (2 sentences) is not enough. One big text field, read by Max.)
alter table journeys add column if not exists itinerary text;

comment on column journeys.itinerary is 'Full day-by-day journey description (route, days, places, included content) — primary knowledge source for the Max AI agent';