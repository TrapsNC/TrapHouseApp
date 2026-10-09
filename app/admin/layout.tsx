import type { Metadata, Viewport } from "next";
import AdminInstall from "./AdminInstall";

export const metadata: Metadata = {
  title: "TRAP HOUSE Admin",
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "TRAP Admin", statusBarStyle: "black" },
  icons: { apple: "/icon-192.png", icon: "/icon-192.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <><AdminInstall />{children}</>;
}
