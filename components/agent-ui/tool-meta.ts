// Display helpers for tool calls: icon, source label, friendly title.
import {
  CalculatorIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CalendarSearchIcon,
  CalendarXIcon,
  ClockIcon,
  DatabaseIcon,
  FileTextIcon,
  GlobeIcon,
  PlugIcon,
  UserSearchIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";
import { getCuratedServer } from "@/lib/agent/mcp/servers";
import type { CustomMcpServer, ToolCallRecord } from "@/lib/types";

const BUILTIN_ICONS: Record<string, LucideIcon> = {
  web_search: GlobeIcon,
  fetch_url: FileTextIcon,
  get_current_time: ClockIcon,
  calculate: CalculatorIcon,
  run_sql_query: DatabaseIcon,
  find_patient: UserSearchIcon,
  list_available_slots: CalendarSearchIcon,
  book_appointment: CalendarCheckIcon,
  reschedule_appointment: CalendarClockIcon,
  cancel_appointment: CalendarXIcon,
  get_appointments_for_patient: CalendarSearchIcon,
};

export function toolIcon(call: Pick<ToolCallRecord, "name" | "source">): LucideIcon {
  if (call.source?.startsWith("mcp:")) return PlugIcon;
  return BUILTIN_ICONS[call.name] ?? WrenchIcon;
}

/** The tool's icon element (kept out of render-time component creation). */
export function ToolIcon({ call, className }: { call: Pick<ToolCallRecord, "name" | "source">; className?: string }) {
  return createElement(toolIcon(call), { className });
}

/** "Built-in", "DeepWiki", "Clinic demo", custom server name… */
export function sourceLabel(source: string | undefined, custom: CustomMcpServer[] = []): string {
  if (!source || source === "builtin") return "Built-in";
  if (source === "preset:clinic") return "Clinic demo";
  if (source === "preset:sql") return "SQL demo";
  if (source.startsWith("mcp:")) {
    const id = source.slice(4);
    return getCuratedServer(id)?.name ?? custom.find((c) => c.id === id)?.name ?? "MCP server";
  }
  return source;
}

/** Fallback title when the server sent no label. */
export function toolTitle(call: Pick<ToolCallRecord, "name" | "label">): string {
  if (call.label) return call.label;
  const bare = call.name.includes("__") ? call.name.split("__").slice(1).join("__") : call.name;
  const words = bare.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function parseArgs(args: string): Record<string, unknown> {
  try {
    const v = JSON.parse(args || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : { input: v };
  } catch {
    return { raw: args };
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
