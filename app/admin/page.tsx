"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { downloadInventory } from "@/lib/download-inventory";

type Product = {
  id: string;
  name: string;
  category: string;
  price: number | string;
  stock: number;
  image_url?: string | null;
};

export default function AdminPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [exportingInventory, setExportingInventory] = useState(false);

  useEffect(() => {
    async function checkLogin() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      setCheckingAuth(false);
      loadProducts();
    }

    checkLogin();
  }, [router]);

  async function exportInventory() {
    setExportingInventory(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/login"); return; }
      const response = await fetch("/api/admin/purchases", {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not export inventory.");
      downloadInventory(result.products, result.variants);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not export inventory.");
    } finally {
      setExportingInventory(false);
    }
  }

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setProducts(data || []);
  }

  async function uploadImage() {
    if (!imageFile) {
      return null;
    }

    const extension =
      imageFile.name.split(".").pop()?.toLowerCase() || "jpg";

    const fileName = `${crypto.randomUUID()}.${extension}`;

    const filePath = `products/${fileName}`;

    const { error } = await supabase.storage
      .from("product-images")
      .upload(filePath, imageFile);

    if (error) {
      throw error;
    }

    const { data } = supabase.storage
      .from("product-images")
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  async function addProduct() {
    if (!name.trim() || !category.trim() || !price) {
      alert("Fill out product name, category, and price.");
      return;
    }

    try {
      setSaving(true);

      const imageUrl = await uploadImage();

      const { error } = await supabase.from("products").insert({
        name: name.trim(),
        category: category.trim(),
        price: Number(price),
        stock: Number(stock || 0),
        image_url: imageUrl,
        active: true,
      });

      if (error) {
        alert(error.message);
        return;
      }

      setName("");
      setCategory("");
      setPrice("");
      setStock("");
      setImageFile(null);

      const fileInput = document.getElementById(
        "product-image"
      ) as HTMLInputElement | null;

      if (fileInput) {
        fileInput.value = "";
      }

      await loadProducts();

      alert("Product added!");
    } catch (error: any) {
      alert(error?.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStock(id: string, amount: number) {
    const product = products.find((item) => item.id === id);

    if (!product) return;

    const newStock = Math.max(0, product.stock + amount);

    const { error } = await supabase
      .from("products")
      .update({
        stock: newStock,
      })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadProducts();
  }

  async function deleteProduct(product: Product) {
    const confirmed = window.confirm(
      `Delete ${product.name}?`
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", product.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadProducts();
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-zinc-400">Checking login...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-5xl">

        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-500">
              OWNER DASHBOARD
            </p>

            <h1 className="mt-1 text-4xl font-black">
              Inventory
            </h1>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link
              href="/admin/orders"
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold"
            >
              CUSTOMER ORDERS
            </Link>
            <button type="button" onClick={() => void exportInventory()} disabled={exportingInventory} className="rounded-xl bg-green-700 px-4 py-3 text-sm font-bold disabled:opacity-40">{exportingInventory ? "DOWNLOADING..." : "DOWNLOAD INVENTORY CSV"}</button>
            <Link href="/admin/costs" className="rounded-xl border border-emerald-700 px-4 py-3 text-sm font-bold text-emerald-300">COSTS & PROFIT</Link>
            <Link href="/admin/purchases" className="rounded-xl border border-green-700 bg-green-950 px-4 py-3 text-sm font-bold text-green-300">PURCHASES</Link>

            <button
              onClick={logout}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold"
            >
              LOG OUT
            </button>
          </div>
        </header>

        <section className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">

          <h2 className="text-xl font-black">
            Add Product
          </h2>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Product name"
              className="rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none"
            />

            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Category"
              className="rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none"
            />

            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price"
              type="number"
              min="0"
              step="0.01"
              className="rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none"
            />

            <input
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="Stock"
              type="number"
              min="0"
              className="rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none"
            />

          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm font-bold text-zinc-400">
              Product Picture
            </p>

            <input
              id="product-image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) =>
                setImageFile(e.target.files?.[0] || null)
              }
              className="w-full rounded-xl border border-zinc-800 bg-black p-3"
            />
          </div>

          {imageFile && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-zinc-500">
                Preview
              </p>

              <img
                src={URL.createObjectURL(imageFile)}
                alt="Preview"
                className="h-40 w-40 rounded-2xl object-cover"
              />
            </div>
          )}

          <button
            onClick={addProduct}
            disabled={saving}
            className="mt-5 rounded-xl bg-white px-6 py-3 font-bold text-black disabled:opacity-50"
          >
            {saving ? "ADDING..." : "ADD PRODUCT"}
          </button>

        </section>

        <section className="mt-8">

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-black">
              Current Inventory
            </h2>

            <button
              onClick={loadProducts}
              className="text-sm font-bold text-zinc-400"
            >
              REFRESH
            </button>
          </div>

          <div className="space-y-3">

            {products.map((product) => (
              <div
                key={product.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:flex-row sm:items-center"
              >

                <div className="flex items-center gap-4">

                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-20 w-20 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-zinc-900 text-center text-xs text-zinc-600">
                      NO IMAGE
                    </div>
                  )}

                  <div>
                    <p className="text-lg font-bold">
                      {product.name}
                    </p>

                    <p className="text-zinc-500">
                      {product.category} · $
                      {Number(product.price).toFixed(2)}
                    </p>

                    <p className="mt-1">
                      Stock: {product.stock}
                    </p>
                  </div>

                </div>

                <div className="flex flex-wrap gap-2">

                  <button
                    onClick={() =>
                      changeStock(product.id, -1)
                    }
                    className="rounded-xl border border-zinc-700 px-4 py-2"
                  >
                    -1
                  </button>

                  <button
                    onClick={() =>
                      changeStock(product.id, 1)
                    }
                    className="rounded-xl border border-zinc-700 px-4 py-2"
                  >
                    +1
                  </button>

                  <button
                    onClick={() =>
                      changeStock(product.id, 5)
                    }
                    className="rounded-xl border border-zinc-700 px-4 py-2"
                  >
                    +5
                  </button>

                  <button
                    onClick={() =>
                      changeStock(product.id, 10)
                    }
                    className="rounded-xl border border-zinc-700 px-4 py-2"
                  >
                    +10
                  </button>

                  <button
                    onClick={() =>
                      deleteProduct(product)
                    }
                    className="rounded-xl border border-red-900 px-4 py-2 font-bold text-red-400"
                  >
                    DELETE
                  </button>

                </div>

              </div>
            ))}

          </div>

        </section>

      </div>
    </main>
  );
}