"use client";
import { Boxes, ClipboardCheck, PackagePlus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Empty, PageHeader } from "@/components/page";
type Item = {
  id: number;
  code: string;
  name: string;
  uom: string;
  reorderLevel: number;
};
type Bin = { id: number; code: string; name: string; warehouse: string };
type Asset = {
  id: number;
  code: string;
  name: string;
  serialNumber?: string;
  status: string;
  category: { name: string };
  location: { name: string };
};
type Balance = {
  id: number;
  onHand: number;
  reserved: number;
  hold: number;
  item: Item;
  bin: Bin;
};
type Reservation = {
  id: number;
  code: string;
  item: Item;
  bin: Bin;
  quantity: number;
  remaining: number;
  status: string;
};
type ReturnDocument = {
  id: number;
  code: string;
  issue: { reference: string };
  item: Item;
  bin: Bin;
  quantity: number;
  status: string;
  disposition: string;
  note: string;
};
type PurchaseProposal = {
  id: number;
  code: string;
  item: Item;
  quantity: number;
  available: number;
  reorderLevel: number;
  status: string;
};
type Receipt = {
  id: number;
  code: string;
  item: Item;
  bin: Bin;
  quantity: number;
  accepted: number | null;
  held: number | null;
  rejected: number | null;
  status: string;
  poReference: string | null;
  qcNote: string | null;
};
type StockReview = {
  id: number;
  code: string;
  kind: string;
  item: Item;
  bin: Bin;
  snapshotQty: number;
  proposedQty: number;
  recountQty: number | null;
  status: string;
  note: string;
};
type PurchaseOrder = {
  id: number;
  code: string;
  item: Item;
  quantity: number;
  allocated: number;
  supplier: string | null;
  status: string;
};
const masterBlank = {
  name: "",
  warehouse: "",
  uom: "PCS",
  stockType: "CONSUMABLE",
  reorderLevel: "0",
};
const blank = {
  itemId: "",
  binId: "",
  toBinId: "",
  reservationId: "",
  qty: "",
  note: "",
};
export default function InventoryPage() {
  const [tab, setTab] = useState("stock"),
    [items, setItems] = useState<Item[]>([]),
    [bins, setBins] = useState<Bin[]>([]),
    [balances, setBalances] = useState<Balance[]>([]),
    [minimum, setMinimum] = useState<any[]>([]),
    [reservations, setReservations] = useState<Reservation[]>([]),
    [returns, setReturns] = useState<ReturnDocument[]>([]),
    [proposals, setProposals] = useState<PurchaseProposal[]>([]),
    [receipts, setReceipts] = useState<Receipt[]>([]),
    [orders, setOrders] = useState<PurchaseOrder[]>([]),
    [reviews, setReviews] = useState<StockReview[]>([]),
    [assets, setAssets] = useState<Asset[]>([]),
    [assetPage, setAssetPage] = useState(1),
    [assetPages, setAssetPages] = useState(1),
    [assetSearch, setAssetSearch] = useState(""),
    [ledger, setLedger] = useState<any[]>([]),
    [form, setForm] = useState<any>(blank),
    [master, setMaster] = useState<any>(masterBlank),
    [msg, setMsg] = useState("");
  const [returnForm, setReturnForm] = useState({
    issueId: "",
    qty: "",
    disposition: "HOLD",
    note: "",
  });
  const [receiptForm, setReceiptForm] = useState({
    itemId: "",
    binId: "",
    qty: "",
    purchaseOrderId: "",
    note: "",
  });
  const [orderForm, setOrderForm] = useState({
    itemId: "",
    qty: "",
    supplier: "",
    note: "",
  });
  const [inspecting, setInspecting] = useState<number | null>(null);
  const [qc, setQc] = useState({
    accepted: "",
    held: "0",
    rejected: "0",
    note: "",
  });
  const [holdForm, setHoldForm] = useState({ sourceId: "", qty: "", note: "" });
  const [recount, setRecount] = useState<Record<number, string>>({});
  const load = useCallback(async () => {
    try {
      const [
        i,
        b,
        s,
        m,
        assetResult,
        history,
        reservationResult,
        returnResult,
        proposalResult,
        receiptResult,
        reviewResult,
        orderResult,
      ] = await Promise.all([
        api<Item[]>("/inventory/items"),
        api<Bin[]>("/inventory/bins"),
        api<Balance[]>("/inventory/balances"),
        api<any[]>("/inventory/minimum-stock"),
        api<{ items: Asset[]; totalPages: number }>(
          `/inventory/assets?page=${assetPage}&q=${encodeURIComponent(assetSearch)}`,
        ),
        api<any[]>("/inventory/ledger"),
        api<Reservation[]>("/inventory/reservations"),
        api<ReturnDocument[]>("/inventory/returns"),
        api<PurchaseProposal[]>("/inventory/purchase-proposals"),
        api<Receipt[]>("/inventory/receipts"),
        api<StockReview[]>("/inventory/stock-reviews"),
        api<PurchaseOrder[]>("/inventory/purchase-orders"),
      ]);
      setItems(i);
      setBins(b);
      setBalances(s);
      setMinimum(m);
      setAssets(assetResult.items);
      setAssetPages(assetResult.totalPages);
      setLedger(history);
      setReservations(reservationResult);
      setReturns(returnResult);
      setProposals(proposalResult);
      setReceipts(receiptResult);
      setReviews(reviewResult);
      setOrders(orderResult);
      setMsg("");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Inventory gagal dimuat.");
    }
  }, [assetPage, assetSearch]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 250);
    return () => clearTimeout(timer);
  }, [load]);
  async function postDocument(path: string, body: object = {}) {
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      await load();
      return true;
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Dokumen gagal diproses.");
      return false;
    }
  }
  async function masterSubmit(path: string) {
    try {
      await api(path, {
        method: "POST",
        body: JSON.stringify(
          path.endsWith("/items")
            ? {
                name: master.name,
                uom: master.uom,
                stockType: master.stockType,
                reorderLevel: Number(master.reorderLevel),
                ...(master.assetId ? { assetId: Number(master.assetId) } : {}),
              }
            : { name: master.name, warehouse: master.warehouse },
        ),
      });
      setMaster(masterBlank);
      await load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Master gagal disimpan.");
    }
  }
  async function submit(path: string) {
    const isReservationMove =
      path.endsWith("issue") || path.endsWith("release");
    if (isReservationMove && !form.reservationId) {
      setMsg("Pilih reservasi untuk issue atau pelepasan.");
      return;
    }
    if (!isReservationMove && (!form.itemId || !form.binId)) {
      setMsg("Pilih item dan bin terlebih dahulu.");
      return;
    }
    if (String(form.qty).trim() === "") {
      setMsg(
        "Isi jumlah terlebih dahulu. Gunakan 0 jika hasil opname memang kosong.",
      );
      return;
    }
    const amount = Number(form.qty);
    const isOpname = path.endsWith("opname");
    const isAdjustment = path.endsWith("adjustment");
    if ((isOpname || isAdjustment) && !String(form.note || "").trim()) {
      setMsg("Isi alasan pemeriksaan atau penyesuaian stok.");
      return;
    }
    if (
      !Number.isSafeInteger(amount) ||
      (isOpname && amount < 0) ||
      (isAdjustment && amount === 0) ||
      (!isOpname && !isAdjustment && amount <= 0)
    ) {
      setMsg(
        isOpname
          ? "Jumlah opname harus berupa bilangan bulat 0 atau lebih."
          : isAdjustment
            ? "Adjustment harus berupa bilangan bulat selain 0."
            : "Jumlah harus berupa bilangan bulat lebih dari 0.",
      );
      return;
    }
    if (
      path.endsWith("transfer") &&
      (!form.toBinId || form.toBinId === form.binId)
    ) {
      setMsg("Pilih bin tujuan yang berbeda dari bin asal.");
      return;
    }
    try {
      await api(isOpname || isAdjustment ? "/inventory/stock-reviews" : path, {
        method: "POST",
        body: JSON.stringify({
          ...(isReservationMove
            ? { reservationId: Number(form.reservationId) }
            : {
                itemId: Number(form.itemId),
                ...(path.endsWith("transfer")
                  ? {
                      fromBinId: Number(form.binId),
                      toBinId: Number(form.toBinId),
                    }
                  : { binId: Number(form.binId) }),
              }),
          ...(isOpname || isAdjustment
            ? { kind: isOpname ? "COUNT" : "ADJUSTMENT", quantity: amount }
            : { qty: amount }),
          ...(form.note ? { note: form.note } : {}),
        }),
      });
      setForm(blank);
      await load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Transaksi gagal.");
    }
  }
  const fields = () => (
    <>
      <select
        className="input"
        required
        value={form.itemId}
        onChange={(e) => setForm({ ...form, itemId: e.target.value })}
      >
        <option value="">Pilih item</option>
        {items.map((x) => (
          <option key={x.id} value={x.id}>
            {x.code} · {x.name}
          </option>
        ))}
      </select>
      <select
        className="input"
        required
        value={form.binId}
        onChange={(e) => setForm({ ...form, binId: e.target.value })}
      >
        <option value="">Pilih bin</option>
        {bins.map((x) => (
          <option key={x.id} value={x.id}>
            {x.code} · {x.name}
          </option>
        ))}
      </select>
      <input
        className="input"
        required
        type="number"
        value={form.qty}
        placeholder="Qty"
        onChange={(e) => setForm({ ...form, qty: e.target.value })}
      />
      <input
        className="input"
        value={form.note}
        placeholder="Catatan"
        onChange={(e) => setForm({ ...form, note: e.target.value })}
      />
    </>
  );
  return (
    <>
      <PageHeader
        title="Inventory & Stock Control"
        description="Kelola stok item, bin, transaksi ledger, opname, dan minimum stock."
      />
      {msg && (
        <p className="mb-4 rounded-xl bg-rose-50 p-3 text-rose-700">{msg}</p>
      )}
      <div className="mb-5 flex flex-wrap gap-2">
        {[
          ["stock", "Saldo Stok"],
          ["assets", "Aset Existing"],
          ["master", "Item & Lokasi"],
          ["receipts", "Penerimaan & QC"],
          ["transaction", "Transaksi"],
          ["returns", "Retur"],
          ["opname", "Opname & Adjustment"],
          ["minimum", "Minimum Stock"],
          ["ledger", "Riwayat Stok"],
        ].map(([id, label]) => (
          <button
            className={tab === id ? "btn-primary" : "btn-secondary"}
            onClick={() => setTab(id)}
            key={id}
          >
            {label}
          </button>
        ))}
        <button className="btn-secondary" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>
      {tab === "assets" && (
        <section className="card overflow-hidden">
          <div className="border-b p-4">
            <h2 className="font-semibold">Asset Existing</h2>
            <p className="text-sm text-slate-500">
              Daftar asset aktif yang sudah terdaftar di ISM.
            </p>
            <input
              className="input mt-3"
              placeholder="Cari kode, nama, atau serial"
              value={assetSearch}
              onChange={(e) => {
                setAssetPage(1);
                setAssetSearch(e.target.value);
              }}
            />
          </div>
          <div className="divide-y">
            {assets.map((asset) => (
              <div className="flex justify-between p-4" key={asset.id}>
                <span>
                  <b>
                    {asset.code} · {asset.name}
                  </b>
                  <small className="block text-slate-500">
                    {asset.category.name} · {asset.location.name} ·{" "}
                    {asset.serialNumber || "tanpa serial"}
                  </small>
                </span>
                <span>{asset.status}</span>
              </div>
            ))}
            {!assets.length && <Empty text="Belum ada asset terdaftar." />}
          </div>
          <div className="flex items-center justify-end gap-3 border-t p-4 text-sm">
            <button
              className="btn-secondary"
              disabled={assetPage <= 1}
              onClick={() => setAssetPage(assetPage - 1)}
            >
              Sebelumnya
            </button>
            <span>
              {assetPage} / {assetPages}
            </span>
            <button
              className="btn-secondary"
              disabled={assetPage >= assetPages}
              onClick={() => setAssetPage(assetPage + 1)}
            >
              Berikutnya
            </button>
          </div>
        </section>
      )}
      {tab === "master" && (
        <section className="grid gap-4 lg:grid-cols-2">
          <form
            className="card p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void masterSubmit("/inventory/items");
            }}
          >
            <h2 className="font-semibold">Tambah Item</h2>
            <div className="mt-4 space-y-3">
              <input
                className="input"
                required
                placeholder="Nama item"
                value={master.name}
                onChange={(e) => setMaster({ ...master, name: e.target.value })}
              />
              <input
                className="input"
                placeholder="UOM"
                value={master.uom}
                onChange={(e) => setMaster({ ...master, uom: e.target.value })}
              />
              <select
                className="input"
                value={master.stockType}
                onChange={(e) =>
                  setMaster({ ...master, stockType: e.target.value })
                }
              >
                <option value="CONSUMABLE">Consumable</option>
                <option value="SPARE_PART">Spare part</option>
                <option value="SERIALIZED" disabled>
                  Serial (belum tersedia)
                </option>
              </select>
              <input
                className="input"
                placeholder="Cari aset referensi"
                value={assetSearch}
                onChange={(e) => {
                  setAssetPage(1);
                  setAssetSearch(e.target.value);
                }}
              />
              <select
                className="input"
                value={master.assetId || ""}
                onChange={(e) =>
                  setMaster({ ...master, assetId: e.target.value })
                }
              >
                <option value="">Referensi aset (opsional)</option>
                {master.assetId &&
                  !assets.some(
                    (asset) => String(asset.id) === master.assetId,
                  ) && (
                    <option value={master.assetId}>
                      Aset terhubung #{master.assetId}
                    </option>
                  )}
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.code} · {asset.name}
                  </option>
                ))}
              </select>
              <input
                className="input"
                type="number"
                min="0"
                placeholder="Minimum stock"
                value={master.reorderLevel}
                onChange={(e) =>
                  setMaster({ ...master, reorderLevel: e.target.value })
                }
              />
            </div>
            <button className="btn-primary mt-4">Simpan Item</button>
          </form>
          <form
            className="card p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void masterSubmit("/inventory/bins");
            }}
          >
            <h2 className="font-semibold">Tambah Bin / Lokasi</h2>
            <div className="mt-4 space-y-3">
              <input
                className="input"
                required
                placeholder="Nama bin"
                value={master.name}
                onChange={(e) => setMaster({ ...master, name: e.target.value })}
              />
              <input
                className="input"
                required
                placeholder="Warehouse"
                value={master.warehouse}
                onChange={(e) =>
                  setMaster({ ...master, warehouse: e.target.value })
                }
              />
            </div>
            <button className="btn-primary mt-4">Simpan Bin</button>
          </form>
        </section>
      )}
      {tab === "stock" && (
        <section className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3">Item</th>
                <th>Bin</th>
                <th>On hand</th>
                <th>Reserved</th>
                <th>Hold</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((x) => (
                <tr className="border-t" key={x.id}>
                  <td className="p-3">
                    <b>{x.item.code}</b>
                    <span className="block text-slate-500">{x.item.name}</span>
                  </td>
                  <td>
                    {x.bin.code} · {x.bin.name}
                  </td>
                  <td>{x.onHand}</td>
                  <td>{x.reserved}</td>
                  <td>{x.hold}</td>
                  <td className="font-semibold">
                    {x.onHand - x.reserved - x.hold}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!balances.length && <Empty text="Belum ada saldo stok." />}
        </section>
      )}
      {tab === "receipts" && (
        <div className="space-y-4">
          <form
            className="card space-y-3 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void postDocument("/inventory/purchase-orders", {
                itemId: Number(orderForm.itemId),
                qty: Number(orderForm.qty),
                ...(orderForm.supplier.trim()
                  ? { supplier: orderForm.supplier.trim() }
                  : {}),
                ...(orderForm.note.trim()
                  ? { note: orderForm.note.trim() }
                  : {}),
              }).then((ok) => {
                if (ok)
                  setOrderForm({ itemId: "", qty: "", supplier: "", note: "" });
              });
            }}
          >
            <h2 className="font-semibold">Purchase Order</h2>
            <p className="text-sm text-slate-500">
              PO dibuat di ISM dengan kode otomatis. Penerimaan tanpa PO tetap
              diperbolehkan.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="input"
                required
                value={orderForm.itemId}
                onChange={(e) =>
                  setOrderForm({ ...orderForm, itemId: e.target.value })
                }
              >
                <option value="">Pilih item PO</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </select>
              <input
                className="input"
                required
                type="number"
                min="1"
                placeholder="Jumlah dipesan"
                value={orderForm.qty}
                onChange={(e) =>
                  setOrderForm({ ...orderForm, qty: e.target.value })
                }
              />
              <input
                className="input"
                placeholder="Pemasok (opsional)"
                value={orderForm.supplier}
                onChange={(e) =>
                  setOrderForm({ ...orderForm, supplier: e.target.value })
                }
              />
              <input
                className="input"
                placeholder="Catatan (opsional)"
                value={orderForm.note}
                onChange={(e) =>
                  setOrderForm({ ...orderForm, note: e.target.value })
                }
              />
            </div>
            <button className="btn-secondary">Buat PO</button>
            {orders.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <span>
                  <b>{order.code}</b> · {order.item.name} · {order.allocated}/
                  {order.quantity} dialokasikan · {order.status}
                  {order.supplier ? ` · ${order.supplier}` : ""}
                </span>
                {order.status === "OPEN" && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      void postDocument(
                        `/inventory/purchase-orders/${order.id}/close`,
                      )
                    }
                  >
                    Tutup PO
                  </button>
                )}
              </div>
            ))}
          </form>
          <form
            className="card space-y-3 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void postDocument("/inventory/receipts", {
                itemId: Number(receiptForm.itemId),
                binId: Number(receiptForm.binId),
                qty: Number(receiptForm.qty),
                ...(receiptForm.purchaseOrderId
                  ? { purchaseOrderId: Number(receiptForm.purchaseOrderId) }
                  : {}),
                ...(receiptForm.note.trim()
                  ? { note: receiptForm.note.trim() }
                  : {}),
              }).then((ok) => {
                if (ok)
                  setReceiptForm({
                    itemId: "",
                    binId: "",
                    qty: "",
                    purchaseOrderId: "",
                    note: "",
                  });
              });
            }}
          >
            <h2 className="font-semibold">Penerimaan barang</h2>
            <p className="text-sm text-slate-500">
              Buat dokumen, isi hasil QC, lalu administrator lain membukukan
              barang ke bin tujuan. PO boleh dipilih jika tersedia.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="input"
                required
                value={receiptForm.itemId}
                onChange={(e) =>
                  setReceiptForm({
                    ...receiptForm,
                    itemId: e.target.value,
                    purchaseOrderId: "",
                  })
                }
              >
                <option value="">Pilih item</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </select>
              <select
                className="input"
                required
                value={receiptForm.binId}
                onChange={(e) =>
                  setReceiptForm({ ...receiptForm, binId: e.target.value })
                }
              >
                <option value="">Pilih bin putaway</option>
                {bins.map((bin) => (
                  <option key={bin.id} value={bin.id}>
                    {bin.code} · {bin.name}
                  </option>
                ))}
              </select>
              <input
                className="input"
                required
                type="number"
                min="1"
                placeholder="Jumlah diterima"
                value={receiptForm.qty}
                onChange={(e) =>
                  setReceiptForm({ ...receiptForm, qty: e.target.value })
                }
              />
              <select
                className="input"
                value={receiptForm.purchaseOrderId}
                onChange={(e) =>
                  setReceiptForm({
                    ...receiptForm,
                    purchaseOrderId: e.target.value,
                  })
                }
              >
                <option value="">Tanpa PO</option>
                {orders
                  .filter(
                    (order) =>
                      order.status === "OPEN" &&
                      String(order.item.id) === receiptForm.itemId &&
                      order.allocated < order.quantity,
                  )
                  .map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.code} · sisa {order.quantity - order.allocated}
                    </option>
                  ))}
              </select>
              <input
                className="input"
                placeholder="Catatan"
                value={receiptForm.note}
                onChange={(e) =>
                  setReceiptForm({ ...receiptForm, note: e.target.value })
                }
              />
            </div>
            <button className="btn-primary">Buat penerimaan</button>
          </form>
          <section className="card overflow-hidden">
            <h2 className="border-b p-4 font-semibold">Dokumen penerimaan</h2>
            {receipts.map((row) => (
              <div key={row.id} className="border-b p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <b>
                      {row.code} · {row.item.name}
                    </b>
                    <p className="text-sm text-slate-500">
                      Jumlah {row.quantity} · {row.bin.name} · {row.status}
                      {row.poReference ? ` · PO ${row.poReference}` : ""}
                    </p>
                    {row.accepted !== null && (
                      <p className="text-sm text-slate-500">
                        Diterima {row.accepted} · Hold {row.held} · Ditolak{" "}
                        {row.rejected} · {row.qcNote}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {row.status === "DRAFT" && (
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          setInspecting(row.id);
                          setQc({
                            accepted: String(row.quantity),
                            held: "0",
                            rejected: "0",
                            note: "",
                          });
                        }}
                      >
                        Isi QC
                      </button>
                    )}
                    {row.status === "INSPECTED" && (
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          void postDocument(
                            `/inventory/receipts/${row.id}/putaway`,
                          )
                        }
                      >
                        Setujui putaway
                      </button>
                    )}
                    {["DRAFT", "INSPECTED"].includes(row.status) && (
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          void postDocument(
                            `/inventory/receipts/${row.id}/cancel`,
                          )
                        }
                      >
                        Batalkan
                      </button>
                    )}
                  </div>
                </div>
                {inspecting === row.id && row.status === "DRAFT" && (
                  <form
                    className="mt-4 grid gap-2 sm:grid-cols-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void postDocument(`/inventory/receipts/${row.id}/qc`, {
                        accepted: Number(qc.accepted),
                        held: Number(qc.held),
                        rejected: Number(qc.rejected),
                        note: qc.note,
                      }).then((ok) => {
                        if (ok) setInspecting(null);
                      });
                    }}
                  >
                    <label className="text-sm">
                      Diterima
                      <input
                        className="input mt-1"
                        required
                        type="number"
                        min="0"
                        value={qc.accepted}
                        onChange={(e) =>
                          setQc({ ...qc, accepted: e.target.value })
                        }
                      />
                    </label>
                    <label className="text-sm">
                      Hold
                      <input
                        className="input mt-1"
                        required
                        type="number"
                        min="0"
                        value={qc.held}
                        onChange={(e) => setQc({ ...qc, held: e.target.value })}
                      />
                    </label>
                    <label className="text-sm">
                      Ditolak
                      <input
                        className="input mt-1"
                        required
                        type="number"
                        min="0"
                        value={qc.rejected}
                        onChange={(e) =>
                          setQc({ ...qc, rejected: e.target.value })
                        }
                      />
                    </label>
                    <label className="text-sm">
                      Catatan QC
                      <input
                        className="input mt-1"
                        required
                        value={qc.note}
                        onChange={(e) => setQc({ ...qc, note: e.target.value })}
                      />
                    </label>
                    <button className="btn-primary">Simpan QC</button>
                  </form>
                )}
              </div>
            ))}
            {!receipts.length && <Empty text="Belum ada penerimaan." />}
          </section>
        </div>
      )}
      {tab === "transaction" && (
        <section className="card p-5">
          <h2 className="font-semibold">Receipt, Reservation, Issue</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{fields()}</div>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Reservasi untuk issue atau pelepasan
            <select
              className="input mt-1"
              value={form.reservationId}
              onChange={(e) =>
                setForm({ ...form, reservationId: e.target.value })
              }
            >
              <option value="">Pilih reservasi aktif</option>
              {reservations
                .filter(
                  (reservation) =>
                    reservation.status === "RESERVED" &&
                    reservation.remaining > 0,
                )
                .map((reservation) => (
                  <option key={reservation.id} value={reservation.id}>
                    {reservation.code} · {reservation.item.name} ·{" "}
                    {reservation.bin.name} · sisa {reservation.remaining}
                  </option>
                ))}
            </select>
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["/inventory/reserve", "Reserve"],
              ["/inventory/issue", "Issue"],
              ["/inventory/release", "Lepas Reservasi"],
            ].map(([path, label]) => (
              <button
                key={path}
                className="btn-primary"
                onClick={() => void submit(path)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-5 border-t pt-5">
            <h3 className="font-semibold">Transfer ke bin lain</h3>
            <select
              className="input mt-3"
              value={form.toBinId}
              onChange={(e) => setForm({ ...form, toBinId: e.target.value })}
            >
              <option value="">Pilih bin tujuan</option>
              {bins.map((bin) => (
                <option key={bin.id} value={bin.id}>
                  {bin.code} · {bin.name}
                </option>
              ))}
            </select>
            <button
              className="btn-secondary mt-3"
              onClick={() => void submit("/inventory/transfer")}
            >
              Transfer stok
            </button>
          </div>
          <form
            className="mt-5 space-y-3 border-t pt-5"
            onSubmit={(event) => {
              event.preventDefault();
              void postDocument("/inventory/hold-releases", {
                sourceId: holdForm.sourceId,
                qty: Number(holdForm.qty),
                note: holdForm.note,
              }).then((ok) => {
                if (ok) setHoldForm({ sourceId: "", qty: "", note: "" });
              });
            }}
          >
            <h3 className="font-semibold">
              Lepaskan stok hold setelah pemeriksaan
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                className="input"
                required
                value={holdForm.sourceId}
                onChange={(event) =>
                  setHoldForm({ ...holdForm, sourceId: event.target.value })
                }
              >
                <option value="">Pilih transaksi asal hold</option>
                {ledger
                  .filter((row) => row.holdDelta > 0)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.reference} · {row.item.name} · {row.bin.name} ·{" "}
                      {row.holdDelta}
                    </option>
                  ))}
              </select>
              <input
                className="input"
                required
                type="number"
                min="1"
                placeholder="Jumlah"
                value={holdForm.qty}
                onChange={(event) =>
                  setHoldForm({ ...holdForm, qty: event.target.value })
                }
              />
              <input
                className="input"
                required
                placeholder="Hasil pemeriksaan"
                value={holdForm.note}
                onChange={(event) =>
                  setHoldForm({ ...holdForm, note: event.target.value })
                }
              />
            </div>
            <button className="btn-secondary">Lepaskan hold</button>
          </form>
        </section>
      )}
      {tab === "returns" && (
        <div className="space-y-4">
          <form
            className="card space-y-3 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void postDocument("/inventory/returns", {
                issueId: returnForm.issueId,
                qty: Number(returnForm.qty),
                disposition: returnForm.disposition,
                note: returnForm.note,
              }).then((ok) => {
                if (ok)
                  setReturnForm({
                    issueId: "",
                    qty: "",
                    disposition: "HOLD",
                    note: "",
                  });
              });
            }}
          >
            <h2 className="font-semibold">Ajukan retur dari issue</h2>
            <p className="text-sm text-slate-500">
              Persetujuan dilakukan administrator lain. Barang hold tidak
              dihitung sebagai stok tersedia.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="input"
                required
                value={returnForm.issueId}
                onChange={(e) =>
                  setReturnForm({ ...returnForm, issueId: e.target.value })
                }
              >
                <option value="">Pilih transaksi issue</option>
                {ledger
                  .filter((row) => row.type === "ISSUE")
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.reference} · {row.item.name} · {row.bin.name} ·{" "}
                      {Math.abs(row.qty)}
                    </option>
                  ))}
              </select>
              <input
                className="input"
                required
                type="number"
                min="1"
                placeholder="Jumlah retur"
                value={returnForm.qty}
                onChange={(e) =>
                  setReturnForm({ ...returnForm, qty: e.target.value })
                }
              />
              <select
                className="input"
                value={returnForm.disposition}
                onChange={(e) =>
                  setReturnForm({ ...returnForm, disposition: e.target.value })
                }
              >
                <option value="HOLD">Hold untuk pemeriksaan</option>
                <option value="RESTOCK">Layak masuk stok</option>
              </select>
              <input
                className="input"
                required
                placeholder="Alasan dan hasil pemeriksaan"
                value={returnForm.note}
                onChange={(e) =>
                  setReturnForm({ ...returnForm, note: e.target.value })
                }
              />
            </div>
            <button className="btn-primary">Ajukan retur</button>
          </form>
          <section className="card overflow-hidden">
            <h2 className="border-b p-4 font-semibold">Dokumen retur</h2>
            {returns.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b p-4"
              >
                <div>
                  <b>
                    {row.code} · {row.item.name}
                  </b>
                  <p className="text-sm text-slate-500">
                    Issue {row.issue.reference} · {row.quantity} ·{" "}
                    {row.bin.name} · {row.disposition} · {row.status}
                  </p>
                  <p className="text-sm text-slate-500">{row.note}</p>
                </div>
                {row.status === "REQUESTED" && (
                  <div className="flex gap-2">
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        void postDocument(
                          `/inventory/returns/${row.id}/approve`,
                        )
                      }
                    >
                      Setujui dan catat
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        void postDocument(`/inventory/returns/${row.id}/cancel`)
                      }
                    >
                      Batalkan
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!returns.length && <Empty text="Belum ada dokumen retur." />}
          </section>
        </div>
      )}
      {tab === "opname" && (
        <section className="card p-5">
          <h2 className="font-semibold">Stock Opname & Adjustment</h2>
          <p className="mt-1 text-sm text-slate-500">
            Qty opname adalah jumlah fisik aktual. Adjustment memakai selisih
            positif atau negatif. Selisih opname perlu recount oleh pengguna
            lain; dokumen harus disetujui admin lain sebelum ledger berubah.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{fields()}</div>
          <div className="mt-4 flex gap-2">
            <button
              className="btn-primary"
              onClick={() => void submit("/inventory/opname")}
            >
              <ClipboardCheck className="h-4 w-4" />
              Ajukan Opname
            </button>
            <button
              className="btn-secondary"
              onClick={() => void submit("/inventory/adjustment")}
            >
              Ajukan Adjustment
            </button>
          </div>
          <div className="mt-6 space-y-3">
            <h3 className="font-semibold">Pemeriksaan dan rekonsiliasi</h3>
            {reviews.map((row) => (
              <div key={row.id} className="rounded-xl border p-4 text-sm">
                <div className="font-semibold">
                  {row.code} · {row.kind === "COUNT" ? "Opname" : "Adjustment"}{" "}
                  · {row.status}
                </div>
                <p className="mt-1 text-slate-600">
                  {row.item.name} · {row.bin.name} · Sistem {row.snapshotQty} ·
                  Hitung {row.proposedQty}
                  {row.recountQty !== null
                    ? ` · Recount ${row.recountQty}`
                    : ""}
                </p>
                <p className="mt-1 text-slate-600">{row.note}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {row.status === "RECOUNT_REQUIRED" && (
                    <>
                      <input
                        className="input max-w-40"
                        type="number"
                        min="0"
                        placeholder="Jumlah recount"
                        value={recount[row.id] ?? ""}
                        onChange={(e) =>
                          setRecount({ ...recount, [row.id]: e.target.value })
                        }
                      />
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          const value = recount[row.id];
                          if (
                            value === undefined ||
                            value.trim() === "" ||
                            !Number.isSafeInteger(Number(value)) ||
                            Number(value) < 0
                          ) {
                            setMsg("Isi jumlah recount dengan benar.");
                            return;
                          }
                          void postDocument(
                            `/inventory/stock-reviews/${row.id}/recount`,
                            { quantity: Number(value) },
                          );
                        }}
                      >
                        Simpan Recount
                      </button>
                    </>
                  )}
                  {row.status === "PENDING" && (
                    <button
                      className="btn-primary"
                      onClick={() =>
                        void postDocument(
                          `/inventory/stock-reviews/${row.id}/approve`,
                        )
                      }
                    >
                      Setujui &amp; Rekonsiliasi
                    </button>
                  )}
                  {["PENDING", "RECOUNT_REQUIRED"].includes(row.status) && (
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        void postDocument(
                          `/inventory/stock-reviews/${row.id}/cancel`,
                        )
                      }
                    >
                      Batalkan
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!reviews.length && <Empty text="Belum ada pemeriksaan stok." />}
          </div>
        </section>
      )}
      {tab === "ledger" && (
        <section className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3">Waktu / referensi</th>
                <th>Item / lokasi</th>
                <th>Jenis</th>
                <th>Stok</th>
                <th>Reservasi</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr className="border-t" key={row.id}>
                  <td className="p-3">
                    {new Date(row.createdAt).toLocaleString("id-ID")}
                    <span className="block text-slate-500">
                      {row.reference}
                    </span>
                  </td>
                  <td>
                    {row.item.name}
                    <span className="block text-slate-500">{row.bin.name}</span>
                  </td>
                  <td>{row.type}</td>
                  <td>
                    {row.qty > 0 ? "+" : ""}
                    {row.qty}
                  </td>
                  <td>
                    {row.reservedDelta > 0 ? "+" : ""}
                    {row.reservedDelta}
                  </td>
                  <td>{row.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!ledger.length && <Empty text="Belum ada transaksi stok." />}
        </section>
      )}
      {tab === "minimum" && (
        <section className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b p-4">
            <Boxes className="h-5 w-5 text-amber-600" />
            <h2 className="font-semibold">Proposal Replenishment</h2>
          </div>
          {minimum.map((x) => (
            <div className="flex justify-between border-b p-4" key={x.id}>
              <span>
                <b>
                  {x.item.code} · {x.item.name}
                </b>
                <small className="block text-slate-500">
                  Total semua lokasi · reorder level {x.item.reorderLevel}
                </small>
              </span>
              <span>
                Available {x.available} · <b>Usul {x.proposalQty}</b>
                <button
                  className="btn-secondary ml-3"
                  onClick={() =>
                    void postDocument("/inventory/purchase-proposals", {
                      itemId: x.id,
                    })
                  }
                >
                  Buat proposal
                </button>
              </span>
            </div>
          ))}
          {!minimum.length && (
            <Empty text="Semua item berada di atas minimum stock." />
          )}
          <h2 className="border-y p-4 font-semibold">Proposal tersimpan</h2>
          {proposals.map((row) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 border-b p-4"
              key={row.id}
            >
              <span>
                <b>
                  {row.code} · {row.item.name}
                </b>
                <small className="block text-slate-500">
                  Jumlah {row.quantity} · stok tersedia {row.available} ·
                  minimum {row.reorderLevel} · {row.status}
                </small>
              </span>
              {row.status === "DRAFT" && (
                <div className="flex gap-2">
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      void postDocument(
                        `/inventory/purchase-proposals/${row.id}/approve`,
                      )
                    }
                  >
                    Setujui proposal
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      void postDocument(
                        `/inventory/purchase-proposals/${row.id}/cancel`,
                      )
                    }
                  >
                    Batalkan
                  </button>
                </div>
              )}
              {row.status === "APPROVED" && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    const note = window.prompt(
                      "Catatan penyelesaian proposal:",
                    );
                    if (note?.trim())
                      void postDocument(
                        `/inventory/purchase-proposals/${row.id}/close`,
                        { note: note.trim() },
                      );
                  }}
                >
                  Tutup proposal
                </button>
              )}
            </div>
          ))}
          {!proposals.length && <Empty text="Belum ada proposal tersimpan." />}
        </section>
      )}
    </>
  );
}
