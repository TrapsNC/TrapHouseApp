import { CartContents } from "@/app/components/CartContents";
import { StoreHeader,StoreFooter } from "@/app/components/StoreChrome";

export default function CartPage() {
 return <main className="storefront min-h-screen"><StoreHeader/><div className="store-container" style={{maxWidth:780}}><p className="store-kicker">TRAP HOUSE NC</p><h1 className="store-title">Your cart</h1><CartContents/></div><StoreFooter/></main>;
}
