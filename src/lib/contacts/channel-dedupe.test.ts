import { describe, it, expect } from "vitest";
import { findExistingContactByExternalId } from "./channel-dedupe";

function makeMockDb(row: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: row, error: null }),
            }),
          }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("findExistingContactByExternalId", () => {
  it("returns the contact row when found", async () => {
    const db = makeMockDb({ id: "c1", channel: "instagram", external_id: "17841400" });
    const result = await findExistingContactByExternalId(db, "acc1", "instagram", "17841400");
    expect(result).toEqual({ id: "c1", channel: "instagram", external_id: "17841400" });
  });

  it("returns null when no row matches", async () => {
    const db = makeMockDb(null);
    const result = await findExistingContactByExternalId(db, "acc1", "instagram", "missing");
    expect(result).toBeNull();
  });
});
