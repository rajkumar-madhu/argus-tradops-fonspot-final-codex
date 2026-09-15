"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, Clock3, CornerDownLeft, FileSearch, Hash, Search } from "lucide-react";
import { paletteCommands, pushRecent, type PaletteCommand, type PaletteRoute } from "@/lib/command-palette";

const RECENT_KEY = "argus-palette-recent";

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((h) => typeof h === "string") : [];
  } catch {
    return [];
  }
}

const KIND_ICON = { route: ArrowRight, recent: Clock3, order: Hash, search: FileSearch } as const;

/**
 * Ctrl+K palette: jump to a page, trace an order number or search the journal.
 * Navigation only — it never runs an action against a trading system, and it
 * lists only routes the token's roles can open (the API remains the authority).
 */
export default function CommandPalette({ open, onClose, routes, visible }: {
  open: boolean;
  onClose: () => void;
  routes: PaletteRoute[];
  visible: (href: string) => boolean;
}) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    setRecent(readRecent());
    // Focus after the dialog mounts.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const commands = useMemo(
    () => paletteCommands({ query, routes, visible, recent }),
    [query, routes, visible, recent],
  );
  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  if (!open) return null;

  function run(cmd: PaletteCommand | undefined) {
    if (!cmd) return;
    const next = pushRecent(recent, cmd.href);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
    onClose();
    router.push(cmd.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(i + 1, commands.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (event.key === "Enter") { event.preventDefault(); run(commands[active]); }
    else if (event.key === "Escape") { event.preventDefault(); onClose(); }
    else if (event.key === "Tab") event.preventDefault(); // focus stays in the dialog
  }

  return (
    <div className="palette-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page, trace an order number, search the journal…"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={commands.length ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" id={listId} role="listbox" aria-label="Commands">
          {commands.map((cmd, i) => {
            const Icon = KIND_ICON[cmd.kind];
            return (
              <li
                key={cmd.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : undefined}
                onMouseMove={() => setActive(i)}
                onClick={() => run(cmd)}
              >
                <Icon size={15} aria-hidden="true" />
                <span className="palette-label">{cmd.label}</span>
                <span className="palette-hint">{cmd.hint}</span>
              </li>
            );
          })}
          {!commands.length && <li className="palette-empty" role="presentation">No page or command matches, and your role cannot search the journal.</li>}
        </ul>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd><CornerDownLeft size={10} /></kbd> open</span>
          <span>Order numbers open RCA · read-only</span>
        </div>
      </div>
    </div>
  );
}
