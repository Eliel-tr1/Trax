// The day by day itinerary that customer-context hands to Max.
// Pure functions only, so the choice can be tested without a server or a database.
// See docs/decisions/0013-journey-itinerary-for-max.md.

export type TripLike = {
  journey_name: string | null;
  departure_date: string | null;
  registration_status: string | null;
  timing: "upcoming" | "ongoing" | "past" | "unknown";
};

export type TripItinerary = { name: string | null; departure_date: string | null; text: string };

export type NextTripItinerary = {
  journey_name: string | null;
  departure_date: string | null;
  itinerary: string;
};

/** The trips that still matter: not cancelled, not finished. */
const isLive = (t: TripLike) =>
  t.registration_status !== "בוטל" && (t.timing === "upcoming" || t.timing === "ongoing");

const tripKey = (name: string | null, departure: string | null) => `${name || ""}|${departure || ""}`;

/**
 * The itinerary to put in front of Max: the trip happening now, else the nearest upcoming one.
 * A past trip or an unregistered journey never qualifies, so a finished journey cannot be quoted
 * as the plan for a customer who already came back.
 */
export function pickNextTripItinerary(
  trips: TripLike[],
  itineraries: TripItinerary[],
): NextTripItinerary | null {
  const live = new Set(trips.filter(isLive).map((t) => tripKey(t.journey_name, t.departure_date)));
  if (!live.size) return null;
  let best: NextTripItinerary | null = null;
  for (const it of itineraries) {
    const text = (it.text || "").trim();
    if (!text) continue;
    if (!live.has(tripKey(it.name, it.departure_date))) continue;
    if (!best || String(it.departure_date || "") < String(best.departure_date || "")) {
      best = { journey_name: it.name, departure_date: it.departure_date, itinerary: text };
    }
  }
  return best;
}

/** Hard cap: the block rides in every prompt of a customer with a live trip. */
export const ITINERARY_MAX = 7000;

/** The prompt block. Empty when there is nothing to quote, so the prompt never grows for nothing. */
export function buildItineraryBlock(picked: NextTripItinerary | null): string {
  if (!picked) return "";
  const text = picked.itinerary.trim();
  if (!text) return "";
  const body = text.length > ITINERARY_MAX ? text.slice(0, ITINERARY_MAX) + "\n(itinerary truncated)" : text;
  return (
    `\nDay by day itinerary of ${picked.journey_name || "his trip"}, from the CRM. ` +
    `Answer a question about a day from here, and never invent a day that is not written here:\n${body}\n`
  );
}
