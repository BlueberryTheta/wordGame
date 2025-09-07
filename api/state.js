// Inline deterministic word-of-day logic to reduce bundle issues
function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const WORDS = [
  'anchor','apple','artist','autumn','badge','bamboo','basket','beacon','binary','bottle','bridge','bright','cactus','camera','candle','carbon','castle','celery','chance','circle','cobalt','comet','cotton','crayon','crisp','dancer','desert','dragon','ember','fabric','falcon','feather','forest','forget','galaxy','garden','gentle','glider','golden','harbor','hazelnut','hiking','honest','horizon','island','jargon','jasper','jungle','knight','lantern','lemon','level','linear','lunar','magnet','marble','market','marine','meadow','melon','meteor','mirror','molten','mosaic','nectar','nimbus','ocean','olive','onyx','opal','orange','orchid','painter','pastel','pebble','pepper','peppermint','petal','planet','plasma','puzzle','quartz','quill','raven','record','river','rocket','saffron','sapphire','scarlet','shadow','silent','silver','smooth','socket','spectrum','spring','stable','stone','sunset','tangent','tender','thunder','tidal','timber','tomato','topaz','tulip','velvet','violet','walnut','willow','winter'
];

function hashDay(secret = process.env.WOTD_SECRET || '') {
  const key = `${dayKey()}|${secret}`;
  let h = 2166136261 >>> 0; // FNV-1a 32-bit
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export default function handler(req, res) {
  try {
    const idx = hashDay() % WORDS.length;
    const word = WORDS[idx];
    return res.status(200).json({ dayKey: dayKey(), wordLength: word.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to get state' });
  }
}
