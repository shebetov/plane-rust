/**
 * The survival guide: what Workbench adds on top of Plane and how to play it well.
 * Short lines, simple words, Rust flavour. Keep it in step with every Workbench feature
 * (see AGENTS.md): when a mechanic or screen changes, change its section here.
 */
import { cn } from "@plane/utils";
import { RustItem } from "../components/rust-icon";
import { Panel, WbPage } from "./shell";

type Row = [icon: string, term: string, text: string];

const WORLD: Row[] = [
  ["workbench2", "Game Server", "Your whole world. Every base lives here."],
  ["blueprintbase", "Blueprint", "A big goal. Craft all its Items to learn it."],
  ["box.wooden.large", "Kit", "One step of a Blueprint. A crate of Items."],
  ["gears", "Item", "One task. Craft it to finish it."],
  ["metal.fragments", "Component", "A small part of an Item."],
  ["flare", "Wipe", "A two-week round. The clock everyone lives by."],
  ["scrap", "Scrap", "Your pay for crafting."],
  ["box.wooden", "Stash", "Loose ideas, not Items yet."],
  ["parachute", "Airdrop", "Items dropped in from outside."],
  ["note", "Notes", "Pages to write things down."],
];

const LIFE: Array<[name: string, cls: string, text: string]> = [
  ["Locked", "locked", "Not yet. Waits in the dark."],
  ["To Craft", "todo", "Ready to pick up."],
  ["Crafting", "crafting", "On your bench now."],
  ["Crafted", "crafted", "Done. Pays scrap."],
  ["Scrapped", "scrapped", "Dropped. Pays nothing."],
];

const GRADES: Array<[icon: string, name: string, scrap: number, when: string]> = [
  ["building.planner", "Twig", 5, "No rush"],
  ["wood", "Wood", 10, "Low"],
  ["stones", "Stone", 15, "Normal"],
  ["metal.fragments", "Sheet Metal", 25, "High"],
  ["metal.refined", "Armored", 40, "On fire"],
];

const LOOP: Array<[icon: string, text: string]> = [
  ["gears", "Craft Items"],
  ["scrap", "Earn scrap"],
  ["cupboard.tool", "Keep bases protected"],
  ["flare", "Wipe day: unfinished Items roll over"],
];

const SCREENS: Row[] = [
  ["workbench2", "Home", "Quick join, news, wipe clock, CRAFT NEXT."],
  ["blueprintbase", "Blueprints", "Every base and its cupboard state."],
  ["research.table", "Research tree", "Open a Blueprint to see its tree."],
  ["flare", "Wipe", "This wipe and the last one."],
  ["vending.machine", "Shop", "Spend scrap on looks."],
];

const TIPS = [
  "Start the day on Home. Hit CRAFT NEXT.",
  "Keep 1 to 3 Items Crafting. A full bench is a slow bench.",
  "Big Item? Split it into Components.",
  "Grade it honestly. Not everything is Armored.",
  "Link what needs what. The tree then shows what is READY.",
  "Craft in every live Blueprint once a week. Keep the cupboards up.",
  "Won't do it? Scrap it. Dead weight only rots.",
  "Wipe day: read the report. Pick the next targets.",
  "Spend your scrap. You earned it.",
];

function Lines({ items }: { items: string[] }) {
  return (
    <ul className="wb-guide__lines">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <ul className="wb-guide__rows">
      {rows.map(([icon, term, text]) => (
        <li key={term}>
          <RustItem item={icon} size={30} />
          <b>{term}</b>
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

function Title({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span className="wb-guide__title">
      <RustItem item={icon} size={20} />
      {children}
    </span>
  );
}

export function Guide() {
  return (
    <WbPage active="guide" title="Guide">
      <div className="wb-guide">
        <header className="wb-guide__hero">
          <small>Survival guide</small>
          <h1>How to survive on this server</h1>
          <p>Short notes for fresh spawns. Read once. Craft forever.</p>
        </header>

        <div className="wb-guide__grid">
          <Panel title={<Title icon="map">The world</Title>} className="wb-guide__wide">
            <Rows rows={WORLD} />
          </Panel>

          <Panel title={<Title icon="research.table">The loop</Title>} className="wb-guide__wide">
            <ol className="wb-guide__loop">
              {LOOP.map(([icon, text]) => (
                <li key={text}>
                  <RustItem item={icon} size={40} />
                  <span>{text}</span>
                </li>
              ))}
            </ol>
            <p className="wb-guide__note">Repeat every wipe. Bases you craft in stay alive. Bases you leave rust.</p>
          </Panel>

          <Panel title={<Title icon="gears">Item life</Title>}>
            <ul className="wb-guide__life">
              {LIFE.map(([name, cls, text]) => (
                <li key={name}>
                  <i className={cn("wb-guide__state", `wb-guide__state--${cls}`)}>{name}</i>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title={<Title icon="stones">Building grades</Title>}>
            <p className="wb-guide__note">Priority is the grade. Higher grade, more scrap.</p>
            <ul className="wb-guide__grades">
              {GRADES.map(([icon, name, scrap, when]) => (
                <li key={name}>
                  <RustItem item={icon} size={28} />
                  <b>{name}</b>
                  <span>{when}</span>
                  <em>
                    <RustItem item="scrap" size={16} />
                    {scrap}
                  </em>
                </li>
              ))}
            </ul>
            <p className="wb-guide__note">A Component pays 5. Scrapped pays 0.</p>
          </Panel>

          <Panel title={<Title icon="flare">Wipes</Title>}>
            <Lines
              items={[
                "A wipe lasts two weeks. A new one starts every second Thursday.",
                "Every live Blueprint gets its own Wipe #N.",
                "Wipe day: unfinished Items roll into the next wipe. Nothing is lost.",
                "The top bar counts down: WIPE IN 3D 4H.",
                "After a wipe, the report opens once: crafted, scrapped, rolled over, scrap earned.",
                "Bases you ignored show in red. Hit START WIPE and go.",
              ]}
            />
          </Panel>

          <Panel title={<Title icon="scrap">Scrap</Title>}>
            <Lines
              items={[
                "Every crafted Item pays scrap, by grade.",
                "Your scrap stays banked, even when old Items go to Storage.",
                "Re-open a crafted Item and its scrap goes back.",
                "Spend it in the Shop or on Tool Cupboard upkeep.",
                "Your balance sits in the top bar.",
              ]}
            />
          </Panel>

          <Panel title={<Title icon="cupboard.tool">Tool Cupboard</Title>}>
            <Lines
              items={[
                "Every Blueprint has one.",
                "Craft anything in it: protected for 7 days.",
                "Last day: UPKEEP DUE.",
                "Time out: DECAYING. The base starts to rust.",
                "No time to craft? Pay upkeep: 50 scrap buys 2 days.",
                "All Items crafted: LEARNED. No upkeep needed.",
              ]}
            />
            <p className="wb-guide__note">Find it under the goal, at the foot of the research tree.</p>
          </Panel>

          <Panel title={<Title icon="bandage">Decay</Title>}>
            <Lines
              items={[
                "An Item left in Crafting rusts.",
                "14 days idle: rust. 30 days: worse. 60 days: almost gone.",
                "Watch its health bar in the craft queue and the tree.",
                "Fix it: craft it, put it back, or scrap it.",
              ]}
            />
          </Panel>

          <Panel title={<Title icon="research.table">Research tree</Title>}>
            <Lines
              items={[
                "Open a Blueprint to see its tree. Switch Blueprints from the list beside it.",
                "The goal sits at the bottom. Kits stand on it. Items stand on their Kit.",
                "Follow the wires down. Each one leads to what it unlocks.",
                "Items with no links wait in a crate above their Kit.",
                "Bright frame: ready. Padlock: needs another Item first. Tick: crafted.",
                "The breathing corner frame marks your next craft.",
                "Drag the handle under a tile onto the Item it unlocks.",
                "Crafted Items hide. Turn on SHOW CRAFTED to see them.",
              ]}
            />
          </Panel>

          <Panel title={<Title icon="supply.signal">On every screen</Title>}>
            <Lines
              items={[
                "Sidebar: Home, Blueprints, Wipe, Shop, Guide. Then your Blueprints.",
                "Top bar: wipe clock, cupboard alarm, scrap.",
                "Craft queue, bottom right: your Crafting Items. Tap one to open it.",
                "Notices: ITEM CRAFTED, KIT COMPLETE, BLUEPRINT LEARNED, SCRAPPED.",
                "Back after a break? You see what got crafted while you were away.",
                "Sound is on, music is off. Switch both in the top bar.",
              ]}
            />
          </Panel>

          <Panel title={<Title icon="vending.machine">Shop</Title>}>
            <Lines
              items={[
                "Looks only. No pay-to-win.",
                "Banners for Home, notice frames, titles.",
                "Buy once. Equip or take off any time.",
              ]}
            />
          </Panel>

          <Panel title={<Title icon="map">Where to go</Title>}>
            <Rows rows={SCREENS} />
          </Panel>

          <Panel title={<Title icon="largemedkit">Survival tips</Title>} className="wb-guide__wide wb-guide__tips">
            <ol className="wb-guide__tiplist">
              {TIPS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </WbPage>
  );
}
