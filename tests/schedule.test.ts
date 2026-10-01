// When a course meets on the Schedule calendars (src/lib/schedule.ts). Pure: no database needed.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { dayIndex, missingDays, occursOn, type Meets } from "../src/lib/schedule.js";

const days = (c: Meets, dates: string[]) => dates.filter((d) => occursOn(c, d));

describe("occursOn", () => {
  test("weekly: the chosen days, from the start date", () => {
    const c: Meets = { isRecurring: true, date: "2026-09-07", frequency: "Weekly", daysOfWeek: ["Mon", "Wed"] };
    assert.deepEqual(days(c, ["2026-08-31", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-14", "2026-09-16", "2026-09-18"]),
      ["2026-09-07", "2026-09-09", "2026-09-14", "2026-09-16"]);
  });
  test("full day names from older data work too", () => {
    const c: Meets = { isRecurring: true, date: "2026-09-07", frequency: "Weekly", daysOfWeek: ["Monday", "wednesday"] };
    assert.deepEqual(days(c, ["2026-09-07", "2026-09-09"]), ["2026-09-07", "2026-09-09"]);
  });
  test("daily: Monday to Friday only", () => {
    const c: Meets = { isRecurring: true, date: "2026-09-07", frequency: "Daily", daysOfWeek: [] };
    assert.deepEqual(days(c, ["2026-09-06", "2026-09-07", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14"]),
      ["2026-09-07", "2026-09-11", "2026-09-14"]);
  });
  test("bi-weekly: every other week from the start week", () => {
    const c: Meets = { isRecurring: true, date: "2026-09-07", frequency: "Bi-weekly", daysOfWeek: ["Mon"] };
    assert.deepEqual(days(c, ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"]), ["2026-09-07", "2026-09-21", "2026-10-05"]);
  });
  test("monthly: the chosen day in the same week of the month as the start", () => {
    const c: Meets = { isRecurring: true, date: "2026-09-07", frequency: "Monthly", daysOfWeek: ["Mon"] };   // 1st Monday
    assert.deepEqual(days(c, ["2026-09-07", "2026-09-14", "2026-10-05", "2026-10-12", "2026-11-02"]), ["2026-09-07", "2026-10-05", "2026-11-02"]);
  });
  test("once: only its date", () => {
    const c: Meets = { isRecurring: false, date: "2026-09-08" };
    assert.deepEqual(days(c, ["2026-09-07", "2026-09-08", "2026-09-15"]), ["2026-09-08"]);
  });
  test("recurring with no days: never, and flagged", () => {
    const c: Meets = { isRecurring: true, date: "2026-09-07", frequency: "Weekly", daysOfWeek: [] };
    assert.deepEqual(days(c, ["2026-09-07", "2026-09-08", "2026-09-09"]), []);
    assert.equal(missingDays(c), true);
    assert.equal(missingDays({ ...c, frequency: "Daily" }), false);
    assert.equal(missingDays({ ...c, daysOfWeek: ["Tue"] }), false);
    assert.equal(missingDays({ isRecurring: false, date: "2026-09-07" }), false);
  });
});

describe("dayIndex", () => {
  test("short, full and any-case names; junk is -1", () => {
    assert.deepEqual(["Sun", "Mon", "Monday", "monday", "SAT", "x", ""].map(dayIndex), [0, 1, 1, 1, 6, -1, -1]);
  });
});
