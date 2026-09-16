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
// The table lives in collegeHighlightChannels.json so prebake-news.mjs reads
// the same bytes (see llwsRegions.json for the same pattern). This module stays
// pure — it takes the table as an argument — so node's test runner can load it
// without a JSON import.

export type CollegeHighlightConfig = {
  titleTokens: string[];
  conferences: Record<string, string>;
  networks: { names: string[]; channel: string }[];
  channelTitleTokens?: Record<string, string[]>;
};

export type FallbackChannel = { channel: string; titleTokens: string[] };

export function buildCollegeFallbackChain(
  config: CollegeHighlightConfig | undefined,
  primaryChannel: string | null | undefined,
  homeConferenceId: string | null | undefined,
  awayConferenceId: string | null | undefined,
  broadcasts: readonly string[] | null | undefined,
): FallbackChannel[] {
  if (!config) return [];
  const channels: string[] = [];
  const add = (channel: string | undefined) => {
    if (!channel || channel === primaryChannel || channels.includes(channel)) return;
    channels.push(channel);
  };
  add(homeConferenceId ? config.conferences[String(homeConferenceId)] : undefined);
  add(awayConferenceId ? config.conferences[String(awayConferenceId)] : undefined);
  for (const name of broadcasts ?? []) {
    add(config.networks.find((n) => n.names.includes(name))?.channel);
  }
  return channels.map((channel) => ({
    channel,
    titleTokens: config.channelTitleTokens?.[channel] ?? config.titleTokens,
  }));
}
