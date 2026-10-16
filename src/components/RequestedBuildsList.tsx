import {
  REQUESTED_BUILDS,
  requestedBuildDay,
  requestedBuildSections,
  type RequestedBuild,
} from "@/lib/requestedBuilds";
import { KIND_PILL_CLASS } from "@/lib/requestKinds";

// "Built from your requests" as a table (round 2, 2026-10-11): one section per
// person ("K.K. · 4 built"), then "Asked without a name". Each row is a grid of
// day · kind pill · title with fixed first columns, so every title starts at
// the same x and a long one wraps inside its own column. No borders. Every
// kind pill is one width, centred (`.kind-pill-even`, 10/14).
// The "This was me" link on the unnamed rows came out 10/14: the initials note
// under the list is the one way to claim a row.

export function RequestedBuildRow({ r }: { r: RequestedBuild }) {
  return (
    <li className="grid grid-cols-[4rem_5.5rem_minmax(0,1fr)] items-baseline" data-testid="requested-build-row">
      <time dateTime={r.date} style={{ color: "var(--text-muted)" }}>{requestedBuildDay(r.date)}</time>
      <span>
        <span className={`${KIND_PILL_CLASS} kind-pill-even`} data-kind={r.kind}><span>{r.kind}</span></span>
      </span>
      <span data-testid="requested-build-title">{r.title}</span>
    </li>
  );
}

export default function RequestedBuildsList({ rows = REQUESTED_BUILDS }: { rows?: RequestedBuild[] }) {
  return (
    <div className="space-y-5" data-testid="requested-builds">
      {requestedBuildSections(rows).map((s) => (
        <section key={s.who || "none"}>
          <h3 className="text-sm font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
            {s.who ? `${s.who} · ${s.rows.length} built` : "Asked without a name"}
          </h3>
          <ul className="space-y-1.5">
            {s.rows.map((r) => (
              <RequestedBuildRow key={`${r.date}|${r.title}`} r={r} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
