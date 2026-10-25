// deno test supabase/functions/customer-context/itinerary.test.ts
// The choice and the formatting of the itinerary block that customer-context gives Max.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildItineraryBlock, ITINERARY_MAX, pickNextTripItinerary } from "./itinerary.ts";

const madeira = { name: "מדיירה, נובמבר 2026", departure_date: "2026-11-08", text: "יום 01 · פונשל\nיום 02 · פורטלה" };
const montenegro = { name: "מונטנגרו, מרץ 2027", departure_date: "2027-03-14", text: "יום 01 · קולאשין" };

const trip = (over: Partial<Parameters<typeof pickNextTripItinerary>[0][number]>) => ({
  journey_name: "מדיירה, נובמבר 2026",
  departure_date: "2026-11-08",
  registration_status: "משוריין",
  timing: "upcoming" as const,
  ...over,
});

Deno.test("an upcoming trip gets its own itinerary", () => {
  const picked = pickNextTripItinerary([trip({})], [madeira]);
  assertEquals(picked?.journey_name, "מדיירה, נובמבר 2026");
  assertStringIncludes(buildItineraryBlock(picked), "יום 02 · פורטלה");
});

Deno.test("the nearest upcoming trip wins, not the farthest", () => {
  const picked = pickNextTripItinerary(
    [trip({}), trip({ journey_name: "מונטנגרו, מרץ 2027", departure_date: "2027-03-14" })],
    [madeira, montenegro],
  );
  assertEquals(picked?.departure_date, "2026-11-08");
});

Deno.test("a finished trip is never quoted", () => {
  assertEquals(pickNextTripItinerary([trip({ timing: "past" })], [madeira]), null);
});

Deno.test("a cancelled registration is never quoted", () => {
  assertEquals(pickNextTripItinerary([trip({ registration_status: "בוטל" })], [madeira]), null);
});

Deno.test("an empty itinerary leaves the prompt untouched", () => {
  assertEquals(pickNextTripItinerary([trip({})], [{ ...madeira, text: "   " }]), null);
  assertEquals(buildItineraryBlock(null), "");
});

Deno.test("a journey the customer is not registered to is ignored", () => {
  assertEquals(pickNextTripItinerary([trip({ journey_name: "אחר" })], [madeira]), null);
});

Deno.test("the block is capped", () => {
  const long = "א".repeat(ITINERARY_MAX + 500);
  const block = buildItineraryBlock({ journey_name: "x", departure_date: "2026-11-08", itinerary: long });
  assertStringIncludes(block, "(itinerary truncated)");
  assertEquals(block.length < ITINERARY_MAX + 400, true);
});
