"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { playTune, typingTarget } from "@/app/ui/gurdy-voice";

const FOLLOW_X = 118;
const FOLLOW_Y = 36;
const PARK_PAD_X = 248;
const PARK_PAD_Y = 168;
const COOLDOWN_MS = 450;
const NOTE_SRCS = ["/gurdy-note-1.png", "/gurdy-note-2.png", "/gurdy-note-3.png"];
const NOTE_COUNT = 6;
const MOUTH_X = 188;
const MOUTH_Y = 36;
const SPRITE_W = 236;
/** Sliver left on screen when hiding, so there is something to click. */
const PEEK = 96;
const CORNER_TOP = 14;
const CORNER_BOTTOM = 150;
const IDLE_MS = 10000;
const NAP_KEY = "gurdy-nap";
const ZZZ = [
  { size: 16, delay: "0ms", dur: "2600ms" },
  { size: 22, delay: "760ms", dur: "2900ms" },
  { size: 29, delay: "1500ms", dur: "3200ms" },
];

type Spot = { x: number; y: number; face: number };

type FlyingNote = {
  id: number;
  src: string;
  dx: string;
  dy: string;
  spin: string;
  delay: string;
  dur: string;
  size: string;
};

function burst(): FlyingNote[] {
  return Array.from({ length: NOTE_COUNT }, (_, i) => ({
    id: Date.now() + i,
    src: NOTE_SRCS[i % NOTE_SRCS.length] ?? NOTE_SRCS[0],
    dx: `${56 + Math.random() * 90}px`,
    dy: `${-28 - Math.random() * 86}px`,
    spin: `${-50 + Math.random() * 100}deg`,
    delay: `${i * 55}ms`,
    dur: `${820 + Math.random() * 420}ms`,
    size: `${28 + Math.random() * 18}px`,
  }));
}

type Nap = { corner: number };

function loadNap(): Nap | null {
  try {
    const raw = localStorage.getItem(NAP_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { corner?: unknown };
    if (typeof parsed.corner !== "number" || !Number.isFinite(parsed.corner)) {
      return null;
    }
    const corner = Math.floor(parsed.corner);
    if (corner < 0 || corner > 3) {
      return null;
    }
    return { corner };
  } catch {
    return null;
  }
}

function saveNap(corner: number) {
  try {
    localStorage.setItem(NAP_KEY, JSON.stringify({ corner }));
  } catch {
    return;
  }
}

function clearNap() {
  try {
    localStorage.removeItem(NAP_KEY);
  } catch {
    return;
  }
}

/** Tucked mostly off the edge, turned so the carved face still peeks in. */
function cornerSpot(i: number): Spot {
  const right = i % 2 === 1;
  return {
    x: right ? window.innerWidth - PEEK : PEEK - SPRITE_W,
    y: i > 1 ? window.innerHeight - CORNER_BOTTOM : CORNER_TOP,
    face: right ? -1 : 1,
  };
}

/**
 * Decorative mascot. Not a status. Does not mean verified, allowed, or safe.
 */
export function GurdyBuddy() {
  const [pos, setPos] = useState({ x: -280, y: -200 });
  const [face, setFace] = useState(1);
  const [tilt, setTilt] = useState(0);
  const [notes, setNotes] = useState<FlyingNote[]>([]);
  const [blink, setBlink] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [asleep, setAsleep] = useState(false);
  const dozing = useRef(false);
  const target = useRef({ x: 0, y: 0 });
  const waiting = useRef(true);
  const current = useRef({ x: 0, y: 0 });
  const last = useRef({ x: 0, y: 0 });
  const facing = useRef(1);
  const lastPoke = useRef(0);
  const noteTimer = useRef<number>(0);
  const hiding = useRef(false);
  const corner = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const park = () => {
      const next = {
        x: window.innerWidth - PARK_PAD_X,
        y: window.innerHeight - PARK_PAD_Y,
      };
      target.current = next;
      current.current = next;
      setPos(next);
      setTilt(0);
    };
    const nap = loadNap();
    if (nap) {
      corner.current = nap.corner;
      hiding.current = true;
      dozing.current = true;
      const spot = cornerSpot(nap.corner);
      target.current = { x: spot.x, y: spot.y };
      current.current = { x: spot.x, y: spot.y };
      last.current = { x: spot.x, y: spot.y };
      facing.current = spot.face;
      setPos({ x: spot.x, y: spot.y });
      setFace(spot.face);
      setTilt(0);
      setHidden(true);
      setAsleep(true);
    }
    if (reduce.matches || coarse.matches) {
      if (!nap) {
        park();
      }
      return;
    }
    const onMove = (e: PointerEvent) => {
      target.current = { x: e.clientX - FOLLOW_X, y: e.clientY + FOLLOW_Y };
    };
    window.addEventListener("pointermove", onMove);
    let frame = 0;
    const tick = () => {
      const spot = hiding.current ? cornerSpot(corner.current) : null;
      const goal = spot ?? (dozing.current ? current.current : target.current);
      const dx = goal.x - current.current.x;
      const dy = goal.y - current.current.y;
      current.current.x += dx * 0.12;
      current.current.y += dy * 0.12;
      const my = current.current.y - last.current.y;
      last.current = { ...current.current };
      if (spot) {
        facing.current = spot.face;
      } else if (dx < -8) {
        facing.current = -1;
      } else if (dx > 8) {
        facing.current = 1;
      }
      setPos({ x: current.current.x, y: current.current.y });
      setFace(facing.current);
      setTilt(spot ? 0 : Math.max(-9, Math.min(9, my * 2.2)));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    waiting.current = notes.length === 0;
  }, [notes]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    let alive = true;
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      timers.push(id);
      return id;
    };
    const shut = () => {
      if (!alive) {
        return;
      }
      setBlink(false);
    };
    const wink = () => {
      if (!alive || !waiting.current || dozing.current) {
        return;
      }
      setBlink(true);
      later(shut, 140);
    };
    const loop = () => {
      if (!alive) {
        return;
      }
      later(() => {
        wink();
        if (waiting.current && Math.random() < 0.25) {
          later(wink, 260);
        }
        loop();
      }, (reduce ? 5000 : 2200) + Math.random() * (reduce ? 5000 : 4000));
    };
    loop();
    return () => {
      alive = false;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    const nap = loadNap();
    if (nap) {
      corner.current = nap.corner;
      hiding.current = true;
      dozing.current = true;
      setHidden(true);
      setAsleep(true);
    }
    let idle = 0;
    const fallAsleep = () => {
      dozing.current = true;
      setAsleep(true);
    };
    const wake = () => {
      if (hiding.current) {
        return;
      }
      dozing.current = false;
      setAsleep(false);
    };
    const nudge = () => {
      if (hiding.current) {
        return;
      }
      wake();
      window.clearTimeout(idle);
      idle = window.setTimeout(fallAsleep, IDLE_MS);
    };
    if (!hiding.current) {
      nudge();
    }
    window.addEventListener("pointermove", nudge);
    window.addEventListener("pointerdown", nudge);
    window.addEventListener("keydown", nudge);
    return () => {
      window.clearTimeout(idle);
      window.removeEventListener("pointermove", nudge);
      window.removeEventListener("pointerdown", nudge);
      window.removeEventListener("keydown", nudge);
    };
  }, []);

  useEffect(() => {
    const poke = () => {
      if (hiding.current) {
        return;
      }
      setNotes(burst());
      window.clearTimeout(noteTimer.current);
      noteTimer.current = window.setTimeout(() => setNotes([]), 1600);
      void playTune();
    };
    const tuckIn = () => {
      hiding.current = true;
      dozing.current = true;
      saveNap(corner.current);
      setHidden(true);
      setAsleep(true);
    };
    const comeOut = () => {
      hiding.current = false;
      dozing.current = false;
      clearNap();
      setHidden(false);
      setAsleep(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || typingTarget(e.target)) {
        return;
      }
      if (e.code !== "Space" && e.key.toLowerCase() !== "s") {
        return;
      }
      const now = Date.now();
      if (now - lastPoke.current < COOLDOWN_MS) {
        return;
      }
      lastPoke.current = now;
      e.preventDefault();
      if (e.code !== "Space") {
        if (hiding.current) {
          comeOut();
        } else {
          corner.current = Math.floor(Math.random() * 4);
          tuckIn();
        }
        return;
      }
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(noteTimer.current);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="gurdy-buddy pointer-events-none fixed z-30"
      style={{ left: pos.x, top: pos.y }}
    >
      {asleep
        ? ZZZ.map((z) => (
            <img
              key={z.size}
              className="gurdy-zzz"
              src="/gurdy-zzz.png"
              alt=""
              draggable={false}
              style={
                {
                  left: face === 1 ? 196 : 26,
                  "--z-size": `${z.size}px`,
                  "--z-delay": z.delay,
                  "--z-dur": z.dur,
                } as CSSProperties
              }
            />
          ))
        : null}
      <div
        onClick={
          hidden
            ? () => {
                hiding.current = false;
                dozing.current = false;
                clearNap();
                setHidden(false);
                setAsleep(false);
              }
            : undefined
        }
        className={hidden ? "pointer-events-auto cursor-pointer" : undefined}
        style={{
          position: "relative",
          transform: `scaleX(${face}) rotate(${tilt}deg)`,
          transformOrigin: "center",
        }}
      >
        <div
          className={`gurdy-instrument-stack${asleep ? " gurdy-dozing" : ""}`}
          style={{ filter: "drop-shadow(6px 16px 16px rgba(20, 20, 20, 0.28))" }}
        >
          <img
            className="gurdy-instrument"
            src="/gurdy-buddy.png"
            alt=""
            width={236}
            height={129}
            draggable={false}
            style={{ opacity: !asleep && !blink ? 1 : 0 }}
          />
          <img
            className="gurdy-instrument gurdy-instrument-overlay"
            src="/gurdy-buddy-blink.png"
            alt=""
            width={236}
            height={129}
            draggable={false}
            style={{ opacity: !asleep && blink ? 1 : 0 }}
          />
          <img
            className="gurdy-instrument gurdy-instrument-overlay"
            src="/gurdy-buddy-sleep.png"
            alt=""
            width={236}
            height={129}
            draggable={false}
            style={{ opacity: asleep ? 1 : 0 }}
          />
        </div>
        {notes.map((n) => (
          <img
            key={n.id}
            className="gurdy-note"
            src={n.src}
            alt=""
            draggable={false}
            style={
              {
                "--mouth-x": `${MOUTH_X}px`,
                "--mouth-y": `${MOUTH_Y}px`,
                "--dx": n.dx,
                "--dy": n.dy,
                "--spin": n.spin,
                "--note-delay": n.delay,
                "--note-dur": n.dur,
                "--note-size": n.size,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
