import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "newskill",
  description: "newskill — 你的個人新聞閱讀器",
  applicationName: "newskill",
  openGraph: {
    title: "newskill",
    description: "你的個人新聞閱讀器",
    siteName: "newskill",
    type: "website",
    locale: "zh_TW",
  },
  twitter: {
    card: "summary",
    title: "newskill",
    description: "你的個人新聞閱讀器",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
