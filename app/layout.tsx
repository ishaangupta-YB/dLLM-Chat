import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "dLLM Chat - Fastest AI Chat Inference",
  description: "Experience next-generation AI conversations with dLLM Chat. Features streaming and diffusing response modes, modern UI/UX, and seamless real-time interactions powered by advanced language models.",
  keywords: "AI chat, LLM, language model, conversation, streaming, artificial intelligence, chat interface, dLLM, machine learning",
  authors: [{ name: "dLLM Team" }],
  creator: "dLLM",
  publisher: "dLLM",
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    title: 'dLLM Chat - Advanced AI Conversation Interface',
    description: 'Experience next-generation AI conversations with dLLM Chat. Features streaming and diffusing response modes, modern UI/UX, and seamless real-time interactions.',
    siteName: 'dLLM Chat',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'dLLM Chat - Advanced AI Conversation Interface',
    description: 'Experience next-generation AI conversations with streaming and diffusing response modes.',
    creator: '@ishaangtwt',
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
  category: 'technology',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
         <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster richColors position="top-right" />
          </ThemeProvider>
      </body>
    </html>
  );
}
