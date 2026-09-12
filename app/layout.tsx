import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dotforge — ドット絵制作室",
  description: "同じ物体を、同じ色と光で。64×64・8方向のドット絵を生成、編集、書き出し。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
