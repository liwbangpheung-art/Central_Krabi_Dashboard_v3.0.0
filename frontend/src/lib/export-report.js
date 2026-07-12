// export-report.js - Export helpers for CKAP v3
export function safeName(value) {
  return String(value || "report")
    .replace(/[^a-zA-Z0-9ก-๙_-]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function reportFilename(context, extension) {
  return `${safeName(context.organizationName)}_${safeName(context.moduleLabel)}_${safeName(context.periodLabel)}.${extension}`;
}
