"use client";

import { useEffect } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useChatStore } from "@/lib/store/chat-store";
import { AppSidebar } from "./app-sidebar";
import { ChatHeader } from "./chat-header";
import { ChatThread } from "./chat-thread";
import { Composer } from "./composer";
import { focusComposer } from "./utils";

export function ChatApp({ defaultSidebarOpen = true }: { defaultSidebarOpen?: boolean }) {
  // Ctrl/Cmd + Shift + O: new chat (same shortcut as ChatGPT).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        useChatStore.getState().createConversation();
        focusComposer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <AppSidebar />
      <SidebarInset className="app-backdrop h-svh min-w-0 overflow-hidden">
        <ChatHeader />
        <ChatThread />
        <Composer />
      </SidebarInset>
    </SidebarProvider>
  );
}
