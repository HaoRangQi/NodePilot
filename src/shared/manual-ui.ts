import type {
  ManualUiPoint,
  ManualUiSnapshot,
  ManualUiSnapshotAppState,
  ManualUiRect,
  ManualUiWindowSnapshot,
} from "./types/backend";

export type ManualUiSnapshotConfig = {
  enabled: boolean;
  presetProjectDir: string | null;
};

export type { ManualUiSnapshotAppState } from "./types/backend";

type EnvShape = Record<string, string | boolean | undefined>;

const INTERACTIVE_SELECTOR = "button, input, select, textarea, [role='dialog']";
const CONTEXT_SELECTOR = "article, section, .panel, .hero-panel, .project-detail, .activity-card";
const HEADING_SELECTOR = "h1, h2, h3";

export function getManualUiSnapshotConfig(
  env: EnvShape = import.meta.env as unknown as EnvShape,
): ManualUiSnapshotConfig {
  const rawValue = env.VITE_NODEPILOT_MANUAL_UI_SNAPSHOT;
  const presetProjectDir = normalizeEnvString(env.VITE_NODEPILOT_MANUAL_PROJECT_DIR);
  return {
    enabled: rawValue === true || rawValue === "1" || rawValue === "true",
    presetProjectDir,
  };
}

function normalizeEnvString(value: string | boolean | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function collectManualUiSnapshot(
  root: HTMLElement,
  app: ManualUiSnapshotAppState,
  windowSnapshot: ManualUiWindowSnapshot | null = null,
): ManualUiSnapshot {
  const ownerWindow = root.ownerDocument.defaultView ?? window;
  const dialogs = Array.from(root.querySelectorAll<HTMLElement>("[role='dialog']"))
    .filter(isVisible)
    .map((dialog, index) => {
      const rect = rectFrom(dialog.getBoundingClientRect());
      return {
        id: dialog.dataset.manualId ?? `dialog-${index + 1}`,
        title: dialogTitle(dialog),
        rect,
        screenRectLogical: screenRectLogical(rect, windowSnapshot),
        screenRectPhysical: screenRectPhysical(rect, windowSnapshot),
      };
    });

  const elements = Array.from(root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR))
    .filter(isVisible)
    .map((element, index) => {
      const role = elementRole(element);
      const label = elementLabel(element);
      const text = elementText(element);
      const dialog = closestDialogTitle(element);
      const context = elementContext(element);
      const rect = rectFrom(element.getBoundingClientRect());
      const logicalRect = screenRectLogical(rect, windowSnapshot);
      const physicalRect = screenRectPhysical(rect, windowSnapshot);

      return {
        id: element.dataset.manualId ?? autoElementId(role, label, context, index),
        role,
        label,
        text,
        context,
        dialog,
        disabled: isDisabled(element),
        rect,
        screenRectLogical: logicalRect,
        screenRectPhysical: physicalRect,
        screenCenterLogical: rectCenter(logicalRect),
        screenCenterPhysical: rectCenter(physicalRect),
      };
    });

  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    viewport: {
      width: ownerWindow.innerWidth,
      height: ownerWindow.innerHeight,
    },
    window: windowSnapshot,
    app,
    dialogs,
    elements,
  };
}

export function snapshotFingerprint(snapshot: ManualUiSnapshot): string {
  return JSON.stringify({
    viewport: snapshot.viewport,
    window: snapshot.window,
    app: snapshot.app,
    dialogs: snapshot.dialogs,
    elements: snapshot.elements.map((element) => ({
      id: element.id,
      role: element.role,
      label: element.label,
      text: element.text,
      context: element.context,
      dialog: element.dialog,
      disabled: element.disabled,
      rect: element.rect,
      screenRectLogical: element.screenRectLogical,
      screenRectPhysical: element.screenRectPhysical,
      screenCenterLogical: element.screenCenterLogical,
      screenCenterPhysical: element.screenCenterPhysical,
    })),
  });
}

function rectFrom(rect: DOMRect | DOMRectReadOnly): ManualUiRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function screenRectLogical(
  rect: ManualUiRect,
  windowSnapshot: ManualUiWindowSnapshot | null,
): ManualUiRect | null {
  const origin = windowSnapshot?.clientOriginLogical;
  if (!origin) return null;
  return {
    x: Math.round(origin.x + rect.x),
    y: Math.round(origin.y + rect.y),
    width: rect.width,
    height: rect.height,
  };
}

function screenRectPhysical(
  rect: ManualUiRect,
  windowSnapshot: ManualUiWindowSnapshot | null,
): ManualUiRect | null {
  const origin = windowSnapshot?.clientOriginPhysical;
  const scaleFactor = windowSnapshot?.scaleFactor;
  if (!origin || !scaleFactor) return null;

  return {
    x: Math.round(origin.x + rect.x * scaleFactor),
    y: Math.round(origin.y + rect.y * scaleFactor),
    width: Math.round(rect.width * scaleFactor),
    height: Math.round(rect.height * scaleFactor),
  };
}

function rectCenter(rect: ManualUiRect | null): ManualUiPoint | null {
  if (!rect) return null;
  return {
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
  };
}

function isVisible(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  const computedStyle = view?.getComputedStyle(element);
  if (!computedStyle) return true;

  return computedStyle.display !== "none" && computedStyle.visibility !== "hidden";
}

function isDisabled(element: HTMLElement): boolean {
  if ("disabled" in element && typeof element.disabled === "boolean") {
    return element.disabled;
  }

  return element.getAttribute("aria-disabled") === "true";
}

function elementRole(element: HTMLElement): string {
  return (
    element.getAttribute("role") ??
    {
      BUTTON: "button",
      INPUT: "input",
      SELECT: "select",
      TEXTAREA: "textarea",
    }[element.tagName] ??
    element.tagName.toLowerCase()
  );
}

function elementLabel(element: HTMLElement): string {
  const ariaLabel = normalizeText(element.getAttribute("aria-label"));
  if (ariaLabel) return ariaLabel;

  const labelledBy = normalizeText(labelledByText(element));
  if (labelledBy) return labelledBy;

  const title = normalizeText(element.getAttribute("title"));
  if (title) return title;

  const text = elementText(element);
  if (text) return text;

  return element.tagName.toLowerCase();
}

function elementText(element: HTMLElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return normalizeText(element.value) || normalizeText(element.placeholder);
  }

  if (element instanceof HTMLSelectElement) {
    return normalizeText(element.selectedOptions[0]?.textContent);
  }

  return normalizeText(element.textContent);
}

function labelledByText(element: HTMLElement): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (!labelledBy) return "";

  return labelledBy
    .split(/\s+/)
    .map((id) => normalizeText(element.ownerDocument.getElementById(id)?.textContent))
    .filter(Boolean)
    .join(" ");
}

function closestDialogTitle(element: HTMLElement): string | null {
  const dialog = element.closest<HTMLElement>("[role='dialog']");
  if (!dialog) return null;
  return dialogTitle(dialog);
}

function dialogTitle(dialog: HTMLElement): string {
  const labelledBy = normalizeText(labelledByText(dialog));
  if (labelledBy) return labelledBy;

  const heading = normalizeText(dialog.querySelector(HEADING_SELECTOR)?.textContent);
  if (heading) return heading;

  return normalizeText(dialog.textContent) || "dialog";
}

function elementContext(element: HTMLElement): string | null {
  const closestDialog = element.closest<HTMLElement>("[role='dialog']");
  if (closestDialog) {
    const title = dialogTitle(closestDialog);
    if (title) return title;
  }

  const container = element.closest<HTMLElement>(CONTEXT_SELECTOR);
  if (!container) return null;

  const heading = normalizeText(container.querySelector(HEADING_SELECTOR)?.textContent);
  if (heading) return heading;

  const text = normalizeText(container.textContent);
  return text || null;
}

function autoElementId(role: string, label: string, context: string | null, index: number): string {
  const parts = [role, label, context ?? `${index + 1}`]
    .map((value) => slugify(value))
    .filter(Boolean);

  return parts.join(":");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
