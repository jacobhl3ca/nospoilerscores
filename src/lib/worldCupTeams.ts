export type WorldCupTeam = {
  name: string;
  slug: string;
  rank: number | null;
  flag: string;
};

export const WORLD_CUP_TEAMS: WorldCupTeam[] = [
  { name: "Argentina", slug: "argentina", rank: 1, flag: "🇦🇷" },
  { name: "Spain", slug: "spain", rank: 2, flag: "🇪🇸" },
  { name: "France", slug: "france", rank: 3, flag: "🇫🇷" },
  { name: "England", slug: "england", rank: 4, flag: "ENG" },
  { name: "Portugal", slug: "portugal", rank: 5, flag: "🇵🇹" },
  { name: "Brazil", slug: "brazil", rank: 6, flag: "🇧🇷" },
  { name: "Morocco", slug: "morocco", rank: 7, flag: "🇲🇦" },
  { name: "Netherlands", slug: "netherlands", rank: 8, flag: "🇳🇱" },
  { name: "Belgium", slug: "belgium", rank: 9, flag: "🇧🇪" },
  { name: "Germany", slug: "germany", rank: 10, flag: "🇩🇪" },
  { name: "Croatia", slug: "croatia", rank: 11, flag: "🇭🇷" },
  { name: "Colombia", slug: "colombia", rank: 13, flag: "🇨🇴" },
  { name: "Mexico", slug: "mexico", rank: 14, flag: "🇲🇽" },
  { name: "Senegal", slug: "senegal", rank: 15, flag: "🇸🇳" },
  { name: "Uruguay", slug: "uruguay", rank: 16, flag: "🇺🇾" },
  { name: "United States", slug: "united-states", rank: 17, flag: "🇺🇸" },
  { name: "Japan", slug: "japan", rank: 18, flag: "🇯🇵" },
  { name: "Switzerland", slug: "switzerland", rank: 19, flag: "🇨🇭" },
  { name: "Iran", slug: "iran", rank: 20, flag: "🇮🇷" },
  { name: "Turkiye", slug: "turkiye", rank: 22, flag: "🇹🇷" },
  { name: "Ecuador", slug: "ecuador", rank: 23, flag: "🇪🇨" },
  { name: "Austria", slug: "austria", rank: 24, flag: "🇦🇹" },
  { name: "South Korea", slug: "south-korea", rank: 25, flag: "🇰🇷" },
  { name: "Australia", slug: "australia", rank: 27, flag: "🇦🇺" },
  { name: "Algeria", slug: "algeria", rank: 28, flag: "🇩🇿" },
  { name: "Egypt", slug: "egypt", rank: 29, flag: "🇪🇬" },
  { name: "Canada", slug: "canada", rank: 30, flag: "🇨🇦" },
  { name: "Norway", slug: "norway", rank: 31, flag: "🇳🇴" },
  { name: "Ivory Coast", slug: "ivory-coast", rank: 33, flag: "🇨🇮" },
  { name: "Panama", slug: "panama", rank: 34, flag: "🇵🇦" },
  { name: "Sweden", slug: "sweden", rank: 38, flag: "🇸🇪" },
  { name: "Czechia", slug: "czechia", rank: 40, flag: "🇨🇿" },
  { name: "Paraguay", slug: "paraguay", rank: 41, flag: "🇵🇾" },
  { name: "Scotland", slug: "scotland", rank: 42, flag: "SCO" },
  { name: "Tunisia", slug: "tunisia", rank: 45, flag: "🇹🇳" },
  { name: "Congo DR", slug: "congo-dr", rank: 46, flag: "🇨🇩" },
  { name: "Uzbekistan", slug: "uzbekistan", rank: 50, flag: "🇺🇿" },
  { name: "Qatar", slug: "qatar", rank: 56, flag: "🇶🇦" },
  { name: "Iraq", slug: "iraq", rank: 57, flag: "🇮🇶" },
  { name: "South Africa", slug: "south-africa", rank: 60, flag: "🇿🇦" },
  { name: "Saudi Arabia", slug: "saudi-arabia", rank: 61, flag: "🇸🇦" },
  { name: "Jordan", slug: "jordan", rank: 63, flag: "🇯🇴" },
  { name: "Bosnia-Herzegovina", slug: "bosnia-herzegovina", rank: 64, flag: "🇧🇦" },
  { name: "Cape Verde", slug: "cape-verde", rank: 67, flag: "🇨🇻" },
  { name: "Ghana", slug: "ghana", rank: 73, flag: "🇬🇭" },
  { name: "Curacao", slug: "curacao", rank: 82, flag: "🇨🇼" },
  { name: "Haiti", slug: "haiti", rank: 83, flag: "🇭🇹" },
  { name: "New Zealand", slug: "new-zealand", rank: 85, flag: "🇳🇿" },
];

export function getWorldCupTeam(slug: string): WorldCupTeam | undefined {
  return WORLD_CUP_TEAMS.find((team) => team.slug === slug);
}
