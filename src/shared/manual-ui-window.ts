import type {
  ManualUiPoint,
  ManualUiSize,
  ManualUiWindowSnapshot,
} from "./types/backend";

type WindowGeometryInput = {
  scaleFactor: number;
  innerPosition: ManualUiPoint;
  outerPosition: ManualUiPoint;
  innerSize: ManualUiSize;
  outerSize: ManualUiSize;
};

export async function readManualUiWindowSnapshot(): Promise<ManualUiWindowSnapshot | null> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const currentWindow = getCurrentWindow();
    const [scaleFactor, innerPosition, outerPosition, innerSize, outerSize] = await Promise.all([
      currentWindow.scaleFactor(),
      currentWindow.innerPosition(),
      currentWindow.outerPosition(),
      currentWindow.innerSize(),
      currentWindow.outerSize(),
    ]);

    return buildManualUiWindowSnapshot({
      scaleFactor,
      innerPosition: point(innerPosition.x, innerPosition.y),
      outerPosition: point(outerPosition.x, outerPosition.y),
      innerSize: size(innerSize.width, innerSize.height),
      outerSize: size(outerSize.width, outerSize.height),
    });
  } catch {
    return null;
  }
}

export function buildManualUiWindowSnapshot(
  input: WindowGeometryInput,
): ManualUiWindowSnapshot {
  const scaleFactor = Number.isFinite(input.scaleFactor) && input.scaleFactor > 0
    ? input.scaleFactor
    : null;

  return {
    scaleFactor,
    innerPositionPhysical: point(input.innerPosition.x, input.innerPosition.y),
    outerPositionPhysical: point(input.outerPosition.x, input.outerPosition.y),
    innerSizePhysical: size(input.innerSize.width, input.innerSize.height),
    outerSizePhysical: size(input.outerSize.width, input.outerSize.height),
    clientOriginLogical:
      scaleFactor === null
        ? null
        : point(input.innerPosition.x / scaleFactor, input.innerPosition.y / scaleFactor),
    clientOriginPhysical: point(input.innerPosition.x, input.innerPosition.y),
  };
}

function point(x: number, y: number): ManualUiPoint {
  return {
    x: Math.round(x),
    y: Math.round(y),
  };
}

function size(width: number, height: number): ManualUiSize {
  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}
