import Link from "next/link";
import { StoreHeader, StoreFooter } from "@/app/components/StoreChrome";
import content from "@/lib/legal-content.json";
export type InfoPage = { title: string; source: string; html: string };
export const infoPages: Record<string, InfoPage> = content;
export function StoreInfoPage({ page }: { page: InfoPage }) {
 return <main className="storefront min-h-screen"><StoreHeader/><div className="store-container store-info-page"><Link href="/" className="cart-back-link">← Back to shop</Link><p className="store-kicker">TRAP HOUSE NC</p><h1 className="store-title">{page.title}</h1><p className="store-info-source">These are the policies and information from our existing store. This app’s checkout and delivery tracking are currently demonstrations.</p><article className="store-info-content" dangerouslySetInnerHTML={{__html:page.html}}/><div className="store-info-help"><p>Questions about an order, delivery or cancellation? Contact the shop before making changes.</p><Link href="/pages/contact" className="cart-back-link">Contact Trap House NC →</Link><a className="cart-back-link" href={page.source} target="_blank" rel="noopener noreferrer">View on our original website ↗</a></div></div><StoreFooter/></main>;
}
