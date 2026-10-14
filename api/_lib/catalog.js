// ─────────────────────────────────────────────────────────────────────────────
// MERAKYA × BMCE — product catalogue (single source of truth for /BMCE + API)
//
//  price      = regular price shown everywhere (current price ÷ 0.85, rounded)
//  bmcePrice  = what a BMCE customer pays with a valid personal code
//  available  = false → shown as "À venir", no buy button
//  stock      = null → not counted yet (unlimited). Set a number to enforce stock;
//               units sold through /BMCE are deducted automatically.
// ─────────────────────────────────────────────────────────────────────────────

const A = "/assets/";
const I = "/bmce/img/";

export const CATALOG = [
  // ── Coffrets signatures ────────────────────────────────────────────────────
  {
    id: "coffret-abondance", group: "coffrets", available: true, stock: null,
    name: "Coffret Abondance", ritual: "Rituel de l'Expansion", words: "Attirer · Ouvrir · Recevoir",
    tagline: "Ouvrir l'espace des possibles.",
    price: 990, bmcePrice: 890, image: I + "coffret-abondance.svg", tone: "abondance",
    description: "Un rituel imaginé pour cultiver l'ouverture, accueillir de nouvelles possibilités et se reconnecter à l'énergie de l'abondance.",
    contents: ["1 bougie intention Abondance — 150 g", "1 élixir rituel Abondance — 30 ml", "1 tisane rituelle Abondance — 50 g", "5 bâtonnets d'encens", "1 carte rituel", "1 coffret grimoire MERAKYA"],
  },
  {
    id: "coffret-protection", group: "coffrets", available: true, stock: null,
    name: "Coffret Protection", ritual: "Rituel du Seuil", words: "Purifier · Protéger · Préserver",
    tagline: "Préserver son espace intérieur.",
    price: 990, bmcePrice: 890, image: I + "coffret-protection.svg", tone: "protection",
    description: "Une expérience de purification symbolique pour se recentrer, poser ses limites et transformer son espace en un véritable refuge.",
    contents: ["1 bougie intention Protection — 150 g", "1 savon artisanal rituel — 100 g", "5 bâtonnets d'encens Protection", "1 sel de bain rituel", "1 carte rituel", "1 coffret grimoire MERAKYA"],
  },
  {
    id: "coffret-ancrage", group: "coffrets", available: true, stock: null,
    name: "Coffret Ancrage", ritual: "Rituel du Retour à Soi", words: "Ralentir · Ressentir · S'enraciner",
    tagline: "Revenir à l'essentiel.",
    price: 990, bmcePrice: 890, image: I + "coffret-ancrage.svg", tone: "ancrage",
    description: "Une invitation à ralentir, à retrouver sa stabilité intérieure et à renouer avec l'instant présent à travers une expérience sensorielle apaisante.",
    contents: ["1 bougie intention Ancrage — 150 g", "1 parfum d'ambiance rituel — 50 ml", "1 tisane rituelle Ancrage — 50 g", "1 élixir rituel Ancrage — 30 ml", "1 carte rituel", "1 coffret grimoire MERAKYA"],
  },

  // ── Bougies d'intention ────────────────────────────────────────────────────
  {
    id: "bougie-abondance", group: "bougies", available: true, stock: null,
    name: "Bougie Rituelle « Abondance »", price: 212, bmcePrice: 180,
    image: I + "bougie-abondance", tone: "abondance",
    description: "Coulée à la main pour accompagner vos intentions de prospérité et d'harmonie. Ornée d'éclats de quartz rose brut et de fleurs d'oranger modelées en cire de soja.",
    details: "Cire de soja 100 % naturelle, mèche en coton tressé, huiles essentielles de cannelle, d'orange douce et de clou de girofle, cristaux de quartz rose.",
  },
  {
    id: "bougie-rose-damas", group: "bougies", available: true, stock: null,
    name: "Bougie « Rose de Damas »", price: 229, bmcePrice: 195,
    image: I + "bougie-rose-damas", tone: "rose",
    description: "Une invitation à la douceur et à l'amour de soi, présentée dans un pot en céramique artisanale marocaine peint à la main.",
    details: "Cire de soja, distillat de Rose de Damas, huile de jojoba et pétales de boutons de rose séchés du Haut-Atlas.",
  },
  {
    id: "bougie-mauvais-oeil", group: "bougies", available: true, stock: null,
    name: "Bougie « Carnation Mauvais Œil »", price: 259, bmcePrice: 220,
    image: I + "bougie-mauvais-oeil", tone: "protection",
    description: "Une bulle de sérénité pour préserver votre espace. Ornée de disques d'œil en cire bleu d'Orient et de pierres de lapis-lazuli.",
    details: "Cire végétale, lapis-lazuli, huiles essentielles de sauge officinale, de menthe poivrée et de myrrhe.",
  },

  // ── Savons artisanaux ──────────────────────────────────────────────────────
  {
    id: "savon-alchimie-argile", group: "savons", available: true, stock: null,
    name: "Savon ancestral « Alchimie Verte & Ocre »", price: 88, bmcePrice: 75,
    image: I + "savon-alchimie-argile", tone: "ancrage",
    description: "Saponifié à froid, une mousse onctueuse et douce. Ses strates d'argiles naturelles rappellent les collines de l'Atlas sous la brume du matin.",
    details: "Huile d'olive extra vierge, argile verte du Maroc (ghassoul), argile ocre de l'Ourika, huile de coco, huiles essentielles de romarin et d'eucalyptus.",
  },
  {
    id: "savon-rose-sculptee", group: "savons", available: true, stock: null,
    name: "Savon sculpté « Rose Divine »", price: 100, bmcePrice: 85,
    image: I + "savon-rose-sculptee", tone: "rose",
    description: "Un bijou de bain sculpté en forme de rose épanouie, aux reflets poudrés et aux micas dorés, pour un soin satiné et parfumé.",
    details: "Beurre de karité brut, huile d'amande douce, micas minéraux or et rose, essence de rose.",
  },

  // ── À venir (no buy button) ────────────────────────────────────────────────
  {
    id: "teas", group: "avenir", available: false, stock: null,
    name: "Thés et infusions", price: null, bmcePrice: null, image: I + "avenir-infusions.svg",
    description: "Une pause végétale, un rituel à savourer. Des mélanges inspirés par la nature pour accompagner vos moments de détente.",
  },
  {
    id: "elixirs", group: "avenir", available: false, stock: null,
    name: "Élixirs et huiles rituelles", price: null, bmcePrice: null, image: I + "avenir-elixirs",
    description: "Des compositions botaniques imaginées pour accompagner vos intentions et vos moments de reconnexion.",
  },
  {
    id: "soins-corps", group: "avenir", available: false, stock: null,
    name: "Soins et rituels pour le corps", price: null, bmcePrice: null, image: I + "avenir-soins",
    description: "Une nouvelle approche du soin, où textures, senteurs et inspirations végétales se rencontrent pour transformer les routines en instants précieux.",
  },
];

export const byId = (id) => CATALOG.find((p) => p.id === id);
