export const PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif; }
button { font: inherit; cursor: pointer; }
.launcher { width: 48px; height: 48px; border-radius: 50%; border: none; background: #0f766e; color: #fff; box-shadow: 0 6px 20px rgba(15,118,110,.35); display: grid; place-items: center; transition: transform .15s; }
.launcher:hover { transform: scale(1.06); }
.launcher-mark { font-size: 18px; font-weight: 700; }
.panel { width: 340px; max-height: min(78vh, 680px); display: flex; flex-direction: column; background: #fff; color: #1f2937; border-radius: 14px; box-shadow: 0 16px 48px rgba(15,23,42,.22); border: 1px solid #e5e7eb; overflow: hidden; font-size: 13px; }
header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
.title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; flex: 1; }
.logo { width: 22px; height: 22px; border-radius: 6px; background: #0f766e; color: #fff; display: grid; place-items: center; font-size: 12px; }
.lang, .map { border: 1px solid #e5e7eb; border-radius: 6px; padding: 3px 6px; font-size: 12px; background: #fff; color: #374151; max-width: 120px; }
.close { border: none; background: none; font-size: 20px; line-height: 1; color: #9ca3af; padding: 0 2px; }
.close:hover { color: #111827; }
.body { padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.profile-line { display: flex; align-items: center; gap: 6px; color: #4b5563; }
.dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.dot.on { background: #10b981; } .dot.off { background: #f59e0b; }
.muted { color: #9ca3af; }
.warn { background: #fffbeb; color: #92400e; border-radius: 8px; padding: 8px 10px; }
.warn a { color: #0f766e; margin-left: 6px; }
.primary { background: #0f766e; color: #fff; border: none; border-radius: 8px; padding: 8px 12px; font-weight: 600; }
.primary:hover:not(:disabled) { background: #115e59; }
.primary:disabled { opacity: .55; cursor: default; }
.big { padding: 11px 12px; font-size: 14px; }
.secondary { background: #f0fdfa; color: #0f766e; border: 1px solid #99f6e4; border-radius: 8px; padding: 7px 10px; font-weight: 600; width: 100%; }
.link { background: none; border: none; color: #0f766e; padding: 2px 0; text-align: left; }
.link.small { color: #9ca3af; font-size: 12px; order: 9; }
.check { display: flex; align-items: center; gap: 6px; color: #6b7280; font-size: 12px; }
.message { background: #f8fafc; border-radius: 8px; padding: 8px 10px; color: #334155; }
.note { color: #92400e; font-size: 12px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { border-radius: 999px; padding: 2px 9px; font-size: 12px; font-weight: 600; }
.chip.ok { background: #ecfdf5; color: #047857; } .chip.warn { background: #fffbeb; color: #b45309; } .chip.muted { background: #f3f4f6; color: #6b7280; }
.group { display: flex; flex-direction: column; gap: 4px; }
.group-title { font-weight: 600; color: #111827; display: flex; align-items: center; gap: 6px; margin-top: 2px; }
.count { background: #f3f4f6; color: #6b7280; border-radius: 999px; padding: 0 7px; font-size: 11px; font-weight: 600; }
.hint { color: #9ca3af; font-size: 12px; }
.row { display: flex; align-items: center; gap: 6px; border-radius: 8px; padding: 2px 4px 2px 8px; border-left: 3px solid #e5e7eb; background: #fafafa; }
.row.status-uncertain { border-left-color: #f59e0b; } .row.status-failed { border-left-color: #ef4444; } .row.status-question { border-left-color: #6366f1; }
.row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; background: none; border: none; padding: 5px 0; text-align: left; color: inherit; }
.row-label { font-weight: 500; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-sub { color: #6b7280; font-size: 12px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini { border: 1px solid #c7d2fe; background: #eef2ff; color: #4338ca; border-radius: 6px; padding: 3px 8px; font-size: 12px; white-space: nowrap; }
.mini:disabled { opacity: .6; }
.mini.wide { width: 100%; padding: 6px 8px; }
.capture { border: 1px solid #99f6e4; background: #f0fdfa; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
.capture-list { display: flex; flex-direction: column; gap: 3px; max-height: 260px; overflow-y: auto; }
.capture-row { display: flex; align-items: flex-start; gap: 6px; padding: 4px 6px; border-radius: 6px; background: #fff; cursor: pointer; }
.capture-row input { margin-top: 3px; }
.capture-row .row-main { padding: 0; }
.capture-row .was { color: #b45309; font-size: 12px; }
.capture-actions { display: flex; gap: 6px; }
.capture-actions .primary { flex: 1; }
.capture-actions .link { padding: 0 6px; }
.footer { border-top: 1px solid #f1f5f9; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.footer:empty { display: none; }
.record { display: flex; flex-direction: column; gap: 6px; }
.record-title { font-weight: 600; }
.record input { border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 8px; font: inherit; }
@media (prefers-color-scheme: dark) {
  .panel { background: #111827; color: #e5e7eb; border-color: #1f2937; }
  header, .footer { border-color: #1f2937; }
  .row { background: #1f2937; border-left-color: #374151; }
  .group-title { color: #f3f4f6; } .row-sub, .profile-line { color: #9ca3af; }
  .message { background: #1f2937; color: #e5e7eb; } .lang, .map, .record input { background: #1f2937; color: #e5e7eb; border-color: #374151; }
  .count, .chip.muted { background: #1f2937; color: #9ca3af; }
  .capture { background: #0f2a28; border-color: #115e59; } .capture-row { background: #1f2937; }
}
`;
