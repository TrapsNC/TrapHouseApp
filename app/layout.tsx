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
  title: {
    default: "TRAP HOUSE NC",
    template: "%s | TRAP HOUSE NC",
  },

  description:
    "TRAP HOUSE NC — disposables, THCA, tobacco, accessories, pickup, delivery, and shipping.",

  metadataBase: new URL("https://traphousenc.com"),

  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },

  openGraph: {
    title: "TRAP HOUSE NC",
    description:
      "Shop disposables, THCA, tobacco, accessories, pickup, delivery, and shipping.",
    url: "https://traphousenc.com",
    siteName: "TRAP HOUSE NC",
    images: [
      {
        url: "/trap-house-logo.png",
        width: 1200,
        height: 630,
        alt: "TRAP HOUSE NC",
      },
    ],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}