"use client";

import { memo, useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  DownloadIcon,
  FileJsonIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  SearchIcon,
  SquarePenIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ModeToggle } from "@/components/mode-toggle";
import { useStoreHydrated } from "./use-store-hydrated";
import { useChatController } from "@/lib/chat/use-chat-controller";
import { sortConversations, useChatStore } from "@/lib/store/chat-store";
import type { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import {
  GROUP_LABELS,
  buildExport,
  downloadJson,
  extractConversations,
  focusComposer,
  groupConversations,
  slugify,
} from "./utils";

// Fixed widths: random ones would differ between server and client render.
const SKELETON_WIDTHS = ["78%", "62%", "70%", "54%", "66%", "48%"];

const LINKEDIN_URL = "https://www.linkedin.com/in/ishaangupta1201";

/**
 * A cheap string signature of the sidebar-relevant fields. Streaming patches
 * message content without touching these, so the sidebar does not re-render
 * on every token.
 */
function sidebarSignature(conversations: Record<string, Conversation>): string {
  let sig = "";
  for (const id in conversations) {
    const c = conversations[id];
    sig += `${c.id}\u0000${c.updatedAt}\u0000${c.pinned ? 1 : 0}\u0000${c.title}\u0001`;
  }
  return sig;
}

export function AppSidebar() {
  const hydrated = useStoreHydrated();
  const { isMobile, setOpenMobile } = useSidebar();
  const sig = useChatStore((s) => sidebarSignature(s.conversations));
  const activeId = useChatStore((s) => s.activeId);
  const streamingId = useChatStore((s) => s.streaming?.conversationId ?? null);
  const createConversation = useChatStore((s) => s.createConversation);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const { stop } = useChatController();

  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => {
    // `sig` captures every field we read here.
    void sig;
    const all = sortConversations(Object.values(useChatStore.getState().conversations));
    const q = query.trim().toLowerCase();
    const filtered = q ? all.filter((c) => c.title.toLowerCase().includes(q)) : all;
    return { total: all.length, groups: groupConversations(filtered, new Date().getTime()) };
  }, [sig, query]);

  const closeMobile = useCallback(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, setOpenMobile]);

  const onNewChat = useCallback(() => {
    createConversation();
    setQuery("");
    closeMobile();
    focusComposer();
  }, [createConversation, closeMobile]);

  const onSelect = useCallback(
    (id: string) => {
      selectConversation(id);
      closeMobile();
    },
    [selectConversation, closeMobile],
  );

  const onExportOne = useCallback((id: string) => {
    const c = useChatStore.getState().conversations[id];
    if (!c) return;
    downloadJson(`dllm-chat-${slugify(c.title)}.json`, buildExport([c]));
    toast.success("Chat exported");
  }, []);

  const onExportAll = () => {
    const all = sortConversations(Object.values(useChatStore.getState().conversations));
    if (!all.length) {
      toast.info("No chats to export yet");
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`dllm-chat-export-${date}.json`, buildExport(all));
    toast.success(`Exported ${all.length} chat${all.length === 1 ? "" : "s"}`);
  };

  const onImportFile = async (file: File) => {
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error("File is larger than 25 MB.");
      const data: unknown = JSON.parse(await file.text());
      const list = extractConversations(data);
      const added = useChatStore.getState().importConversations(list as Conversation[]);
      if (added > 0) toast.success(`Imported ${added} chat${added === 1 ? "" : "s"}`);
      else toast.error("No valid chats found in that file");
    } catch (err) {
      toast.error("Import failed", {
        description: err instanceof SyntaxError ? "The file is not valid JSON." : (err as Error).message,
      });
    }
  };

  const onDelete = () => {
    if (!deleteTarget) return;
    if (useChatStore.getState().streaming?.conversationId === deleteTarget.id) stop();
    useChatStore.getState().deleteConversation(deleteTarget.id);
    toast.success("Chat deleted");
    setDeleteTarget(null);
  };

  const onClearAll = () => {
    if (useChatStore.getState().streaming) stop();
    useChatStore.getState().clearAll();
    toast.success("All chats cleared");
    setConfirmClear(false);
  };

  return (
    <>
      <Sidebar collapsible="icon" className="border-sidebar-border/70">
        <SidebarHeader className="gap-3 p-3 group-data-[collapsible=icon]:p-2">
          <div className="flex items-center gap-2.5 px-1 py-0.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <BrandMark className="size-8 group-data-[collapsible=icon]:size-8" />
            <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold text-sm tracking-tight">dLLM Chat</span>
              <span className="truncate text-[11px] text-muted-foreground">Mercury diffusion LLMs</span>
            </div>
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={onNewChat}
                tooltip="New chat (Ctrl+Shift+O)"
                className="h-9 border border-sidebar-border bg-background/60 font-medium shadow-xs hover:bg-background dark:bg-sidebar-accent/40 dark:hover:bg-sidebar-accent"
              >
                <SquarePenIcon />
                <span>New chat</span>
                <kbd className="ml-auto hidden font-mono text-[10px] text-muted-foreground tracking-tight md:inline group-data-[collapsible=icon]:hidden">
                  <ShortcutHint />
                </kbd>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="relative group-data-[collapsible=icon]:hidden">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <SidebarInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Search chats"
              aria-label="Search chats"
              className="h-8 bg-background/60 pr-7 pl-8 dark:bg-sidebar-accent/30"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent className="gap-0 group-data-[collapsible=icon]:hidden">
          {!hydrated ? (
            <SidebarGroup>
              <SidebarMenu>
                {SKELETON_WIDTHS.map((w, i) => (
                  <SidebarMenuItem key={i} className="flex h-8 items-center px-2">
                    <Skeleton className="h-3.5 rounded-sm" style={{ width: w }} />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ) : groups.total === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-muted-foreground">
              <MessageSquareIcon className="size-5 opacity-60" />
              <p className="text-xs">Your chats will show up here.</p>
            </div>
          ) : groups.groups.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted-foreground text-xs">No chats match “{query}”.</p>
          ) : (
            groups.groups.map((g) => (
              <SidebarGroup key={g.key} className="py-1">
                <SidebarGroupLabel className="h-7 text-[11px] text-muted-foreground/80 uppercase tracking-wider">
                  {GROUP_LABELS[g.key]}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0.5">
                    {g.items.map((c) => (
                      <ConversationItem
                        key={c.id}
                        id={c.id}
                        title={c.title}
                        pinned={!!c.pinned}
                        active={c.id === activeId}
                        streaming={c.id === streamingId}
                        renaming={renamingId === c.id}
                        onSelect={onSelect}
                        onStartRename={setRenamingId}
                        onEndRename={() => setRenamingId(null)}
                        onExport={onExportOne}
                        onDelete={setDeleteTarget}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))
          )}
        </SidebarContent>

        <SidebarSeparator className="mx-0" />
        <SidebarFooter className="gap-1 p-2">
          <SidebarMenu className="gap-0.5">
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onExportAll} tooltip="Export all chats" className="text-muted-foreground hover:text-foreground">
                <DownloadIcon />
                <span>Export all chats</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => fileRef.current?.click()}
                tooltip="Import chats"
                className="text-muted-foreground hover:text-foreground"
              >
                <UploadIcon />
                <span>Import chats</span>
              </SidebarMenuButton>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-hidden
                tabIndex={-1}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onImportFile(f);
                }}
              />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setConfirmClear(true)}
                disabled={hydrated && groups.total === 0}
                tooltip="Clear all chats"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2Icon />
                <span>Clear all</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="mt-1 flex items-center justify-between gap-1 px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
            <ModeToggle className="text-muted-foreground hover:text-foreground" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" asChild className="text-muted-foreground hover:text-foreground">
                  <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn (opens in a new tab)">
                    <LinkedinIcon className="size-4" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">LinkedIn</TooltipContent>
            </Tooltip>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” will be permanently removed from this browser. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all chats?</AlertDialogTitle>
            <AlertDialogDescription>
              Every conversation stored in this browser will be deleted. Export them first if you want a backup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onClearAll}>
              Clear all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ------------------------------------------------------------------ item */

interface ConversationItemProps {
  id: string;
  title: string;
  pinned: boolean;
  active: boolean;
  streaming: boolean;
  renaming: boolean;
  onSelect: (id: string) => void;
  onStartRename: (id: string) => void;
  onEndRename: () => void;
  onExport: (id: string) => void;
  onDelete: (t: { id: string; title: string }) => void;
}

const ConversationItem = memo(function ConversationItem({
  id,
  title,
  pinned,
  active,
  streaming,
  renaming,
  onSelect,
  onStartRename,
  onEndRename,
  onExport,
  onDelete,
}: ConversationItemProps) {
  const togglePin = useChatStore((s) => s.togglePin);
  const renameIntent = useRef(false);

  if (renaming) {
    return (
      <SidebarMenuItem>
        <RenameInput id={id} title={title} onDone={onEndRename} />
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        onClick={() => onSelect(id)}
        onDoubleClick={() => onStartRename(id)}
        title={title}
        aria-current={active ? "page" : undefined}
        className={cn(
          "h-8 text-[13px] transition-colors",
          active ? "font-medium" : "text-sidebar-foreground/80",
        )}
      >
        {streaming ? (
          <span className="relative flex size-1.5 shrink-0" aria-label="Generating">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
          </span>
        ) : pinned ? (
          <PinIcon className="size-3! text-muted-foreground" />
        ) : null}
        <span>{title}</span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover aria-label={`Options for ${title}`} className="top-1.5! rounded-md">
            <MoreHorizontalIcon />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          className="w-44"
          onCloseAutoFocus={(e) => {
            // Keep focus in the rename input instead of returning it to the trigger.
            if (renameIntent.current) {
              e.preventDefault();
              renameIntent.current = false;
            }
          }}
        >
          <DropdownMenuItem
            onSelect={() => {
              renameIntent.current = true;
              onStartRename(id);
            }}
          >
            <PencilIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => togglePin(id)}>
            {pinned ? <PinOffIcon /> : <PinIcon />}
            {pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExport(id)}>
            <FileJsonIcon />
            Export JSON
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete({ id, title })}>
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
});

function RenameInput({ id, title, onDone }: { id: string; title: string; onDone: () => void }) {
  const [value, setValue] = useState(title);
  const renameConversation = useChatStore((s) => s.renameConversation);
  const doneRef = useRef(false);

  const commit = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (value.trim() && value.trim() !== title) {
      renameConversation(id, value);
      toast.success("Chat renamed");
    }
    onDone();
  };

  return (
    <SidebarInput
      // Focus once mounted; the dropdown returns focus to its trigger first.
      ref={(el) => {
        if (el && !doneRef.current && document.activeElement !== el) {
          setTimeout(() => {
            el.focus();
            el.select();
          }, 0);
        }
      }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          doneRef.current = true;
          onDone();
        }
      }}
      maxLength={120}
      aria-label="Rename chat"
      className="h-8 text-[13px]"
    />
  );
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

/** Shows ⇧⌘O on Apple platforms and Ctrl⇧O elsewhere (client-only, hydration-safe). */
const noopSubscribe = () => () => {};
function ShortcutHint() {
  const isMac = useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/i.test(navigator.userAgent),
    () => null,
  );
  if (isMac === null) return null;
  return <>{isMac ? "⇧⌘O" : "Ctrl⇧O"}</>;
}
