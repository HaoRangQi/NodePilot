import { describe, expect, it } from "vitest";

import { buildManualUiWindowSnapshot } from "./manual-ui-window";

describe("manual ui window snapshot helpers", () => {
  it("derives logical client origin from physical window geometry", () => {
    expect(
      buildManualUiWindowSnapshot({
        scaleFactor: 2,
        innerPosition: { x: 1380, y: 452 },
        outerPosition: { x: 1380, y: 388 },
        innerSize: { width: 2360, height: 1456 },
        outerSize: { width: 2360, height: 1520 },
      }),
    ).toEqual({
      scaleFactor: 2,
      innerPositionPhysical: { x: 1380, y: 452 },
      outerPositionPhysical: { x: 1380, y: 388 },
      innerSizePhysical: { width: 2360, height: 1456 },
      outerSizePhysical: { width: 2360, height: 1520 },
      clientOriginLogical: { x: 690, y: 226 },
      clientOriginPhysical: { x: 1380, y: 452 },
    });
  });
});
