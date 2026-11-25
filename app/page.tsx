import { cookies } from "next/headers";
import { ChatApp } from "@/components/chat/chat-app";

export default async function Home() {
  const cookieStore = await cookies();
  // Persisted by the shadcn sidebar so the first paint matches the user's choice.
  const sidebarCookie = cookieStore.get("sidebar_state")?.value;
  const defaultOpen = sidebarCookie === undefined ? true : sidebarCookie === "true";
  return <ChatApp defaultSidebarOpen={defaultOpen} />;
}
