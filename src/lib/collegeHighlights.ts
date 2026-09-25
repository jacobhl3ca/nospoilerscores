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
// Women's hockey (ncaawh, lit 2026-09-23) works the same way. ESPN's hockey
// feeds carry no conferenceId and have no groups endpoint, so its conference
// keys are names ("ecac"), and `teamConferences` was built by hand from each
// conference's member list. Channels probed 2026-09-23 on the 9/18-9/20
// opening weekend (oEmbed, title shape, live worker with strict=1):
//   ECAC Hockey (@ECACHockeyLeague): LIT. One cut per game, titled "RPI at
//     Mercyhurst | NCAA Women's Ice Hockey | Highlights - September 18, 2026 |
//     #ECACHockey". No score (spoiler judge: clean), oEmbed 200. 3/3 strict
//     with `comp=women`. The channel also posts the men's cuts ("NCAA Men's
//     Ice Hockey"); `women` refused one and `ncaa men` refused a women's cut.
//     ESPN names RPI "Rensselaer": 0/2 under that name, so TEAM_NAME_ALIASES
//     in youtube.ts queries "RPI".
//   Atlantic Hockey America: NOT lit. Every title prints the final score
//     ("Mercyhurst 3, RPI 0 - Sept. 19, 2026"; spoiler judge: SPOILER).
//   Hockey East: no per-game cut since ~2016 (weekly plays, podcast clips).
//   WCHA: no 2026-27 game posted yet (first game 9/25). Its old per-game
//     format printed the score, so the title mask must cover it before it is
//     lit. Re-probe once it posts.
//   NEWHA: channel inactive since 2021. Big Ten Network: no hockey cuts.
// A game with no ECAC school has an empty chain and stays dark.
//
// Men's hockey (ncaah) stays dark. Probed 2026-09-23 on 2025-26 games:
// ECAC Hockey 5/6 with `comp=ncaa men` (the miss is the RPI name, now
// aliased), NCHCHockey 5/6 with no token (the miss: "Miami (OH)"), CCHA
// Hockey 1/3, 0 wrong matches, no scores. The evidence is good, but the
// chain-primary slot takes ONE token list per sport (COMPETITION_TITLE_TOKENS)
// and these two channels need different ones: ECAC mixes men's and women's
// cuts and needs "ncaa men" ("men" alone is inside "women s"), and NCHC
// titles carry no gender word. To light it after the 10/2 opener: give the
// chain-primary slot its own channel's titleTokens in GameHighlights and in
// the bake's item builder, add the ncaah block (ECAC + NCHC), re-probe CCHA
// (1/3 is too low), and dry-run the first weekend.
//
// Soccer uses the same chain (added 2026-09-25) for the two leagues whose main
// uploader skips games FotMob could still fill:
//   efl: CBS Sports Golazo - Europe and CBS Sports Golazo cut most EFL
//     Championship games for the US ("Cardiff City vs. Charlton Athletic:
//     Extended Highlights | EFL Championship | CBS Sports"), clean titles, so
//     they go first for every game (`always`), gated on "efl championship".
//     Then the home club's own channel, then the away club's (`teamConferences`
//     maps each ESPN team id to its club). Club titles print the result
//     ("Birmingham 2 Boro 2"), so every club channel is in `maskTitle`.
//   ligamx: LIGA BBVA MX, the league's own channel, behind TUDN USA. Its
//     titles print the result too ("JUÁREZ 2-0 TIGRES J9 AP26").
// Both set `searchOnly`: their channels are found only by the bake's
// channel-scoped search (scripts/lib/channel-search.mjs), which drops women's
// and youth fixtures a club channel posts under the same two names. The card
// never walks them live — it trusts a baked id from them, nothing more.
//
// The table lives in collegeHighlightChannels.json so prebake-news.mjs reads
// the same bytes (see llwsRegions.json for the same pattern). This module stays
// pure — it takes the table as an argument — so node's test runner can load it
// without a JSON import.

export type CollegeHighlightConfig = {
  primaryFromChain?: boolean;
  titleTokens: string[];
  // Channels tried for EVERY game, before the conference/club channels.
  always?: string[];
  conferences: Record<string, string>;
  teamConferences?: Record<string, string>;
  networks: { names: string[]; channel: string }[];
  channelTitleTokens?: Record<string, string[]>;
  // Bake-only chain: see the soccer note above.
  searchOnly?: boolean;
  // Channels whose titles print the result: the modal keeps the title covered.
  maskTitle?: string[];
};

export type FallbackChannel = { channel: string; titleTokens: string[]; searchOnly?: boolean };

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
  for (const channel of config.always ?? []) add(channel);
  add(homeConferenceId ? config.conferences[homeConferenceId] : undefined);
  add(awayConferenceId ? config.conferences[awayConferenceId] : undefined);
  for (const name of broadcasts ?? []) {
    add(config.networks.find((n) => n.names.includes(name))?.channel);
  }
  return channels.map((channel) => ({
    channel,
    titleTokens: config.channelTitleTokens?.[channel] ?? config.titleTokens,
    ...(config.searchOnly ? { searchOnly: true } : {}),
  }));
}

// Every channel any chain lists as printing the result in its titles.
export function titleMaskedChainChannels(configs: Record<string, CollegeHighlightConfig>): Set<string> {
  return new Set(Object.values(configs).flatMap((c) => c.maskTitle ?? []));
}
