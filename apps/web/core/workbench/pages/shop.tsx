/**
 * The shop, after Rust's vending machine: FOR SALE | COST | BUY rows. Everything is
 * cosmetic (notice frames, titles, and main-menu banners shown as grids of pictures and of
 * video loops, which play on hover) except
 * upkeep, which is paid from a Blueprint's Tool Cupboard. Scrap is earned by crafting Items.
 * Titles show their plate; earned titles unlock from the crafting record, with progress.
 */
import { useEffect, useRef, useState } from "react";
import { mutate } from "swr";
import { cn } from "@plane/utils";
import type { TOffer, TTitle } from "../lib/api";
import { useWbShop, wb } from "../lib/api";
import { play } from "../sound/engine";
import { pushNotice } from "../components/notices";
import { RustItem } from "../components/rust-icon";
import { PlateFace } from "../components/title-plate";
import { bannerSlug, isVideo, sceneThumb, videoUrl } from "../lib/scenes";
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

/** A banner card's picture. A video banner previews its loop after a short hover (a tap on
 * touch screens); the video is only loaded while it previews and is dropped afterwards. */
function CardArt({ slug, name }: { slug: string; name: string }) {
  const [on, setOn] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const img = <img src={sceneThumb(slug)} alt="" loading="lazy" decoding="async" />;
  if (!isVideo(slug)) return img;
  const leave = () => {
    window.clearTimeout(timer.current);
    setOn(false);
  };
  return (
    <button
      type="button"
      className="wb-shop__art"
      aria-label={`Preview ${name}`}
      aria-pressed={on}
      data-wb-silent
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") timer.current = window.setTimeout(() => setOn(true), 250);
      }}
      onPointerLeave={(e) => e.pointerType === "mouse" && leave()}
      // a tap (no hover) or Enter/Space (detail 0) toggles the preview
      onClick={(e) => (e.detail === 0 || !matchMedia("(hover: hover)").matches) && setOn((x) => !x)}
    >
      {img}
      {on && (
        <video
          src={videoUrl(slug)}
          muted
          loop
          playsInline
          autoPlay
          aria-hidden
          onPlaying={(e) => e.currentTarget.classList.add("is-on")}
        />
      )}
      <i className="wb-shop__live">Video</i>
    </button>
  );
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
  const videos = banners.filter((o) => isVideo(bannerSlug(o.id)));
  const pictures = banners.filter((o) => !isVideo(bannerSlug(o.id)));
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

  const bannerGrid = (title: string, list: TOffer[]) => (
    <>
      <div className="wb-shop__head wb-shop__head--banners">
        <span>{title}</span>
        <span>
          {list.filter((o) => o.owned).length} / {list.length} owned
        </span>
      </div>
      <div className="wb-shop__banners">
        {list.map((o) => (
          <div
            key={o.id}
            className={cn("wb-shop__card", o.owned && "wb-shop__card--owned", isOn(o) && "wb-shop__card--on")}
          >
            <CardArt slug={bannerSlug(o.id)} name={o.name.replace("Banner: ", "")} />
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
    </>
  );

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

        {bannerGrid("Main-menu banners", pictures)}
        {bannerGrid("Video banners", videos)}
        <p className="wb-muted">
          Earn scrap by crafting Items: Twig 5 · Wood 10 · Stone 15 · Sheet Metal 25 · Armored 40 · components 5. Upkeep
          (50 scrap = 2 days) is paid from a Blueprint&apos;s Tool Cupboard.
        </p>
      </div>
    </WbPage>
  );
}
