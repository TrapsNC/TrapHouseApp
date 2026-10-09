"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type OrderItem = {
  id: string;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number | string;
};

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  fulfillment: string;
  delivery_address: string | null;
  subtotal: number | string;
  total: number | string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  payment_received_amount: number | string | null;
  refund_status: "none" | "required" | "refunded";
  refund_amount: number | string | null;
  refunded_at: string | null;
  refunded_by: string | null;
  id_document_path: string | null;
  id_uploaded_at: string | null;
  id_review_status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
  order_items: OrderItem[];
};

const statusLabels: Record<string, string> = {
  pending: "Order Received",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Ready for Pickup",
  out_for_delivery: "Out for Delivery",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
};

const fulfillmentLabels: Record<string, string> = {
  pickup: "Local Meetup",
  delivery: "Local Delivery",
  shipping: "Shipping",
};

const money = (value: number | string) =>
  `$${Number(value).toFixed(2)}`;

function getStatusOptions(order: Order) {
  const options = [
    {
      value: "pending",
      label: "Order Received",
    },
    {
      value: "confirmed",
      label: "Confirmed",
    },
  ];

  if (
    order.payment_status === "paid" &&
    order.id_review_status === "approved"
  ) {
    options.push({
      value: "preparing",
      label: "Preparing",
    });

    if (order.fulfillment === "pickup") {
      options.push({
        value: "ready_for_pickup",
        label: "Ready for Pickup",
      });
    }

    if (order.fulfillment === "delivery") {
      options.push({
        value: "out_for_delivery",
        label: "Out for Delivery",
      });
    }

    if (order.fulfillment === "shipping") {
      options.push({
        value: "shipped",
        label: "Shipped",
      });
    }

    options.push({
      value: "completed",
      label: "Completed",
    });
  }

  options.push({
    value: "cancelled",
    label: "Cancelled",
  });

  return options;
}

const idVerificationChecks = [
  { key: "readableConfirmed", label: "ID is readable" },
  { key: "validConfirmed", label: "ID is valid" },
  { key: "dobMatchesConfirmed", label: "Date of birth matches the order" },
  { key: "age21Confirmed", label: "Customer is 21 or older" },
] as const;

type IdVerificationCheck =
  (typeof idVerificationChecks)[number]["key"];

export default function AdminOrdersPage() {
  const router = useRouter();

  async function confirmPayment(order: Order) {
    const amount = order.payment_method === "cash" ? Math.round(Number(order.total)) : Number(order.total);
    if (!window.confirm(`Confirm you actually received ${amount.toFixed(2)} by ${order.payment_method}?`)) return;
    setUpdatingOrder(order.id);
    try {
      const {data:{session}} = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const response = await fetch("/api/admin/orders/payment",{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({orderId:order.id,received:true,amountCents:Math.round(amount*100)})});
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Could not confirm payment.");
      setOrders(current=>current.map(existing=>existing.id===order.id?{...existing,...result.order}:existing));
      setOrderMessages(current=>({...current,[order.id]:"Payment receipt recorded. ID approval is still required for fulfillment."}));
    } catch(error) { setOrderMessages(current=>({...current,[order.id]:error instanceof Error?error.message:"Payment confirmation failed."})); }
    finally { setUpdatingOrder(null); }
  }

  async function confirmRefund(order: Order) {
    const amount = Number(order.payment_received_amount);

    if (!Number.isFinite(amount) || amount < 0) {
      setOrderMessages((current) => ({
        ...current,
        [order.id]: "The recorded payment amount is invalid.",
      }));
      return;
    }

    const method =
      order.payment_method === "cashapp"
        ? "Cash App"
        : order.payment_method === "zelle"
          ? "Zelle"
          : "Cash";

    if (
      !window.confirm(
        `Confirm you actually refunded ${money(amount)} by ${method}?`
      )
    ) {
      return;
    }

    setUpdatingOrder(order.id);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const response = await fetch("/api/admin/orders/refund", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          orderId: order.id,
          confirmed: true,
          amountCents: Math.round(amount * 100),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Could not record refund."
        );
      }

      setOrders((current) =>
        current.map((existing) =>
          existing.id === order.id
            ? { ...existing, ...result.order }
            : existing
        )
      );

      setOrderMessages((current) => ({
        ...current,
        [order.id]: result.alreadyRefunded
          ? "Refund was already recorded."
          : "Refund recorded successfully.",
      }));
    } catch (error) {
      setOrderMessages((current) => ({
        ...current,
        [order.id]:
          error instanceof Error
            ? error.message
            : "Refund confirmation failed.",
      }));
    } finally {
      setUpdatingOrder(null);
    }
  }
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [selectedStatuses, setSelectedStatuses] = useState<
    Record<string, string>
  >({});

  const [updatingOrder, setUpdatingOrder] = useState<string | null>(
    null
  );

  const [orderMessages, setOrderMessages] = useState<
    Record<string, string>
  >({});

  const [idBusyOrder, setIdBusyOrder] =
    useState<string | null>(null);

  const [idMessages, setIdMessages] = useState<
    Record<string, string>
  >({});

  const [idConfirmations, setIdConfirmations] = useState<
    Record<string, Partial<Record<IdVerificationCheck, boolean>>>
  >({});

  const loadOrders = useCallback(
    async (initial = false) => {
      if (initial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          router.replace("/login");
          return;
        }

        const response = await fetch("/api/admin/orders", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        const result = await response.json();

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (response.status === 403) {
          setError(
            "Access denied. This account is not an administrator."
          );
          return;
        }

        if (!response.ok) {
          throw new Error(
            result.error || "Could not load orders."
          );
        }

        const loadedOrders: Order[] = result.orders || [];

        setOrders(loadedOrders);

        setSelectedStatuses((current) => {
          const next = { ...current };

          for (const order of loadedOrders) {
            if (!next[order.id]) {
              next[order.id] = order.status;
            }
          }

          return next;
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load customer orders."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router]
  );

  useEffect(() => {
    void loadOrders(true);
  }, [loadOrders]);

  const [emailTestBusy, setEmailTestBusy] = useState(false);
  const [emailTestMessage, setEmailTestMessage] = useState("");

  async function sendEmailTest() {
    setEmailTestBusy(true);
    setEmailTestMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const response = await fetch("/api/admin/orders/email-test", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send the test.");
      setEmailTestMessage(result.message);
    } catch (error) {
      setEmailTestMessage(error instanceof Error ? error.message : "Could not send the test.");
    } finally {
      setEmailTestBusy(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function updateOrderStatus(order: Order) {
    const newStatus =
      selectedStatuses[order.id] || order.status;

    if (newStatus === order.status) {
      setOrderMessages((current) => ({
        ...current,
        [order.id]: "Choose a different status first.",
      }));

      return;
    }

    setUpdatingOrder(order.id);

    setOrderMessages((current) => ({
      ...current,
      [order.id]: "",
    }));

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        router.replace("/login");
        return;
      }

      const response = await fetch(
        "/api/admin/orders/status",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            orderId: order.id,
            status: newStatus,
          }),
        }
      );

      const result = await response.json();

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(
          result.error || "Could not update order."
        );
      }

      setOrders((current) =>
        current.map((existingOrder) =>
          existingOrder.id === order.id
            ? {
                ...existingOrder,
                status: result.order.status,
                updated_at: result.order.updated_at,
              }
            : existingOrder
        )
      );

      setSelectedStatuses((current) => ({
        ...current,
        [order.id]: result.order.status,
      }));

      setOrderMessages((current) => ({
        ...current,
        [order.id]: `Status updated to ${
          statusLabels[result.order.status] ||
          result.order.status
        }.`,
      }));
    } catch (err) {
      setOrderMessages((current) => ({
        ...current,
        [order.id]:
          err instanceof Error
            ? err.message
            : "Could not update order status.",
      }));
    } finally {
      setUpdatingOrder(null);
    }
  }

  async function viewId(order: Order) {
    if (!order.id_document_path) {
      setIdMessages((current) => ({
        ...current,
        [order.id]: "No ID image is attached to this order.",
      }));

      return;
    }

    setIdBusyOrder(order.id);

    setIdMessages((current) => ({
      ...current,
      [order.id]: "",
    }));

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        router.replace("/login");
        return;
      }

      const response = await fetch(
        "/api/admin/orders/id",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            orderId: order.id,
          }),
        }
      );

      const result = await response.json();

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(
          result.error || "Could not load ID image."
        );
      }

      if (!result.signedUrl) {
        throw new Error(
          "Secure ID link was not returned."
        );
      }

      window.open(
        result.signedUrl,
        "_blank",
        "noopener,noreferrer"
      );

      setIdMessages((current) => ({
        ...current,
        [order.id]:
          "Secure ID opened. The link expires automatically.",
      }));
    } catch (err) {
      setIdMessages((current) => ({
        ...current,
        [order.id]:
          err instanceof Error
            ? err.message
            : "Could not load ID image.",
      }));
    } finally {
      setIdBusyOrder(null);
    }
  }

  async function reviewId(
    order: Order,
    status: "approved" | "rejected"
  ) {
    const confirmations = idConfirmations[order.id] || {};

    if (
      status === "approved" &&
      !idVerificationChecks.every(
        ({ key }) => confirmations[key] === true
      )
    ) {
      setIdMessages((current) => ({
        ...current,
        [order.id]:
          "Confirm all four ID verification checks before approval.",
      }));
      return;
    }

    if (
      status === "rejected" &&
      !window.confirm(
        "Reject this customer's ID verification?"
      )
    ) {
      return;
    }

    setIdBusyOrder(order.id);

    setIdMessages((current) => ({
      ...current,
      [order.id]: "",
    }));

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        router.replace("/login");
        return;
      }

      const response = await fetch(
        "/api/admin/orders/id-review",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            orderId: order.id,
            status,
            ...confirmations,
          }),
        }
      );

      const result = await response.json();

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Could not update ID verification."
        );
      }

      setOrders((current) =>
        current.map((existingOrder) =>
          existingOrder.id === order.id
            ? {
                ...existingOrder,
                id_review_status:
                  result.order.id_review_status,
                updated_at:
                  new Date().toISOString(),
              }
            : existingOrder
        )
      );

      setIdConfirmations((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });

      setIdMessages((current) => ({
        ...current,
        [order.id]:
          status === "approved"
            ? "ID approved."
            : "ID rejected.",
      }));
    } catch (err) {
      setIdMessages((current) => ({
        ...current,
        [order.id]:
          err instanceof Error
            ? err.message
            : "Could not update ID verification.",
      }));
    } finally {
      setIdBusyOrder(null);
    }
  }

  const filteredOrders = orders.filter((order) => {
    const matchesStatus =
      filter === "all" ||
      (filter === "active" &&
        !["completed", "cancelled"].includes(order.status)) ||
      (filter === "completed" &&
        order.status === "completed") ||
      (filter === "cancelled" &&
        order.status === "cancelled");

    const term = search.trim().toLowerCase();

    const matchesSearch =
      !term ||
      order.order_number.toLowerCase().includes(term) ||
      order.customer_name.toLowerCase().includes(term) ||
      order.customer_email.toLowerCase().includes(term) ||
      (order.customer_phone || "")
        .toLowerCase()
        .includes(term);

    return matchesStatus && matchesSearch;
  });

  const storeOrders = orders.filter(
    (order) => order.id !== "f777336e-beda-4bd2-b7a3-8b988bca133a"
  );
  const activeStoreOrders = storeOrders.filter(
    (order) => !["completed", "cancelled"].includes(order.status)
  );
  const cents = (amount: number | string | null) =>
    Math.round(Number(amount || 0) * 100);
  const paidOrders = storeOrders.filter(
    (order) => order.payment_status === "paid"
  );
  const collectedCents = paidOrders.reduce(
    (sum, order) => sum + cents(
      order.payment_received_amount ??
      (order.payment_method === "cash"
        ? Math.round(Number(order.total))
        : order.total)
    ),
    0
  );
  const refundedCents = storeOrders.reduce(
    (sum, order) => sum + (
      order.refund_status === "refunded" ? cents(order.refund_amount) : 0
    ),
    0
  );
  const unpaidCents = activeStoreOrders.reduce(
    (sum, order) => sum + (
      order.payment_status !== "paid"
        ? cents(order.payment_method === "cash"
            ? Math.round(Number(order.total))
            : order.total)
        : 0
    ),
    0
  );
  const pendingIdCount = activeStoreOrders.filter(
    (order) => order.id_review_status === "pending"
  ).length;
  const refundRequiredCount = storeOrders.filter(
    (order) => order.refund_status === "required"
  ).length;
  const dashboardCards = [
    { label: "Net collected", value: money((collectedCents - refundedCents) / 100), note: "Confirmed payments minus recorded refunds", color: "text-green-400" },
    { label: "Profit", value: "Costs needed", note: "Add product costs and expenses to calculate profit", color: "text-zinc-400" },
    { label: "Unpaid balance", value: money(unpaidCents / 100), note: "Amount due on active orders", color: "text-red-400" },
    { label: "Refunds issued", value: money(refundedCents / 100), note: "Recorded refunds", color: "text-amber-400" },
    { label: "Customer orders", value: String(storeOrders.length), note: "Test order excluded", color: "text-white" },
    { label: "Active orders", value: String(activeStoreOrders.length), note: "Awaiting fulfillment or completion", color: "text-white" },
    { label: "ID reviews pending", value: String(pendingIdCount), note: "Active orders waiting for ID review", color: "text-amber-400" },
    { label: "Refunds to send", value: String(refundRequiredCount), note: "Cancelled orders needing a refund", color: "text-red-400" },
  ];

  const activeCount = storeOrders.filter(
    (order) =>
      !["completed", "cancelled"].includes(order.status)
  ).length;

  const completedCount = storeOrders.filter(
    (order) => order.status === "completed"
  ).length;

  return (
    <main className="min-h-screen bg-black p-5 text-white sm:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm tracking-widest text-zinc-500">
              TRAP HOUSE NC
            </p>

            <h1 className="mt-2 text-3xl font-black sm:text-4xl">
              Customer Orders
            </h1>

            <p className="mt-2 text-sm text-zinc-400">
              Manage incoming orders and fulfillment.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin"
              className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold"
            >
              INVENTORY
            </Link>

            <Link href="/admin/purchases" className="rounded-xl border border-green-700 bg-green-950 px-4 py-3 text-sm font-bold text-green-300">PURCHASES</Link>

            <button
              onClick={() => void loadOrders()}
              disabled={refreshing || loading}
              className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-black disabled:opacity-50"
            >
              {refreshing ? "LOADING..." : "REFRESH"}
            </button>

            <button
              onClick={() => void sendEmailTest()}
              disabled={emailTestBusy}
              className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold disabled:opacity-50"
            >
              {emailTestBusy ? "SENDING..." : "TEST CUSTOMER EMAIL"}
            </button>

            <button
              onClick={logout}
              className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold"
            >
              LOG OUT
            </button>
          </div>
        </header>
        {emailTestMessage && <p role="status" className="mt-4 text-sm">{emailTestMessage}</p>}

        <section className="mt-8" aria-label="Store overview">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold">Store overview</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Based on the latest 100 app orders. Test order excluded.
              </p>
            </div>
            <p className="text-xs text-zinc-500">
              {completedCount} completed · {activeCount} active
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {dashboardCards.map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
              >
                <p className="text-sm text-zinc-400">{card.label}</p>
                <p className={`mt-2 text-2xl font-bold ${card.color}`}>
                  {loading || error ? "—" : card.value}
                </p>
                <p className="mt-2 text-xs text-zinc-500">{card.note}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex flex-col gap-4 sm:flex-row">
            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search order number or customer..."
              className="w-full flex-1 rounded-xl border border-zinc-700 bg-black px-4 py-3"
            />

            <select
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value)
              }
              className="rounded-xl border border-zinc-700 bg-black px-4 py-3"
            >
              <option value="all">All Orders</option>
              <option value="active">Active Orders</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <p className="mt-4 text-sm text-zinc-400">
            Showing {filteredOrders.length} of {orders.length} orders
          </p>
        </section>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-800 bg-red-950 p-5 text-red-200"
          >
            {error}
          </div>
        )}

        {loading ? (
          <p className="mt-10 text-center text-zinc-400">
            Loading customer orders...
          </p>
        ) : !error && filteredOrders.length === 0 ? (
          <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950 p-10 text-center">
            <h2 className="text-xl font-bold">
              No Orders Found
            </h2>

            <p className="mt-3 text-zinc-400">
              {orders.length === 0
                ? "No real customer order requests have been saved yet."
                : "No orders match your current filters."}
            </p>

            <p className="mt-3 text-sm text-zinc-500">
              Demo receipts are stored separately from customer orders.
            </p>
          </section>
        ) : (
          <section className="mt-8 space-y-5">
            {filteredOrders.map((order) => {
              const isTerminal =
                order.status === "completed" ||
                order.status === "cancelled";

              const statusOptions =
                getStatusOptions(order);

              const selectedStatus =
                selectedStatuses[order.id] ||
                order.status;

              const message =
                orderMessages[order.id] || "";

              return (
                <article
                  key={order.id}
                  className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 p-5">
                    <div>
                      <p className="text-xs tracking-widest text-zinc-500">
                        ORDER NUMBER
                      </p>

                      <h2 className="mt-1 text-xl font-bold">
                        {order.order_number}
                      </h2>

                      <p className="mt-2 text-sm text-zinc-400">
                        {new Date(
                          order.created_at
                        ).toLocaleString()}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-bold">
                        {money(order.total)}
                      </p>

                      <p className="mt-2 text-sm text-zinc-400">
                        {fulfillmentLabels[
                          order.fulfillment
                        ] || order.fulfillment}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-6 p-5 md:grid-cols-2">
                    <div>
                      <h3 className="font-bold">
                        Customer Information
                      </h3>

                      <p className="mt-3">
                        {order.customer_name}
                      </p>

                      <p className="mt-1 break-all text-zinc-400">
                        {order.customer_email}
                      </p>

                      {order.customer_phone && (
                        <p className="mt-1 text-zinc-400">
                          {order.customer_phone}
                        </p>
                      )}

                      <h3 className="mt-6 font-bold">
                        Fulfillment
                      </h3>

                      <p className="mt-2 text-zinc-400">
                        {fulfillmentLabels[
                          order.fulfillment
                        ] || order.fulfillment}
                      </p>

                      {order.delivery_address && (
                        <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-400">
                          {order.delivery_address}
                        </p>
                      )}
                    </div>

                    <div>
                      <h3 className="font-bold">
                        Products
                      </h3>

                      <div className="mt-3 space-y-3">
                        {(order.order_items || []).map(
                          (item) => (
                            <div
                              key={item.id}
                              className="flex justify-between gap-4 border-b border-zinc-800 pb-3 text-sm"
                            >
                              <div>
                                <p className="font-semibold">
                                  {item.product_name}
                                </p>

                                {item.variant_name && (
                                  <p className="mt-1 text-zinc-400">
                                    {
                                      item.variant_name
                                    }
                                  </p>
                                )}

                                <p className="mt-1 text-zinc-500">
                                  Quantity:{" "}
                                  {item.quantity}
                                </p>
                              </div>

                              <p className="whitespace-nowrap">
                                {money(
                                  Number(
                                    item.unit_price
                                  ) *
                                    item.quantity
                                )}
                              </p>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-zinc-800 p-5">
                    <div className="grid gap-5 lg:grid-cols-4">
                      <div>
                        <p className="text-xs text-zinc-500">
                          ORDER STATUS
                        </p>

                        <p className="mt-1 font-bold">
                          {statusLabels[
                            order.status
                          ] || order.status}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-zinc-500">
                          PAYMENT STATUS
                        </p>

                        <p className={`mt-1 font-bold capitalize ${order.payment_status === "paid" ? "text-green-400" : "text-red-400"}`}>
                          {order.payment_status}
                          {order.payment_method && <span> · {order.payment_method}</span>}
                        </p>

                        {order.payment_status !== "paid" && !["completed","cancelled"].includes(order.status) && order.payment_method && <button type="button" disabled={updatingOrder === order.id} onClick={() => void confirmPayment(order)} className="mt-3 inline-flex cursor-pointer items-center justify-center rounded-xl border border-green-500 bg-green-700 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-green-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-400 disabled:cursor-not-allowed disabled:opacity-40">Confirm payment received ({money(order.payment_method === "cash" ? Math.round(Number(order.total)) : order.total)})</button>}
                        {order.payment_status !==
                          "paid" && (
                          <p className="mt-1 text-xs text-amber-400">
                            Fulfillment statuses are
                            locked until payment is
                            verified.
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">
                          REFUND STATUS
                        </p>

                        {order.refund_status === "required" ? (
                          <div className="mt-2">
                            <p className="font-bold text-amber-400">
                              REFUND REQUIRED
                            </p>

                            <p className="mt-1 text-xs text-zinc-400">
                              {order.payment_received_amount !== null
                                ? money(order.payment_received_amount)
                                : "Payment amount unavailable"}
                            </p>

                            <button
                              type="button"
                              disabled={updatingOrder === order.id}
                              onClick={() =>
                                void confirmRefund(order)
                              }
                              className="mt-3 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-black disabled:opacity-40"
                            >
                              {updatingOrder === order.id
                                ? "RECORDING..."
                                : "MARK REFUNDED"}
                            </button>
                          </div>
                        ) : order.refund_status === "refunded" ? (
                          <div className="mt-2">
                            <p className="font-bold text-green-400">
                              REFUNDED
                            </p>

                            {order.refund_amount !== null && (
                              <p className="mt-1 text-xs text-zinc-400">
                                {money(order.refund_amount)}
                              </p>
                            )}

                            {order.refunded_at && (
                              <p className="mt-1 text-xs text-zinc-500">
                                {new Date(
                                  order.refunded_at
                                ).toLocaleString()}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-zinc-400">
                            None
                          </p>
                        )}
                      </div>


                      <div>
                        <p className="text-xs text-zinc-500">
                          LAST UPDATED
                        </p>

                        <p className="mt-1 text-sm text-zinc-300">
                          {new Date(
                            order.updated_at
                          ).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 rounded-xl border border-zinc-800 bg-black p-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-xs text-zinc-500">
                            ID VERIFICATION
                          </p>

                          <p
                            className={`mt-1 font-bold capitalize ${
                              order.id_review_status === "approved"
                                ? "text-green-400"
                                : order.id_review_status === "rejected"
                                  ? "text-red-400"
                                  : "text-amber-400"
                            }`}
                          >
                            {order.id_review_status}
                          </p>

                          {order.id_uploaded_at && (
                            <p className="mt-2 text-xs text-zinc-500">
                              Uploaded{" "}
                              {new Date(
                                order.id_uploaded_at
                              ).toLocaleString()}
                            </p>
                          )}
                        </div>

                        {order.id_review_status !== "approved" && (
                          <p className="text-xs text-amber-400">
                            Fulfillment locked until ID approval.
                          </p>
                        )}
                      </div>

                      {order.id_document_path &&
                        order.id_review_status !== "approved" && (
                          <fieldset
                            className="mt-4 space-y-2 rounded-xl border border-zinc-800 p-4"
                            disabled={isTerminal || idBusyOrder === order.id}
                          >
                            <legend className="px-1 text-sm font-bold">
                              Confirm before approving
                            </legend>
                            {idVerificationChecks.map(({ key, label }) => (
                              <label
                                key={key}
                                className="flex items-center gap-3 text-sm text-zinc-300"
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-green-600"
                                  checked={idConfirmations[order.id]?.[key] === true}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    setIdConfirmations((current) => ({
                                      ...current,
                                      [order.id]: {
                                        ...current[order.id],
                                        [key]: checked,
                                      },
                                    }));
                                  }}
                                />
                                {label}
                              </label>
                            ))}
                          </fieldset>
                        )}

                      {!order.id_document_path ? (
                        <p className="mt-4 text-sm text-red-400">
                          No ID image is attached to this order.
                        </p>
                      ) : (
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            disabled={idBusyOrder === order.id}
                            onClick={() =>
                              void viewId(order)
                            }
                            className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold disabled:opacity-40"
                          >
                            VIEW ID
                          </button>

                          <button
                            type="button"
                            disabled={
                              isTerminal || idBusyOrder === order.id ||
                              order.id_review_status === "approved" ||
                              !idVerificationChecks.every(
                                ({ key }) => idConfirmations[order.id]?.[key] === true
                              )
                            }
                            onClick={() =>
                              void reviewId(order, "approved")
                            }
                            className="rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
                          >
                            APPROVE ID
                          </button>

                          <button
                            type="button"
                            disabled={
                              isTerminal || idBusyOrder === order.id ||
                              order.id_review_status === "rejected"
                            }
                            onClick={() =>
                              void reviewId(order, "rejected")
                            }
                            className="rounded-xl bg-red-800 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
                          >
                            REJECT ID
                          </button>
                        </div>
                      )}

                      {idBusyOrder === order.id && (
                        <p className="mt-3 text-sm text-zinc-400">
                          Processing...
                        </p>
                      )}

                      {idMessages[order.id] && (
                        <p className="mt-3 text-sm text-zinc-300">
                          {idMessages[order.id]}
                        </p>
                      )}
                    </div>

                    <div className="mt-6 rounded-xl border border-zinc-800 bg-black p-4">
                      <p className="text-sm font-bold">
                        Update Order Status
                      </p>

                      {isTerminal ? (
                        <p className="mt-3 text-sm text-zinc-400">
                          This order is{" "}
                          <strong>
                            {statusLabels[
                              order.status
                            ] || order.status}
                          </strong>
                          . Completed and cancelled
                          orders cannot be reopened.
                        </p>
                      ) : (
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                          <select
                            value={selectedStatus}
                            onChange={(event) =>
                              setSelectedStatuses(
                                (current) => ({
                                  ...current,
                                  [order.id]:
                                    event.target
                                      .value,
                                })
                              )
                            }
                            className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white"
                          >
                            {statusOptions.map(
                              (option) => (
                                <option
                                  key={
                                    option.value
                                  }
                                  value={
                                    option.value
                                  }
                                >
                                  {
                                    option.label
                                  }
                                </option>
                              )
                            )}
                          </select>

                          <button
                            type="button"
                            onClick={() =>
                              void updateOrderStatus(
                                order
                              )
                            }
                            disabled={
                              updatingOrder ===
                                order.id ||
                              selectedStatus ===
                                order.status
                            }
                            className="rounded-xl bg-white px-5 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {updatingOrder ===
                            order.id
                              ? "UPDATING..."
                              : "UPDATE STATUS"}
                          </button>
                        </div>
                      )}

                      {message && (
                        <p
                          className={`mt-3 text-sm ${
                            message.startsWith(
                              "Status updated"
                            )
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          {message}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <p className="mt-10 text-center text-xs text-zinc-500">
          TRAP HOUSE NC · ADMIN ORDER MANAGEMENT
        </p>
      </div>
    </main>
  );
}