/**
 * The shop, after Rust's vending machine: FOR SALE | COST | BUY rows. Everything is
 * cosmetic (notice frames, titles, and main-menu banners shown as a grid of pictures) except
 * upkeep, which is paid from a Blueprint's Tool Cupboard. Scrap is earned by crafting Items.
 * Titles show their plate; earned titles unlock from the crafting record, with progress.
 */
import { useState } from "react";
import { mutate } from "swr";
import { cn } from "@plane/utils";
import type { TOffer, TTitle } from "../lib/api";
import { useWbShop, wb } from "../lib/api";
import { play } from "../sound/engine";
import { pushNotice } from "../components/notices";
import { RustItem } from "../components/rust-icon";
import { PlateFace } from "../components/title-plate";
import { bannerSlug, sceneThumb } from "../lib/scenes";
import { WbPage } from "./shell";

const STAT: Record<string, string> = {
  crafted: "Items crafted",
  scrap: "scrap earned",
  best_wipe: "Items crafted in one wipe",
  learned: "Blueprints learned",
};

function Preview({ o }: { o: TOffer }) {
  if (o.kind === "upkeep") return <RustItem item="cupboard.tool" size={54} />;
  return <span className={cn("wb-shop__frame", `wb-notice--${o.id.replace("frame-", "")}`)} />;
}

function Goal({ t }: { t: TTitle }) {
  const pct = Math.round(((t.progress ?? 0) / t.goal) * 100);
  return (
    <span className="wb-shop__goal">
      <b>
        {(t.progress ?? 0).toLocaleString()} / {t.goal.toLocaleString()}
      </b>{" "}
      {t.stat ? STAT[t.stat] : ""}
      <span className="wb-shop__bar">
        <i style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
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

  const wear = async (t: TTitle, on: boolean) => {
    setBusy(t.id);
    try {
      await wb.post("equip", { kind: "badge", offer: on ? null : t.id });
      play("click");
      await Promise.all([mutate("wb:shop"), mutate("wb:state")]);
    } finally {
      setBusy(null);
    }
  };

  const offers = data?.offers ?? [];
  const banners = offers.filter((o) => o.kind === "banner");
  const others = offers.filter((o) => o.kind === "frame");
  const offerOf = (id: string) => offers.find((o) => o.id === id);
  const titles = [...(data?.titles ?? []), ...(data?.earned ?? [])];
  const isOn = (o: TOffer) => data?.equipped[o.kind as "banner" | "frame" | "badge"] === o.id;
  const button = (o: TOffer) => {
    const equipped = isOn(o);
    const poor = !o.owned && (data?.balance ?? 0) < o.cost;
    return (
      <button
        type="button"
        className={cn("wb-btn", o.owned ? (equipped ? "wb-btn--ghost" : "wb-btn--amber") : "wb-btn--green")}
        disabled={busy === o.id || poor}
        onClick={() => void act(o, equipped)}
        data-wb-silent
      >
        {o.owned ? (equipped ? "Unequip" : "Equip") : "Buy"}
      </button>
    );
  };

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
        {others.map((o) => (
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
            {button(o)}
          </div>
        ))}

        <div className="wb-shop__head wb-shop__head--banners">
          <span>Titles</span>
          <span>
            {titles.filter((t) => t.owned).length} / {titles.length} owned
          </span>
        </div>
        <div className="wb-shop__titles">
          {titles.map((t) => {
            const offer = offerOf(t.id);
            const on = data?.equipped.badge === t.id;
            return (
              <div
                key={t.id}
                className={cn("wb-shop__tcard", t.owned && "wb-shop__tcard--owned", on && "wb-shop__tcard--on")}
              >
                <PlateFace title={t} className={cn(!t.owned && "wb-title--locked")} />
                <span className="wb-shop__tfoot">
                  {t.owned ? (
                    <>
                      <span className="wb-shop__goal">{t.stat ? "Earned" : "Bought"}</span>
                      <button
                        type="button"
                        className={cn("wb-btn", on ? "wb-btn--ghost" : "wb-btn--amber")}
                        disabled={busy === t.id}
                        onClick={() => void wear(t, on)}
                        data-wb-silent
                      >
                        {on ? "Unequip" : "Equip"}
                      </button>
                    </>
                  ) : offer ? (
                    <>
                      <span className="wb-shop__price">
                        <RustItem item="scrap" size={22} />x{offer.cost}
                      </span>
                      {button(offer)}
                    </>
                  ) : (
                    <Goal t={t} />
                  )}
                </span>
              </div>
            );
          })}
        </div>

        <div className="wb-shop__head wb-shop__head--banners">
          <span>Main-menu banners</span>
          <span>
            {banners.filter((o) => o.owned).length} / {banners.length} owned
          </span>
        </div>
        <div className="wb-shop__banners">
          {banners.map((o) => (
            <div
              key={o.id}
              className={cn("wb-shop__card", o.owned && "wb-shop__card--owned", isOn(o) && "wb-shop__card--on")}
            >
              <img src={sceneThumb(bannerSlug(o.id))} alt="" loading="lazy" decoding="async" />
              <span className="wb-shop__card-name">
                <b>{o.name.replace("Banner: ", "")}</b>
                <small>{o.desc}</small>
              </span>
              <span className="wb-shop__card-foot">
                <span className="wb-shop__price">
                  <RustItem item="scrap" size={22} />
                  {o.owned ? "Owned" : `x${o.cost}`}
                </span>
                {button(o)}
              </span>
            </div>
          ))}
        </div>
        <p className="wb-muted">
          Earn scrap by crafting Items: Twig 5 · Wood 10 · Stone 15 · Sheet Metal 25 · Armored 40 · components 5. Upkeep
          (50 scrap = 2 days) is paid from a Blueprint&apos;s Tool Cupboard.
        </p>
      </div>
    </WbPage>
  );
}
