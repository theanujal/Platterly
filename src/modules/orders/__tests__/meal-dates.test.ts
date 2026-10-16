import { describe, expect, it } from "vitest";
import { moveMealsWithEventDates } from "../meal-dates";

const meal = (date: string, mealType = "LUNCH") => ({ date, mealType });
const dates = (r: ReturnType<typeof moveMealsWithEventDates>) => r.moved.map((m) => `${m.date}|${m.mealType}`).sort();

describe("moveMealsWithEventDates", () => {
  it("moves a single day's meals to the new date", () => {
    expect(dates(moveMealsWithEventDates([meal("2026-10-22", "BREAKFAST")], "2026-10-22", "2026-11-06", "2026-11-06"))).toEqual(["2026-11-06|BREAKFAST"]);
  });
  it("keeps the spacing of a multi-day plan when the whole range moves", () => {
    const r = moveMealsWithEventDates([meal("2026-10-22"), meal("2026-10-24")], "2026-10-22", "2026-11-06", "2026-11-08");
    expect(dates(r)).toEqual(["2026-11-06|LUNCH", "2026-11-08|LUNCH"]);
  });
  it("puts a meal that would fall outside on the nearest event day, and merges same-type meals, keeping the one with content", () => {
    const meals = [{ ...meal("2026-10-22"), menuId: "" }, { ...meal("2026-10-23"), menuId: "m1" }, meal("2026-10-22", "DINNER")];
    const r = moveMealsWithEventDates(meals, "2026-10-22", "2026-10-22", "2026-10-22", (m) => "menuId" in m && Boolean((m as { menuId: string }).menuId));
    expect(dates(r)).toEqual(["2026-10-22|DINNER", "2026-10-22|LUNCH"]);
    expect(r.moved.find((m) => m.mealType === "LUNCH")).toMatchObject({ menuId: "m1" });
    expect(r.dropped).toHaveLength(1);
  });
  it("heals a meal already outside the dates when the dates did not change", () => {
    expect(dates(moveMealsWithEventDates([meal("2026-10-22")], "2026-11-06", "2026-11-06", "2026-11-06"))).toEqual(["2026-11-06|LUNCH"]);
  });
});
