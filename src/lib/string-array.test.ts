import { describe, expect, it } from "vitest";
import { stringArray } from "@/lib/string-array";

describe("stringArray", () => {
  it("returns arrays of strings unchanged", () => {
    expect(stringArray([])).toEqual([]);
    expect(stringArray(["EXPENSES:EDIT", "TASKS:VIEW"])).toEqual(["EXPENSES:EDIT", "TASKS:VIEW"]);
  });

  it("rejects anything else instead of reading it as an empty list", () => {
    for (const bad of [null, undefined, "EXPENSES:EDIT", 3, {}, [1], ["a", null], [["a"]]]) {
      expect(() => stringArray(bad, "permissionDenials")).toThrow("permissionDenials must be a JSON array of strings.");
    }
  });
});
