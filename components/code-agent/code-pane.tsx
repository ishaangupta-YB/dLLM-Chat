"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  BracesIcon,
  FileCode2Icon,
  FileIcon,
  FileJsonIcon,
  FileTextIcon,
  ImageIcon,
  PaletteIcon,
  SparklesIcon,
} from "lucide-react";
import { FileTree, FileTreeFile, FileTreeFolder } from "@/components/ai-elements/file-tree";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SYNTAX_VARS } from "@/components/code-canvas/canvas-parts";
import { languageForPath, sortPaths } from "@/lib/code-agent/files";
import type { CanvasEditor } from "@/lib/editor/create-editor";
import { loadLanguage } from "@/lib/editor/languages";
import { useChatStore } from "@/lib/store/chat-store";
import { cn } from "@/lib/utils";

interface TreeNode {
  name: string;
  path: string;
  children?: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [] };
  for (const p of sortPaths(paths)) {
    const parts = p.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      if (i === parts.length - 1) {
        node.children!.push({ name: part, path });
        return;
      }
      let dir = node.children!.find((c) => c.children && c.name === part);
      if (!dir) {
        dir = { name: part, path, children: [] };
        node.children!.push(dir);
      }
      node = dir;
    });
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) => (!!a.children === !!b.children ? 0 : a.children ? -1 : 1))
      .map((n) => (n.children ? { ...n, children: sort(n.children) } : n));
  return sort(root.children!);
}

export function FileIconFor({ path, className }: { path: string; className?: string }) {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const cls = cn("size-4 shrink-0", className);
  switch (ext) {
    case "html":
      return <FileCode2Icon className={cn(cls, "text-orange-500")} />;
    case "css":
      return <PaletteIcon className={cn(cls, "text-sky-500")} />;
    case "js":
      return <BracesIcon className={cn(cls, "text-amber-500")} />;
    case "json":
      return <FileJsonIcon className={cn(cls, "text-emerald-500")} />;
    case "svg":
      return <ImageIcon className={cn(cls, "text-violet-500")} />;
    case "md":
    case "txt":
      return <FileTextIcon className={cn(cls, "text-muted-foreground")} />;
    default:
      return <FileIcon className={cn(cls, "text-muted-foreground")} />;
  }
}

function TreeItems({ nodes }: { nodes: TreeNode[] }) {
  return nodes.map((n) =>
    n.children ? (
      <FileTreeFolder key={n.path} path={n.path} name={n.name}>
        <TreeItems nodes={n.children} />
      </FileTreeFolder>
    ) : (
      <FileTreeFile key={n.path} path={n.path} name={n.name} icon={<FileIconFor path={n.path} />} data-testid={`file-${n.path}`} />
    ),
  );
}

export function CodePane({
  conversationId,
  files,
  activeFile,
  streaming,
  className,
}: {
  conversationId: string;
  files: Record<string, string>;
  activeFile?: string;
  streaming: boolean;
  className?: string;
}) {
  const paths = useMemo(() => Object.keys(files), [files]);
  const tree = useMemo(() => buildTree(paths), [paths]);
  const folders = useMemo(() => new Set(paths.flatMap((p) => p.split("/").slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join("/")))), [paths]);
  const selected = activeFile && files[activeFile] != null ? activeFile : sortPaths(paths)[0];
  const setActiveFile = useChatStore((s) => s.setActiveFile);

  if (!paths.length) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center", className)}>
        <FileCode2Icon className="size-6 text-muted-foreground" />
        <p className="font-medium text-sm">No files yet</p>
        <p className="max-w-64 text-muted-foreground text-xs">Files the agent writes show up here. You can edit them by hand too.</p>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-1", className)}>
      <div className="hidden w-52 shrink-0 flex-col border-border/70 border-r bg-muted/25 sm:flex">
        <div className="flex h-9 items-center px-3 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
          Files
          <span className="ml-auto font-mono normal-case tracking-normal">{paths.length}</span>
        </div>
        <FileTree
          key={[...folders].join("|")}
          defaultExpanded={folders}
          selectedPath={selected}
          onSelect={(p) => files[p] != null && setActiveFile(conversationId, p)}
          className="min-h-0 flex-1 overflow-y-auto rounded-none border-0 bg-transparent text-[13px] [&>div]:p-1.5"
          aria-label="Project files"
        >
          <TreeItems nodes={tree} />
        </FileTree>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile / narrow: file chips instead of the tree */}
        <div className="flex gap-1 overflow-x-auto border-border/70 border-b px-2 py-1.5 sm:hidden">
          {sortPaths(paths).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={p === selected ? "secondary" : "ghost"}
              className="h-7 shrink-0 gap-1.5 px-2 font-mono text-xs"
              onClick={() => setActiveFile(conversationId, p)}
            >
              <FileIconFor path={p} className="size-3.5" />
              {p}
            </Button>
          ))}
        </div>
        {selected && (
          <FileEditor
            key={`${conversationId}:${selected}`}
            conversationId={conversationId}
            path={selected}
            content={files[selected]}
            streaming={streaming}
          />
        )}
      </div>
    </div>
  );
}

function FileEditor({
  conversationId,
  path,
  content,
  streaming,
}: {
  conversationId: string;
  path: string;
  content: string;
  streaming: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const fimEnabled = useChatStore((s) => s.settings.fimEnabled);
  const setSettings = useChatStore((s) => s.setSettings);
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<CanvasEditor | null>(null);
  const savedRef = useRef(content);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const init = useRef({ dark, fimEnabled, content });
  const language = languageForPath(path);

  // Stable for the component's lifetime (it is keyed by conversation + path).
  const save = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const ed = editorRef.current;
    if (!ed) return;
    const text = ed.getText();
    if (text === savedRef.current) return;
    if (useChatStore.getState().streaming?.conversationId === conversationId) return; // agent is writing
    savedRef.current = text;
    useChatStore.getState().applyFileChange(conversationId, path, text);
    setDirty(false);
  }, [conversationId, path]);

  useEffect(() => {
    let cancelled = false;
    let ed: CanvasEditor | null = null;
    Promise.all([import("@/lib/editor/create-editor"), loadLanguage(language)])
      .then(([mod, languageExtension]) => {
        if (cancelled || !hostRef.current) return;
        ed = mod.createCanvasEditor({
          doc: init.current.content,
          language,
          languageExtension,
          dark: init.current.dark,
          fimEnabled: init.current.fimEnabled,
          onDocChange: () => {
            const cur = editorRef.current;
            if (!cur) return;
            const d = cur.getText() !== savedRef.current;
            setDirty(d);
            if (saveTimer.current) clearTimeout(saveTimer.current);
            if (d) saveTimer.current = setTimeout(() => save(), 800);
          },
          onSave: () => save(),
        });
        ed.view.dom.classList.add("h-full");
        hostRef.current.appendChild(ed.view.dom);
        editorRef.current = ed;
        setReady(true);
      })
      .catch((err) => console.error("[code-agent] failed to load editor", err));
    return () => {
      cancelled = true;
      if (ed) {
        save();
        ed.destroy();
        editorRef.current = null;
      }
    };
  }, [language, save]);

  useEffect(() => {
    editorRef.current?.setDark(dark);
  }, [dark, ready]);

  useEffect(() => {
    editorRef.current?.setFimEnabled(fimEnabled && !streaming);
  }, [fimEnabled, streaming, ready]);

  // Agent (or version restore) changed the file: follow it unless the user has unsaved edits.
  useEffect(() => {
    if (content === savedRef.current) return;
    const ed = editorRef.current;
    if (ed && ed.getText() !== savedRef.current && !streaming) return;
    savedRef.current = content;
    ed?.setText(content);
    setDirty(false);
  }, [content, streaming]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-border/70 border-b px-3">
        <FileIconFor path={path} className="size-3.5" />
        <span className="truncate font-mono text-xs" data-testid="editor-path">
          {path}
        </span>
        <span className={cn("text-[11px] text-muted-foreground transition-opacity", dirty ? "opacity-100" : "opacity-0")}>
          Unsaved
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={fimEnabled}
                onClick={() => setSettings({ fimEnabled: !fimEnabled })}
                className={cn("h-7 gap-1.5 px-2 text-xs", fimEnabled ? "text-primary" : "text-muted-foreground")}
              >
                <SparklesIcon className="size-3.5" />
                Autocomplete
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Mercury Edit ghost-text completions (Tab to accept)</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div
        ref={hostRef}
        data-testid="code-editor"
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden text-[13px] [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono",
          SYNTAX_VARS,
        )}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) save();
        }}
      >
        {!ready && <div className="p-4 font-mono text-muted-foreground text-xs">Loading editor…</div>}
      </div>
    </div>
  );
}
