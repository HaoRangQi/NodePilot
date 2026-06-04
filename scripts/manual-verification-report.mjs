export const MANUAL_VERIFICATION_SECTIONS = {
  'macos-linux': {
    heading: "### 10.2 Manual macOS/Linux Verification",
    items: [
      { key: "detect", label: "detect。" },
      { key: "install_nvm", label: "install nvm。" },
      { key: "list_installed", label: "list installed。" },
      { key: "list_remote", label: "list remote。" },
      { key: "install_node", label: "install Node。" },
      { key: "activate_node", label: "activate Node。" },
      { key: "set_default", label: "set default。" },
      { key: "uninstall_node", label: "uninstall Node。" },
      { key: "read_nvmrc", label: "read `.nvmrc`。" },
      { key: "apply_nvmrc", label: "apply `.nvmrc`。" },
    ],
  },
  windows: {
    heading: "### 10.3 Manual Windows Verification",
    items: [
      { key: "detect_nvm_windows", label: "detect `nvm-windows`。" },
      { key: "list_installed", label: "list installed。" },
      { key: "list_available", label: "list available。" },
      { key: "install_node", label: "install Node。" },
      { key: "use_node", label: "use Node。" },
      { key: "uninstall_node", label: "uninstall Node。" },
      { key: "admin_hint", label: "admin 权限提示。" },
      { key: "arch_selection", label: "arch 选择。" },
    ],
  },
};

export function createAutomationPlan({
  commands = [],
  backendScope = [],
  manualFocus = [],
} = {}) {
  return {
    commands,
    backendScope,
    manualFocus,
  };
}

function sectionFor(platform) {
  const section = MANUAL_VERIFICATION_SECTIONS[platform];
  if (!section) {
    throw new Error(`Unsupported manual verification platform: ${platform}`);
  }
  return section;
}

export function listManualVerificationItemKeys(platform) {
  return sectionFor(platform).items.map(({ key }) => key);
}

export function createManualVerificationTemplate(platform, metadata = {}, automationPlan = null) {
  const section = sectionFor(platform);
  const items = Object.fromEntries(section.items.map(({ key }) => [key, false]));

  return {
    schemaVersion: 1,
    platform,
    generatedAt: new Date().toISOString(),
    metadata,
    automationPlan,
    items,
    notes: {},
  };
}

export function renderManualExecutionChecklist(platform, result) {
  const section = sectionFor(platform);
  const lines = [
    `# ${platform === 'macos-linux' ? 'macOS/Linux' : 'Windows'} Manual Verification Checklist`,
    "",
    "完成一项就把对应项从 `false` 改成 `true`，并可在 `notes` 中补充实际观察结果。",
    "",
  ];

  if (result?.metadata) {
    const metadataLines = Object.entries(result.metadata)
      .filter(([, value]) => value !== undefined && value !== null && `${value}`.length > 0)
      .map(([key, value]) => `- ${key}: \`${value}\``);
    if (metadataLines.length > 0) {
      lines.push("## Metadata", "", ...metadataLines, "");
    }
  }

  const automationPlan = result?.automationPlan;
  if (automationPlan) {
    lines.push("## Automation Baseline", "");

    if (Array.isArray(automationPlan.commands) && automationPlan.commands.length > 0) {
      lines.push("先跑这些自动化命令，确认 backend / dev 链路本身已经是绿的：", "");
      for (const command of automationPlan.commands) {
        lines.push(`- \`${command}\``);
      }
      lines.push("");
    }

    if (Array.isArray(automationPlan.backendScope) && automationPlan.backendScope.length > 0) {
      lines.push("自动化已覆盖或应先覆盖的 backend 语义：", "");
      for (const item of automationPlan.backendScope) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }

    if (Array.isArray(automationPlan.manualFocus) && automationPlan.manualFocus.length > 0) {
      lines.push("人工验收只重点看这些 UI / 交互事实：", "");
      for (const item of automationPlan.manualFocus) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
  }

  lines.push("## Checklist", "");
  for (const item of section.items) {
    const checked = result?.items?.[item.key] ? "x" : " ";
    const note = result?.notes?.[item.key];
    lines.push(`- [${checked}] ${item.label}`);
    if (note) {
      lines.push(`  - 备注：${note}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

export function updateManualVerificationReport(report, updates = {}, noteUpdates = {}) {
  const validKeys = new Set(listManualVerificationItemKeys(report.platform));
  const nextItems = { ...(report.items ?? {}) };
  const nextNotes = { ...(report.notes ?? {}) };

  for (const [key, value] of Object.entries(updates)) {
    if (!validKeys.has(key)) {
      throw new Error(`Unsupported manual verification item for ${report.platform}: ${key}`);
    }
    nextItems[key] = Boolean(value);
  }

  for (const [key, value] of Object.entries(noteUpdates)) {
    if (!validKeys.has(key)) {
      throw new Error(`Unsupported manual verification note item for ${report.platform}: ${key}`);
    }
    if (value === undefined || value === null || `${value}`.trim().length === 0) {
      delete nextNotes[key];
    } else {
      nextNotes[key] = `${value}`;
    }
  }

  return {
    ...report,
    updatedAt: new Date().toISOString(),
    items: nextItems,
    notes: nextNotes,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function syncExecutionDocument(executionDoc, report, options = {}) {
  const { allowUncheck = false } = options;
  const section = sectionFor(report.platform);
  const sectionStart = executionDoc.indexOf(section.heading);
  if (sectionStart === -1) {
    throw new Error(`Could not find section heading: ${section.heading}`);
  }

  const nextHeadingOffset = executionDoc
    .slice(sectionStart + section.heading.length)
    .search(/\n### /);
  const sectionEnd =
    nextHeadingOffset === -1
      ? executionDoc.length
      : sectionStart + section.heading.length + nextHeadingOffset + 1;

  const prefix = executionDoc.slice(0, sectionStart);
  let sectionText = executionDoc.slice(sectionStart, sectionEnd);
  const suffix = executionDoc.slice(sectionEnd);

  let changed = 0;
  for (const item of section.items) {
    const itemState = Boolean(report.items?.[item.key]);
    if (!itemState && !allowUncheck) {
      continue;
    }

    const nextLine = `- [${itemState ? "x" : " "}] ${item.label}`;
    const pattern = new RegExp(`^- \\[[ x]\\] ${escapeRegExp(item.label)}$`, "m");
    if (!pattern.test(sectionText)) {
      throw new Error(`Could not find checklist item: ${item.label}`);
    }

    const previous = sectionText.match(pattern)?.[0] ?? null;
    sectionText = sectionText.replace(pattern, nextLine);
    if (previous !== nextLine) {
      changed += 1;
    }
  }

  return {
    content: `${prefix}${sectionText}${suffix}`,
    changed,
  };
}
