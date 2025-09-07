import crypto from 'crypto';

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Curated word list for deterministic daily selection (family-friendly, 4-9 letters)
const WORDS = [
  'anchor','apple','artist','autumn','badge','bamboo','basket','beacon','binary','bottle','bridge','bright','cactus','camera','candle','carbon','castle','celery','chance','circle','cobalt','comet','cotton','crayon','crisp','dancer','desert','dragon','ember','fabric','falcon','feather','forest','forget','galaxy','garden','gentle','glider','golden','harbor','hazelnut','hiking','honest','horizon','island','jargon','jasper','jungle','knight','lantern','lemon','level','linear','lunar','magnet','marble','market','marine','meadow','melon','meteor','mirror','molten','mosaic','nectar','nimbus','ocean','olive','onyx','opal','orange','orchid','painter','pastel','pebble','pepper','peppermint','petal','planet','plasma','puzzle','quartz','quill','raven','record','river','rocket','saffron','sapphire','scarlet','shadow','silent','silver','smooth','socket','spectrum','spring','stable','stone','sunset','tangent','tender','thunder','tidal','timber','tomato','topaz','tulip','velvet','violet','walnut','willow','winter'
];

export function todayWord(secret = process.env.WOTD_SECRET || '') {
  const key = `${dayKey()}|${secret}`;
  const hash = crypto.createHash('sha256').update(key).digest();
  // Convert first 4 bytes into an unsigned int
  const idx = hash.readUInt32BE(0) % WORDS.length;
  return WORDS[idx];
}

