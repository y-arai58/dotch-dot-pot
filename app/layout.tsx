import type { Metadata } from "next";
import "./globals.css";
import "./shell.css";
import { StudioProvider } from "@/components/studio/studio-provider";
import { getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dotch Dot Pot — ドット絵制作室",
  description: "同じ物体を、同じ色と光で。64×64・8方向のドット絵を生成、編集、書き出し。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getChatGPTUser();
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DotGothic16&family=JetBrains+Mono:wght@400;500&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap"
        />
      </head>
      <body className="antialiased">
        <StudioProvider signedIn={!!user}>{children}</StudioProvider>
      </body>
    </html>
  );
}
