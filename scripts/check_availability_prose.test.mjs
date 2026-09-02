import assert from "node:assert/strict";
import test from "node:test";
import { findViolations, isGated } from "./check_availability_prose.mjs";

test("flags a stale caveat on a live route", () => {
  const violations = findViolations({
    paths: {
      "/v1/fund-letters": {
        get: { summary: "List letters", description: "Returns 404 until the letters plane is enabled." },
      },
    },
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /GET \/v1\/fund-letters: description claims unavailability/);
});

test("flags a '(currently unavailable)' summary", () => {
  const violations = findViolations({
    paths: { "/v1/filings/events": { get: { summary: "Filing events endpoint (currently unavailable)", description: "x" } } },
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /summary claims unavailability/);
});

test("allows the caveat on a genuinely gated-off family", () => {
  assert.ok(isGated("/v1/embed/owners/13f/managers"));
  assert.deepEqual(
    findViolations({
      paths: { "/v1/embed/letters": { get: { summary: "Letters embed", description: "Returns 404 until the embed is enabled." } } },
    }),
    [],
  );
});

test("allows conditional phrasing, which stays true either way", () => {
  assert.deepEqual(
    findViolations({
      paths: { "/v1/embed/macro/calendar": { get: { summary: "Calendar", description: "Returns 404 while the market embed is off." } } },
    }),
    [],
  );
});

test("passes clean prose", () => {
  assert.deepEqual(
    findViolations({ paths: { "/v1/situations": { get: { summary: "List situations", description: "Lists situations." } } } }),
    [],
  );
});
