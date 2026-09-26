// Logos for teams ESPN files with NO artwork: no `logo` on the event, and
// its CDN path 404s. Keyed by our team id (`${sport}-${espnId}`); the newer
// ESPN ids are sport-specific (133847 is Missouri S&T in volleyball and an
// amateur club in the Copa del Rey).
//
// Nearly all are D2 / D3 schools ESPN lists only as a one-off opponent on a
// D1 schedule. NCAA.com draws every member school's logo at a stable slug
// path, so those entries are slugs. Each logo was checked by eye against the
// team name on 2026-09-26.
//
// Found and kept current by scripts/audit-team-logos.mjs, which prints the
// line to add for any new gap. Re-run it when a college season opens: most
// basketball entries below are November non-conference games. Teams with no
// source anywhere (NAIA schools, amateur cup clubs) are left out on purpose;
// GameCard shows their initials.

export const ncaaComLogo = (slug: string) =>
  `https://www.ncaa.com/sites/default/files/images/logos/schools/bgl/${slug}.svg`;
const ncaa = ncaaComLogo;

export const LOGO_OVERRIDES: Readonly<Record<string, string>> = {
  // Saudi Pro League: promoted for 2026-27, ESPN has no crest. FotMob's id.
  "saudi-21446": "https://images.fotmob.com/image_resources/logo/teamlogo/205687.png", // Al Faisaly

  // Men's hockey
  "ncaah-132633": ncaa("maryville-mo"), // Maryville (Mo) Saints

  // Women's volleyball
  "ncaavb-2133": ncaa("claflin"), // Claflin Panthers
  "ncaavb-2215": ncaa("erskine"), // Erskine Flying Fleet
  "ncaavb-133630": ncaa("fla-southern"), // Florida Southern Mocs
  "ncaavb-133918": ncaa("fort-valley-st"), // Fort Valley State Wildcats
  "ncaavb-131233": ncaa("miles"), // Miles Golden Bears
  "ncaavb-133847": ncaa("missouri-snt"), // Missouri S&T Miners
  "ncaavb-133921": ncaa("rutgers-camden"), // Rutgers-Camden Scarlet Raptors
  "ncaavb-133629": ncaa("southwest-minn-st"), // Southwest Minnesota State Mustangs
  "ncaavb-2626": ncaa("tampa"), // Tampa Spartans

  // Men's basketball
  "ncaam-108820": ncaa("alfred-st"), // Alfred State Pioneers
  "ncaam-2040": ncaa("aub-montgomery"), // Auburn Montgomery Senators
  "ncaam-5305": ncaa("azusa-pacific"), // Azusa Pacific Cougars
  "ncaam-2053": ncaa("barry"), // Barry Buccaneers
  "ncaam-2067": ncaa("biola"), // Biola Eagles
  "ncaam-6183": ncaa("humboldt-st"), // Cal Poly Humboldt Lumberjacks
  "ncaam-3182": ncaa("cal-st-san-marcos"), // Cal State San Marcos Cougars
  "ncaam-2965": ncaa("clarke"), // Clarke Pride
  "ncaam-2157": ncaa("covenant"), // Covenant Fighting Scots
  "ncaam-2163": ncaa("dallas"), // Dallas Crusaders
  "ncaam-111949": ncaa("desales"), // DeSales Bulldogs
  "ncaam-108842": ncaa("emerson"), // Emerson Lions
  "ncaam-2215": ncaa("erskine"), // Erskine Flying Fleet
  "ncaam-126956": ncaa("framingham-st"), // Framingham State Rams
  "ncaam-3078": ncaa("jessup"), // Jessup Warriors
  "ncaam-353": ncaa("johnson-wales-ri"), // Johnson & Wales Griffins
  "ncaam-6319": ncaa("keuka"), // Keuka Storm
  "ncaam-123306": ncaa("lancaster-bible"), // Lancaster Bible Chargers
  "ncaam-6371": ncaa("lane"), // Lane College Dragons
  "ncaam-2358": ncaa("lyon"), // Lyon Scots
  "ncaam-310": ncaa("maryville-mo"), // Maryville (MO)
  "ncaam-14632": ncaa("mcdaniel"), // McDaniel Green Terror
  "ncaam-2381": ncaa("menlo"), // Menlo Oaks
  "ncaam-2384": ncaa("mercy"), // Mercy Mavericks
  "ncaam-111902": ncaa("misericordia"), // Misericordia Cougars
  "ncaam-580": ncaa("newman"), // Newman Jets
  "ncaam-121894": ncaa("north-central-mn"), // North Central Rams
  "ncaam-128342": ncaa("notre-dame-md"), // Notre Dame (MD) Gators
  "ncaam-2488": ncaa("paine"), // Paine Lions
  "ncaam-3183": ncaa("penn-st-abington"), // Penn State Abington Nittany Lions
  "ncaam-2944": ncaa("penn-st-behrend"), // Penn State Behrend Lions
  "ncaam-131640": ncaa("penn-st-berks"), // Penn State Berks Nittany Lions
  "ncaam-2945": ncaa("pfeiffer"), // Pfeiffer Falcons
  "ncaam-2518": ncaa("regis-co"), // Regis University
  "ncaam-2544": ncaa("schreiner"), // Schreiner Mountaineers
  "ncaam-2589": ncaa("spalding"), // Spalding Pelicans
  "ncaam-16231": ncaa("old-westbury"), // SUNY Old Westbury Panthers
  "ncaam-2645": ncaa("thomas-me"), // Thomas College Terriers
  "ncaam-2684": ncaa("warren-wilson-college"), // Warren Wilson Owls
  "ncaam-50024": ncaa("washington-adventist"), // Washington Adventist Shock
  "ncaam-112694": ncaa("western-st"), // Western Colorado Mountaineers
  "ncaam-111242": ncaa("wheaton-ma"), // Wheaton (MA)
  "ncaam-108807": ncaa("william-peace"), // William Peace Pacers
  "ncaam-111914": ncaa("wilson"), // Wilson
  "ncaam-122196": ncaa("york-ny"), // York (NY) Cardinals

  // Women's basketball
  "ncaaw-458": ncaa("agnes-scott"), // Agnes Scott
  "ncaaw-2040": ncaa("aub-montgomery"), // Auburn Montgomery Senators
  "ncaaw-2073": ncaa("bluefield-st"), // Bluefield State Big Blue
  "ncaaw-2092": ncaa("cal-st-dom-hills"), // Cal State Dominguez Hills Toros
  "ncaaw-499": ncaa("cal-st-east-bay"), // Cal State East Bay Pioneers
  "ncaaw-2096": ncaa("cameron"), // Cameron Aggies
  "ncaaw-229": ncaa("coker"), // Coker Cobras
  "ncaaw-2862": ncaa("colo-christian"), // Colorado Christian Cougars
  "ncaaw-128442": ncaa("dyouville"), // D'Youville Saints
  "ncaaw-2167": ncaa("davis-elkins"), // Davis & Elkins Senators
  "ncaaw-2177": ncaa("dist-columbia"), // District of Columbia
  "ncaaw-2179": ncaa("dominican-ny"), // Dominican (NY) Chargers
  "ncaaw-131686": ncaa("elms"), // Elms Blazers
  "ncaaw-112702": ncaa("frostburg-st"), // Frostburg State Bobcats
  "ncaaw-542": ncaa("ill-springfield"), // Illinois Springfield Prairie Stars
  "ncaaw-3078": ncaa("jessup"), // Jessup Warriors
  "ncaaw-111960": ncaa("la-sierra"), // La Sierra Golden Eagles
  "ncaaw-2327": ncaa("lees-mcrae"), // Lees McRae Bobcats
  "ncaaw-2384": ncaa("mercy"), // Mercy Mavericks
  "ncaaw-109516": ncaa("misericordia"), // Misericordia Cougars
  "ncaaw-157": ncaa("neb-wesleyan"), // Nebraska Wesleyan Prairie Wolves
  "ncaaw-2943": ncaa("new-england-col"), // New England College Pilgrims
  "ncaaw-2518": ncaa("regis-co"), // Regis University
  "ncaaw-121715": ncaa("rogers-st"), // Rogers State Hillcats
  "ncaaw-2892": ncaa("rust"), // Rust Bearcats
  "ncaaw-2544": ncaa("schreiner"), // Schreiner Mountaineers
  "ncaaw-2590": ncaa("spring-hill"), // Spring Hill Badgers
  "ncaaw-134739": ncaa("st-catherine"), // St. Catherine Wildcats
  "ncaaw-108885": ncaa("st-josephs-li"), // St. Joseph's Long Island Bears
  "ncaaw-2610": ncaa("st-marys-tx"), // St. Mary's (TX) Rattlers
  "ncaaw-108847": ncaa("st-thomas-aquinas"), // St. Thomas Aquinas Spartans
  "ncaaw-2156": ncaa("suny-cortland"), // SUNY Cortland Red Dragons
  "ncaaw-2783": ncaa("suny-geneseo"), // SUNY Geneseo Knights
  "ncaaw-123358": ncaa("transylvania"), // Transylvania Pioneers
  "ncaaw-3185": ncaa("merced"), // UC Merced Bobcats
  "ncaaw-498": ncaa("uc-santa-cruz"), // UC Santa Cruz Banana Slugs
  "ncaaw-2660": ncaa("umass-boston"), // UMass Boston
  "ncaaw-408": ncaa("washington-adventist"), // Washington Adventist Shock
  "ncaaw-110394": ncaa("whittier"), // Whittier Poets
};
