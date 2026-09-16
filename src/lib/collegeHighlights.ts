// College highlight fallbacks (added 2026-09-16).
//
// ESPN College Football is the primary uploader for ncaaf, but it skips many
// games — anything on SEC Network+, BTN, FOX, CBS or the CW. The conference and
// the TV network nearly always post their own per-game cut, so when the primary
// strict resolve misses, the card walks a SHORT chain built for THIS game: the
// home team's conference channel, the away team's, then the channel of the
// network that aired it. Measured 2026-09-16 on the 9/12 FBS slate (see the
// ncaaf note in collegeHighlightChannels.json's commit).
//
// Conference and network channels are NOT football-only — the SEC and ESPN
// channels post basketball between the same schools in the same calendar year.
// "East Tennessee State vs North Carolina" strict on "ESPN" returned an
// "ESPN CBB" basketball cut. So every fallback request carries a title token
// (`comp=` on /api/youtube) the football cut has and the other sports do not.
//
// Volleyball (ncaavb) has NO primary uploader and ESPN's volleyball feed has no
// conferenceId, so its entry sets `primaryFromChain` (the first chain channel
// becomes the official one) and resolves each school's conference through
// `teamConferences` (ESPN team id → football conferenceId; ESPN shares school
// ids across sports). Only the four conferences with a volleyball channel are
// listed. Measured 2026-09-16 on 25 matches from 9/10–9/14: Big Ten Volleyball,
// ACC Digital Network and Big 12 Conference found the right match 7 times with
// `comp=volleyball`, and that token dropped all 4 wrong-sport hits (an SEC
// football cut, two ESPN basketball cuts, a Big Ten Network basketball cut).
// Re-check `teamConferences` after conference realignment.
//
// The table lives in collegeHighlightChannels.json so prebake-news.mjs reads
// the same bytes (see llwsRegions.json for the same pattern). This module stays
// pure — it takes the table as an argument — so node's test runner can load it
// without a JSON import.

export type CollegeHighlightConfig = {
  primaryFromChain?: boolean;
  titleTokens: string[];
  conferences: Record<string, string>;
  teamConferences?: Record<string, string>;
  networks: { names: string[]; channel: string }[];
  channelTitleTokens?: Record<string, string[]>;
};

export type FallbackChannel = { channel: string; titleTokens: string[] };

// The parts of a team the chain needs. `id` may carry the app's sport prefix
// ("ncaavb-158"); only the trailing ESPN id is used.
export type ChainTeam = { id?: string | null; conferenceId?: string | null };

function conferenceKey(config: CollegeHighlightConfig, team: ChainTeam | null | undefined): string | undefined {
  if (team?.conferenceId) return String(team.conferenceId);
  const rawId = team?.id ? String(team.id).split("-").pop() : undefined;
  return rawId ? config.teamConferences?.[rawId] : undefined;
}

export function buildCollegeFallbackChain(
  config: CollegeHighlightConfig | undefined,
  primaryChannel: string | null | undefined,
  home: ChainTeam | null | undefined,
  away: ChainTeam | null | undefined,
  broadcasts: readonly string[] | null | undefined,
): FallbackChannel[] {
  if (!config) return [];
  const homeConferenceId = conferenceKey(config, home);
  const awayConferenceId = conferenceKey(config, away);
  const channels: string[] = [];
  const add = (channel: string | undefined) => {
    if (!channel || channel === primaryChannel || channels.includes(channel)) return;
    channels.push(channel);
  };
  add(homeConferenceId ? config.conferences[homeConferenceId] : undefined);
  add(awayConferenceId ? config.conferences[awayConferenceId] : undefined);
  for (const name of broadcasts ?? []) {
    add(config.networks.find((n) => n.names.includes(name))?.channel);
  }
  return channels.map((channel) => ({
    channel,
    titleTokens: config.channelTitleTokens?.[channel] ?? config.titleTokens,
  }));
}
