/**
 * The shop, after Rust's vending machine: FOR SALE | COST | BUY rows. Everything is
 * cosmetic (main-menu banners, notice frames, titles) except upkeep, which is paid from a
 * Blueprint's Tool Cupboard. Scrap is earned by crafting Items.
 */
import { useState } from "react";
import { mutate } from "swr";
import { cn } from "@plane/utils";
import type { TOffer } from "../lib/api";
import { useWbShop, wb } from "../lib/api";
import { play } from "../sound/engine";
import { pushNotice } from "../components/notices";
import { RustItem } from "../components/rust-icon";
import { WbPage } from "./shell";

function Preview({ o }: { o: TOffer }) {
  if (o.kind === "upkeep") return <RustItem item="cupboard.tool" size={54} />;
  if (o.kind === "banner")
    return <span className={cn("wb-shop__swatch", `wb-scene--${o.id.replace("banner-", "")}`)} />;
  if (o.kind === "frame") return <span className={cn("wb-shop__frame", `wb-notice--${o.id.replace("frame-", "")}`)} />;
  return <span className="wb-shop__badge">{o.name.replace("Title: ", "")}</span>;
}

export function Shop() {
  const { data } = useWbShop();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (o: TOffer, equipped: boolean) => {
    setBusy(o.id);
    try {
      if (o.owned) {
        await wb.post("equip", { kind: o.kind, offer: equipped ? null : o.id });
        play("click");
      } else {
        await wb.post("buy", { offer: o.id });
        pushNotice({ kind: "bought", title: "Bought", name: o.name, item: "vending.machine", scrap: -o.cost });
      }
      await Promise.all([mutate("wb:shop"), mutate("wb:state")]);
    } catch (e) {
      play("close");
      pushNotice({ kind: "scrapped", title: "Can't buy", name: (e as Error).message, item: "scrap" });
    } finally {
      setBusy(null);
    }
  };

  const offers = (data?.offers ?? []).filter((o) => o.kind !== "upkeep");
  return (
    <WbPage active="shop" title="Shop">
      <div className="wb-shop">
        <div className="wb-shop__top">
          <div className="wb-shop__machine">
            <RustItem item="vending.machine" size={44} />
            <span>
              <small>Vending machine</small>
              <b>Workbench Shop</b>
            </span>
          </div>
          <div className="wb-shop__bal">
            <RustItem item="scrap" size={28} />
            <b>{(data?.balance ?? 0).toLocaleString()}</b>
            <small>scrap</small>
          </div>
        </div>
        <div className="wb-shop__head">
          <span>For sale</span>
          <span>Cost</span>
          <span />
        </div>
        {offers.map((o) => {
          const equipped = data?.equipped[o.kind as "banner" | "frame" | "badge"] === o.id;
          const poor = !o.owned && (data?.balance ?? 0) < o.cost;
          return (
            <div key={o.id} className={cn("wb-shop__row", o.owned && "wb-shop__row--owned")}>
              <div className="wb-shop__item">
                <span className="wb-shop__tile">
                  <Preview o={o} />
                </span>
                <span>
                  <b>{o.name}</b>
                  <small>{o.desc}</small>
                </span>
              </div>
              <span className="wb-shop__tile wb-shop__cost">
                <RustItem item="scrap" size={40} />
                <i>x{o.cost}</i>
              </span>
              <button
                type="button"
                className={cn("wb-btn", o.owned ? (equipped ? "wb-btn--ghost" : "wb-btn--amber") : "wb-btn--green")}
                disabled={busy === o.id || poor}
                onClick={() => void act(o, equipped)}
                data-wb-silent
              >
                {o.owned ? (equipped ? "Unequip" : "Equip") : "Buy"}
              </button>
            </div>
          );
        })}
        <p className="wb-muted">
          Earn scrap by crafting Items: Twig 5 · Wood 10 · Stone 15 · Sheet Metal 25 · Armored 40 · components 5. Upkeep
          (50 scrap = 2 days) is paid from a Blueprint&apos;s Tool Cupboard.
        </p>
      </div>
    </WbPage>
  );
}
