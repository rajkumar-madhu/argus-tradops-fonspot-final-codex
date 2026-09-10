"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cellText, displayValue, isUntranslated, shortTime, statusTone, summaryColumns } from "@/lib/journal-explore";

type Row = { source_line: number; fields: Record<string, unknown> };

/**
 * The log stream. Rows collapse to a summary line and expand in place to the
 * full masked record — 152 columns for an order event, which is why expansion
 * happens client-side from data already on the page rather than a second fetch.
 */
export default function JournalStream({ rows, columns, msgType }: {
  rows: Row[];
  columns: string[];
  msgType: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const summary = summaryColumns(msgType, columns);

  return (
    <div
      className="jx-stream"
      role="table"
      aria-label="Journal records"
      style={{ ["--jx-cols" as string]: String(summary.length) }}
    >
      <div className="jx-row jx-head" role="row">
        <span className="jx-caret" aria-hidden="true" />
        {summary.map((column) => (
          <span key={column} role="columnheader">{column}</span>
        ))}
      </div>
      {rows.map((row) => {
        const line = row.source_line;
        const expanded = open === line;
        const tone = msgType === "ordupd" ? statusTone(row.fields.OrdStatus) : "";
        return (
          <div key={line} className={`jx-entry${expanded ? " open" : ""}`}>
            <button
              type="button"
              className={`jx-row jx-body${tone ? ` tone-${tone}` : ""}`}
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : line)}
            >
              <span className="jx-caret"><ChevronRight size={13} /></span>
              {summary.map((column) => (
                <span key={column} className={column === "Event Time (UTC)" ? "jx-mono" : undefined}>
                  {renderCell(column, row.fields[column])}
                </span>
              ))}
            </button>
            {expanded && (
              <div className="jx-detail">
                <div className="jx-detail-head">
                  Source line {line} · {columns.length} fields · masked at projection
                </div>
                <dl className="jx-fields">
                  {columns.map((column) => {
                    const value = row.fields[column];
                    if (value === null || value === undefined || value === "") return null;
                    return (
                      <div key={column} className="jx-field">
                        <dt>{column}</dt>
                        <dd>{cellText(value)}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderCell(column: string, value: unknown) {
  const text = cellText(value);
  // The stream spans a single session, so the date is redundant on every row —
  // the scope line and histogram carry it. Time-only keeps the column readable.
  if (column === "Event Time (UTC)") return shortTime(value);
  if (isUntranslated(column, text)) {
    return (
      <span className="jx-code untranslated" title={`${column} ${text} has no documented meaning`}>
        {text}<sup>?</sup>
      </span>
    );
  }
  const shown = displayValue(column, text);
  return shown === text ? text : <span className="jx-code">{shown}</span>;
}
