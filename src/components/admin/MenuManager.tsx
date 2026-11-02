"use client";

import { useState } from "react";
import type { Ingredient } from "@/lib/types";
import { Field, ImageUploader, Modal, Toggle } from "@/components/ui";
import { Loading, Money, Panel, useRows } from "./shared";

type Cat = { id?: number; nameEn: string; nameAr: string; imageUrl: string; sort: number; active: boolean; timeFrom: string | null; timeTo: string | null };
type Item = {
  id?: number;
  categoryId: number;
  nameEn: string;
  nameAr: string;
  descEn: string;
  descAr: string;
  price: number;
  imageUrl: string;
  emoji: string;
  active: boolean;
  tags: string[];
  ingredients: Ingredient[];
  stock: number | null;
  loyaltyEligible: boolean;
  sort: number;
};

const emptyCat = (): Cat => ({ nameEn: "", nameAr: "", imageUrl: "", sort: 0, active: true, timeFrom: null, timeTo: null });
const emptyItem = (categoryId: number): Item => ({
  categoryId,
  nameEn: "",
  nameAr: "",
  descEn: "",
  descAr: "",
  price: 0,
  imageUrl: "",
  emoji: "",
  active: true,
  tags: [],
  ingredients: [],
  stock: null,
  loyaltyEligible: true,
  sort: 0,
});

export default function MenuManager({ slug }: { slug: string }) {
  const cats = useRows<Cat & { id: number }>(`/api/admin/${slug}/categories`);
  const items = useRows<Item & { id: number }>(`/api/admin/${slug}/items`);
  const [catEdit, setCatEdit] = useState<Cat | null>(null);
  const [itemEdit, setItemEdit] = useState<Item | null>(null);
  const [filter, setFilter] = useState(0);

  const shown = (items.rows ?? []).filter((i) => !filter || i.categoryId === filter);

  return (
    <div>
      <Panel
        title="Categories"
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setCatEdit(emptyCat())}>
            + Category
          </button>
        }
      >
        <Loading rows={cats.rows} />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {(cats.rows ?? []).map((c) => (
            <div key={c.id} className="card-2 flex items-center gap-3 p-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30">
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  "🗂️"
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">
                  {c.nameEn} <span className="text-muted">{c.nameAr}</span>
                </div>
                <div className="text-xs text-muted">{c.timeFrom && c.timeTo ? `⏰ ${c.timeFrom} – ${c.timeTo}` : "All day"}</div>
              </div>
              <Toggle checked={c.active} onChange={(v) => cats.save({ id: c.id, active: v })} />
              <button className="btn btn-ghost btn-sm" onClick={() => setCatEdit(c)}>
                Edit
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => cats.remove(c.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Items & inventory"
        actions={
          <>
            <select className="input !min-h-9 !w-auto !py-1" value={filter} onChange={(e) => setFilter(Number(e.target.value))}>
              <option value={0}>All categories</option>
              {(cats.rows ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameEn}
                </option>
              ))}
            </select>
            <button className="btn btn-primary btn-sm" disabled={!cats.rows?.length} onClick={() => setItemEdit(emptyItem(filter || cats.rows![0].id))}>
              + Item
            </button>
          </>
        }
      >
        <Loading rows={items.rows} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30">
                        {i.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={i.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          i.emoji || "🍽️"
                        )}
                      </div>
                      <div>
                        <div className="font-bold">{i.nameEn}</div>
                        <div className="text-xs text-muted">
                          {i.nameAr} {i.tags.map((t) => (t === "spicy" ? "🌶️" : "🌿")).join("")} {i.ingredients.length > 0 && `· ${i.ingredients.length} ingredients`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{cats.rows?.find((c) => c.id === i.categoryId)?.nameEn}</td>
                  <td className="font-bold text-accent">{Money(i.price)}</td>
                  <td>
                    <input
                      key={`${i.id}-${i.stock}`}
                      type="number"
                      min={0}
                      placeholder="∞"
                      className="input !min-h-8 !w-20 !py-1"
                      defaultValue={i.stock ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        if (v !== i.stock) void items.save({ id: i.id, stock: v });
                      }}
                    />
                  </td>
                  <td>
                    <Toggle checked={i.active} onChange={(v) => items.save({ id: i.id, active: v })} />
                  </td>
                  <td className="whitespace-nowrap text-end">
                    <button className="btn btn-ghost btn-sm" onClick={() => setItemEdit(i)}>
                      Edit
                    </button>{" "}
                    <button className="btn btn-danger btn-sm" onClick={() => items.remove(i.id)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {catEdit && (
        <Modal open onClose={() => setCatEdit(null)} title={catEdit.id ? "Edit category" : "New category"}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name (English)">
                <input className="input" value={catEdit.nameEn} onChange={(e) => setCatEdit({ ...catEdit, nameEn: e.target.value })} />
              </Field>
              <Field label="Name (Arabic)">
                <input className="input" dir="rtl" value={catEdit.nameAr} onChange={(e) => setCatEdit({ ...catEdit, nameAr: e.target.value })} />
              </Field>
            </div>
            <ImageUploader label="Category thumbnail icon" value={catEdit.imageUrl} onChange={(u) => setCatEdit({ ...catEdit, imageUrl: u })} />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Available from">
                <input type="time" className="input" value={catEdit.timeFrom ?? ""} onChange={(e) => setCatEdit({ ...catEdit, timeFrom: e.target.value || null })} />
              </Field>
              <Field label="Available to">
                <input type="time" className="input" value={catEdit.timeTo ?? ""} onChange={(e) => setCatEdit({ ...catEdit, timeTo: e.target.value || null })} />
              </Field>
              <Field label="Sort">
                <input type="number" className="input" value={catEdit.sort} onChange={(e) => setCatEdit({ ...catEdit, sort: Number(e.target.value) })} />
              </Field>
            </div>
            <p className="text-xs text-muted">Leave both times empty for an all-day category (e.g. set 06:00–11:00 for Breakfast).</p>
            <Toggle checked={catEdit.active} onChange={(v) => setCatEdit({ ...catEdit, active: v })} label="Active" />
            <button
              className="btn btn-primary w-full"
              disabled={!catEdit.nameEn.trim()}
              onClick={async () => {
                const payload = { ...catEdit, timeFrom: catEdit.timeFrom && catEdit.timeTo ? catEdit.timeFrom : null, timeTo: catEdit.timeFrom && catEdit.timeTo ? catEdit.timeTo : null };
                if (await cats.save(payload as unknown as Record<string, unknown>)) setCatEdit(null);
              }}
            >
              Save category
            </button>
          </div>
        </Modal>
      )}

      {itemEdit && (
        <Modal open onClose={() => setItemEdit(null)} title={itemEdit.id ? "Edit item" : "New item"} wide>
          <ItemForm
            value={itemEdit}
            cats={cats.rows ?? []}
            onChange={setItemEdit}
            onSave={async () => {
              if (await items.save(itemEdit as unknown as Record<string, unknown>)) setItemEdit(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function ItemForm({ value: v, cats, onChange, onSave }: { value: Item; cats: { id: number; nameEn: string }[]; onChange: (i: Item) => void; onSave: () => void }) {
  const set = <K extends keyof Item>(k: K, val: Item[K]) => onChange({ ...v, [k]: val });
  const setIng = (idx: number, patch: Partial<Ingredient>) => set("ingredients", v.ingredients.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  const toggleTag = (tag: string) => set("tags", v.tags.includes(tag) ? v.tags.filter((x) => x !== tag) : [...v.tags, tag]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name (English)">
          <input className="input" value={v.nameEn} onChange={(e) => set("nameEn", e.target.value)} />
        </Field>
        <Field label="Name (Arabic)">
          <input className="input" dir="rtl" value={v.nameAr} onChange={(e) => set("nameAr", e.target.value)} />
        </Field>
        <Field label="Description (English)">
          <textarea className="input" rows={2} value={v.descEn} onChange={(e) => set("descEn", e.target.value)} />
        </Field>
        <Field label="Description (Arabic)">
          <textarea className="input" dir="rtl" rows={2} value={v.descAr} onChange={(e) => set("descAr", e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Category">
          <select className="input" value={v.categoryId} onChange={(e) => set("categoryId", Number(e.target.value))}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameEn}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Price (BHD)">
          <input type="number" step="0.001" min="0" className="input" value={v.price} onChange={(e) => set("price", Number(e.target.value))} />
        </Field>
        <Field label="Stock (empty = unlimited)">
          <input type="number" min="0" className="input" value={v.stock ?? ""} onChange={(e) => set("stock", e.target.value === "" ? null : Number(e.target.value))} />
        </Field>
        <Field label="Fallback emoji">
          <input className="input" maxLength={4} value={v.emoji} onChange={(e) => set("emoji", e.target.value)} />
        </Field>
      </div>
      <ImageUploader label="Product photo" value={v.imageUrl} onChange={(u) => set("imageUrl", u)} />
      <div className="flex flex-wrap items-center gap-5">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={v.tags.includes("spicy")} onChange={() => toggleTag("spicy")} /> 🌶️ Spicy
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={v.tags.includes("fresh")} onChange={() => toggleTag("fresh")} /> 🌿 Fresh
        </label>
        <Toggle checked={v.loyaltyEligible} onChange={(x) => set("loyaltyEligible", x)} label="Counts for loyalty" />
        <Toggle checked={v.active} onChange={(x) => set("active", x)} label="Active" />
      </div>

      <div className="card-2 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <b>Ingredients & customizers</b>
            <p className="text-xs text-muted">Add price &gt; 0 makes it an optional paid extra. Otherwise it is part of the recipe (can be removable).</p>
          </div>
          <button className="btn btn-soft btn-sm" onClick={() => set("ingredients", [...v.ingredients, { nameEn: "", nameAr: "", imageUrl: "", removable: true, addPrice: 0 }])}>
            + Ingredient
          </button>
        </div>
        <div className="space-y-2">
          {v.ingredients.map((g, i) => (
            <div key={i} className="grid items-center gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_1fr_6rem_auto_auto]">
              <input className="input" placeholder="Name (EN)" value={g.nameEn} onChange={(e) => setIng(i, { nameEn: e.target.value })} />
              <input className="input" dir="rtl" placeholder="الاسم (AR)" value={g.nameAr} onChange={(e) => setIng(i, { nameAr: e.target.value })} />
              <input className="input" type="number" step="0.001" min="0" placeholder="Add price" value={g.addPrice} onChange={(e) => setIng(i, { addPrice: Number(e.target.value) })} />
              <label className="flex items-center gap-1 text-xs font-semibold">
                <input type="checkbox" checked={g.removable} onChange={(e) => setIng(i, { removable: e.target.checked })} /> removable
              </label>
              <button className="btn btn-danger btn-sm" onClick={() => set("ingredients", v.ingredients.filter((_, j) => j !== i))}>
                ✕
              </button>
              <div className="sm:col-span-5">
                <ImageUploader label="Ingredient image" value={g.imageUrl} onChange={(u) => setIng(i, { imageUrl: u })} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <button className="btn btn-primary w-full" disabled={!v.nameEn.trim() || !v.categoryId} onClick={onSave}>
        Save item
      </button>
    </div>
  );
}
