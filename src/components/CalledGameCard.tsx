"use client";

import type { CalledGame, Team } from "@/lib/types";
import { nextGameText } from "@/lib/calledGames";
import { shortenPlayoffLabel } from "@/lib/playoffSubtitle";
import { pairingRoundLabel, usePairingHidden } from "@/lib/pairingMask";
import { TeamLogo } from "@/components/TeamLogo";

// A postponed / canceled / suspended game (lib/calledGames.ts), shown at the
// top of its column so a rained-out day explains itself (Jacob 10/17: on Fri
// Oct 16 the ALCS rainout left Dad an MLB column with no reason). Laid out like
// CompactUpcomingCard. Not tappable: no rating, no score, no highlights, no
// modal — there is no game behind it.

const KIND_WORD: Record<CalledGame["kind"], string> = {
  postponed: "POSTPONED",
  canceled: "CANCELED",
  suspended: "SUSPENDED",
};

function TeamMark({ team }: { team: Team }) {
  return (
    <span className="flex items-center gap-1 min-w-0">
      {team.logo ? (
        <TeamLogo src={team.logo} alt="" title={team.displayName} loading="lazy" decoding="async" width={16} height={16} className="w-4 h-4 object-contain shrink-0" />
      ) : null}
      <span className="text-xs sm:text-sm truncate" style={{ color: "var(--text)" }} title={team.displayName}>
        {team.abbreviation || team.shortDisplayName}
      </span>
    </span>
  );
}

export default function CalledGameCard({ game }: { game: CalledGame }) {
  // A called LCS game names both teams, and so who won the round before: it
  // keeps the same "Show teams" cover as the game cards (lib/pairingMask.ts).
  const pairing = { ...game, playoffLabel: game.label };
  const { hidden, reveal } = usePairingHidden(pairing);
  const status = [KIND_WORD[game.kind], game.reason].filter(Boolean).join(" · ");
  const label = game.label ? shortenPlayoffLabel(game.label) : null;
  const away = game.awayTeam.displayName || game.awayTeam.abbreviation;
  const home = game.homeTeam.displayName || game.homeTeam.abbreviation;
  const next = nextGameText(game);
  const spokenStatus = [game.kind, game.reason].filter(Boolean).join(", ");
  if (hidden) {
    const round = pairingRoundLabel(pairing);
    return (
      <div
        data-called-game={game.kind}
        data-pairing-mask={game.id}
        role="group"
        aria-label={`${round}: ${spokenStatus}. ${next}`}
        className="flex flex-col gap-1 rounded-md px-2 sm:px-4 py-1.5 overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <span className="text-sm font-medium truncate min-w-0" style={{ color: "var(--text)" }}>{round}</span>
        <div className="flex items-center">
          <span data-called-status className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}>
            {status}
          </span>
        </div>
        <div data-called-next className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{next}</div>
        <button
          type="button"
          onClick={reveal}
          className="w-full text-xs rounded px-2 py-1 cursor-pointer transition-colors whitespace-nowrap"
          style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
          aria-label={`Show teams for the ${round} (reveals who advanced)`}
          title="The teams in this game show who won the round before"
        >
          Show teams
        </button>
      </div>
    );
  }
  return (
    <div
      data-called-game={game.kind}
      role="group"
      aria-label={`${away} at ${home}: ${spokenStatus}. ${next}`}
      className="flex flex-col gap-1 rounded-md px-2 sm:px-4 py-1.5 overflow-hidden transition-colors"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <TeamMark team={game.awayTeam} />
        <span className="shrink-0 text-xs sm:text-sm" style={{ color: "var(--text-muted)" }}>@</span>
        <TeamMark team={game.homeTeam} />
        {label ? (
          <span data-called-label className="ml-auto min-w-0 truncate text-[11px]" style={{ color: "var(--text-muted)" }} title={label}>{label}</span>
        ) : null}
      </div>
      <div className="flex items-center">
        <span
          data-called-status
          className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
          style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          {status}
        </span>
      </div>
      <div data-called-next className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{next}</div>
    </div>
  );
}
