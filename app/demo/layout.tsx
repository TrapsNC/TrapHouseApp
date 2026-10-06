import type { Metadata, Viewport } from "next";
export const metadata: Metadata = {
 title: "Sample Order Lab",
 description: "Sample-product discounts and notification demo.",
 manifest: "/demo.webmanifest",
 appleWebApp: { capable:true, title:"Order Lab", statusBarStyle:"default" },
 icons: { apple:"/demo-icons/icon-180.png", icon:"/demo-icons/icon-192.png" },
};
export const viewport: Viewport = { themeColor:"#101010", width:"device-width", initialScale:1 };
export default function DemoLayout({children}:{children:React.ReactNode}) {return children;}
