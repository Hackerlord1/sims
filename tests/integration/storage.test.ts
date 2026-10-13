import { describe, expect, it } from "vitest";
import { keyToPath, scanForMalware } from "@/server/storage";

describe("file storage safeguards", () => {
  it("rejects the EICAR anti-malware test signature even without an external scanner", async () => {
    const eicar = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
    await expect(scanForMalware(eicar, "invoice.pdf")).rejects.toMatchObject({ status: 422 });
    expect(await scanForMalware(Buffer.from("%PDF-1.4 fictional"), "invoice.pdf")).toBe("NOT_SCANNED");
  });

  it("refuses storage keys that could escape the storage folder", () => {
    for (const key of ["../etc/passwd", "ab/../../x", "ab\\cd", "zz/not-a-random-name"]) expect(() => keyToPath(key)).toThrow("Invalid storage key");
    expect(keyToPath(`ab/${"c".repeat(48)}`)).toMatch(/ab[\\/]c{48}$/);
  });
});
