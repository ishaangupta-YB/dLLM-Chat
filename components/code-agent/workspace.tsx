"use client";

import type { ReactNode } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { toast } from "sonner";
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileArchiveIcon,
  FileCode2Icon,
  HistoryIcon,
  MonitorIcon,
  RotateCwIcon,
  SmartphoneIcon,
  TabletIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { pickPage } from "@/lib/code-agent/bundle";
import { sortPaths } from "@/lib/code-agent/files";
import { downloadBlob, openPreviewInNewTab } from "@/lib/code-agent/preview-url";
import { useProjectVersions } from "@/lib/code-agent/versions";
import { useWorkspaceStore, type PreviewDevice } from "@/lib/code-agent/workspace-store";
import { createZip } from "@/lib/code-agent/zip";
import { useChatStore } from "@/lib/store/chat-store";
import { cn } from "@/lib/utils";
import { restoreVersion } from "./code-chat";
import { CodePane } from "./code-pane";
import { PreviewPane } from "./preview-pane";

/** Segmented control on Radix Tabs (roving focus, arrow keys). */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  items,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; icon?: ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)} activationMode="automatic" className={cn("min-w-0", className)}>
      <TabsPrimitive.List
        aria-label={label}
        className="flex h-8 w-full items-center rounded-lg border border-border/70 bg-muted/60 p-0.5"
      >
        {items.map((it) => (
          <TabsPrimitive.Trigger
            key={it.value}
            value={it.value}
            className={cn(
              "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 font-medium text-muted-foreground text-xs outline-none transition-colors",
              "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60",
              "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs data-[state=active]:ring-1 data-[state=active]:ring-border/80 dark:data-[state=active]:bg-accent",
            )}
          >
            {it.icon}
            {it.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
  testId,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
          data-testid={testId}
          className={cn("size-8 text-muted-foreground hover:text-foreground", pressed && "bg-accent text-foreground")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

const DEVICES: { id: PreviewDevice; label: string; icon: typeof MonitorIcon }[] = [
  { id: "desktop", label: "Desktop", icon: MonitorIcon },
  { id: "tablet", label: "Tablet (768px)", icon: TabletIcon },
  { id: "mobile", label: "Mobile (390px)", icon: SmartphoneIcon },
];

export function WorkspaceToolbar({ conversationId, showTabs = true }: { conversationId: string; showTabs?: boolean }) {
  const tab = useWorkspaceStore((s) => s.tab);
  const setTab = useWorkspaceStore((s) => s.setTab);
  const mobileTab = useWorkspaceStore((s) => s.mobileTab);
  const device = useWorkspaceStore((s) => s.device);
  const setDevice = useWorkspaceStore((s) => s.setDevice);
  const reload = useWorkspaceStore((s) => s.reload);
  const html = useWorkspaceStore((s) => s.html);
  const page = useWorkspaceStore((s) => s.page);
  const setPage = useWorkspaceStore((s) => s.setPage);
  const files = useChatStore((s) => s.conversations[conversationId]?.project?.files);
  const title = useChatStore((s) => s.conversations[conversationId]?.title);
  const streaming = useChatStore((s) => s.streaming !== null);
  const versions = useProjectVersions(conversationId);
  const paths = files ? Object.keys(files) : [];
  const pages = sortPaths(paths.filter((p) => /\.html?$/i.test(p)));
  const currentPage = files ? pickPage(files, page) : null;
  const effectiveTab = showTabs ? tab : mobileTab === "code" ? "code" : "preview";

  const slug = (title ?? "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "project";

  const download = () => {
    if (!files || !paths.length) return;
    downloadBlob(createZip(files) as BlobPart, `${slug}.zip`, "application/zip");
  };
  const downloadHtml = () => {
    if (!html) return;
    downloadBlob(html.replace(/<script data-preview-bootstrap>[\s\S]*?<\/script>/, ""), `${slug}.html`, "text/html");
  };
  const openTab = () => {
    if (!html) return;
    openPreviewInNewTab(html).catch(() => toast.error("Could not open the preview in a new tab."));
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-border/70 border-b bg-background/80 px-2 backdrop-blur-md">
      {showTabs && (
        <SegmentedTabs
          label="Workspace view"
          value={tab}
          onChange={setTab}
          items={[
            { value: "preview", label: "Preview", icon: <MonitorIcon className="size-3.5" /> },
            { value: "code", label: "Code", icon: <FileCode2Icon className="size-3.5" /> },
          ]}
        />
      )}

      {effectiveTab === "preview" && (
        <div className="ml-1 hidden items-center gap-0.5 md:flex" role="group" aria-label="Preview width">
          {DEVICES.map((d) => (
            <IconButton key={d.id} label={d.label} pressed={device === d.id} onClick={() => setDevice(d.id)} testId={`device-${d.id}`}>
              <d.icon className="size-4" />
            </IconButton>
          ))}
        </div>
      )}

      {effectiveTab === "preview" && pages.length > 1 && currentPage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 max-w-40 truncate px-2 font-mono text-muted-foreground text-xs">
              /{currentPage}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {pages.map((p) => (
              <DropdownMenuItem key={p} onSelect={() => setPage(p)} className="font-mono text-xs">
                /{p}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="ml-auto flex items-center gap-0.5">
        {effectiveTab === "preview" && (
          <IconButton label="Reload preview" onClick={reload} disabled={!html} testId="preview-reload">
            <RotateCwIcon className="size-4" />
          </IconButton>
        )}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Version history"
                  data-testid="version-menu"
                  disabled={!versions.length}
                  className="h-8 gap-1 px-2 text-muted-foreground text-xs hover:text-foreground"
                >
                  <HistoryIcon className="size-4" />
                  {versions.length > 0 && <span className="font-mono">v{versions[versions.length - 1].n}</span>}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Version history</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
            <DropdownMenuLabel className="text-muted-foreground text-xs">Restore a version</DropdownMenuLabel>
            {[...versions].reverse().map((v) => (
              <DropdownMenuItem
                key={v.id}
                disabled={streaming}
                onSelect={() => restoreVersion(conversationId, v)}
                className="justify-between gap-3 text-xs"
              >
                <span className="font-medium">Version {v.n}</span>
                <span className="text-muted-foreground">
                  {Object.keys(v.files).length} files · {new Date(v.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Download"
                  disabled={!paths.length}
                  className="size-8 text-muted-foreground hover:text-foreground"
                >
                  <DownloadIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Download</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={download} className="text-xs">
              <FileArchiveIcon className="size-4" /> Project (.zip)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={downloadHtml} disabled={!html} className="text-xs">
              <FileCode2Icon className="size-4" /> Single HTML file
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton label="Open in new tab" onClick={openTab} disabled={!html} testId="preview-open-tab">
          <ExternalLinkIcon className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

/** Preview and Code views. The preview stays mounted while the Code tab is shown. */
export function WorkspaceBody({ conversationId, view }: { conversationId: string; view: "preview" | "code" }) {
  const project = useChatStore((s) => s.conversations[conversationId]?.project);
  const streaming = useChatStore((s) => s.streaming?.conversationId === conversationId);
  const files = project?.files ?? EMPTY_FILES;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PreviewPane files={files} streaming={streaming} className={cn(view !== "preview" && "hidden")} />
      {view === "code" && (
        <CodePane conversationId={conversationId} files={files} activeFile={project?.activeFile} streaming={streaming} />
      )}
    </div>
  );
}

const EMPTY_FILES: Record<string, string> = {};
