import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "katex/dist/katex.min.css";
import "streamdown/styles.css";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dllmchat.vercel.app"),
  title: "dLLM Chat - Fastest AI Chat Inference",
  description:
    "Chat with Inception's Mercury 3 diffusion LLM at ~1000 tokens/s. Streaming and diffusion response modes, an editable code canvas with autocomplete, voice mode and a modern, responsive UI.",
  keywords:
    "AI chat, LLM, diffusion LLM, dLLM, Mercury 3, Inception, language model, streaming, diffusion, code canvas, voice chat",
  authors: [{ name: "Ishaan Gupta", url: "https://www.linkedin.com/in/ishaangupta1201" }],
  creator: "dLLM",
  publisher: "dLLM",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: "dLLM Chat - Mercury 3 diffusion LLM chat",
    description:
      "Chat with Inception's Mercury 3 diffusion LLM. Watch answers stream in or denoise into place, edit code in a live canvas, and talk to it with voice mode.",
    siteName: "dLLM Chat",
  },
  twitter: {
    card: "summary_large_image",
    title: "dLLM Chat - Mercury 3 diffusion LLM chat",
    description: "Streaming and diffusion response modes powered by Inception's Mercury 3.",
    creator: "@ishaangtwt",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  category: "technology",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#020203" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster richColors position="top-center" closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
