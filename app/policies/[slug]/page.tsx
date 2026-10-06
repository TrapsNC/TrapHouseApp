import { notFound } from "next/navigation";
import { StoreInfoPage, infoPages } from "@/app/components/StoreInfoPage";
export function generateStaticParams() {
 return Object.keys(infoPages).filter(path=>path.startsWith("/policies/")).map(path=>({slug:path.split("/").pop()!}));
}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}) {
 const {slug}=await params;
 const page=infoPages[`/policies/${slug}`];
 return {title:page?`${page.title} | Trap House NC`:"Trap House NC"};
}
export default async function Page({params}:{params:Promise<{slug:string}>}) {
 const {slug}=await params;
 const page=infoPages[`/policies/${slug}`];
 if(!page) notFound();
 return <StoreInfoPage page={page}/>;
}
