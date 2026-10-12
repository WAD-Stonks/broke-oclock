// Real Singapore F&B brands and outlets used only to place synthetic development deals on the map.
// Coordinates and postal codes are approximate mall/building locations, not surveyed positions.
export type SeedVenue = {
  readonly key: string
  readonly name: string
  readonly address: string
  readonly area: string
  readonly postalCode?: string
  readonly lat: number
  readonly lng: number
}

export type SeedMerchant = {
  readonly key: string
  readonly name: string
  readonly venues: readonly SeedVenue[]
}

const venue = (
  key: string,
  name: string,
  address: string,
  area: string,
  lat: number,
  lng: number,
  postalCode?: string,
): SeedVenue => ({ key, name, address, area, postalCode, lat, lng })

export const SEED_MERCHANTS: readonly SeedMerchant[] = [
  {
    key: 'mcdonalds',
    name: "McDonald's",
    venues: [
      venue(
        'mcd-bedok',
        "McDonald's Bedok Mall",
        '311 New Upper Changi Rd',
        'Bedok',
        1.3248,
        103.9293,
        '467360',
      ),
      venue(
        'mcd-jurong-point',
        "McDonald's Jurong Point",
        '1 Jurong West Central 2',
        'Jurong West',
        1.3397,
        103.7066,
        '648886',
      ),
      venue(
        'mcd-northpoint',
        "McDonald's Northpoint City",
        '930 Yishun Ave 2',
        'Yishun',
        1.4294,
        103.8357,
        '769098',
      ),
    ],
  },
  {
    key: 'kfc',
    name: 'KFC',
    venues: [
      venue(
        'kfc-tampines-mall',
        'KFC Tampines Mall',
        '4 Tampines Central 5',
        'Tampines',
        1.3525,
        103.9447,
        '529510',
      ),
      venue(
        'kfc-bpp',
        'KFC Bukit Panjang Plaza',
        '1 Jelebu Rd',
        'Bukit Panjang',
        1.3799,
        103.764,
        '677743',
      ),
    ],
  },
  {
    key: 'subway',
    name: 'Subway',
    venues: [
      venue(
        'subway-raffles-city',
        'Subway Raffles City',
        '252 North Bridge Rd',
        'City Hall',
        1.2937,
        103.853,
        '179103',
      ),
      venue(
        'subway-clementi',
        'Subway The Clementi Mall',
        '3155 Commonwealth Ave W',
        'Clementi',
        1.315,
        103.7645,
        '129588',
      ),
    ],
  },
  {
    key: 'starbucks',
    name: 'Starbucks',
    venues: [
      venue(
        'sb-vivocity',
        'Starbucks VivoCity',
        '1 HarbourFront Walk',
        'HarbourFront',
        1.2644,
        103.8222,
        '098585',
      ),
      venue(
        'sb-holland-v',
        'Starbucks Holland Village',
        'Lorong Mambong, Holland Village',
        'Holland Village',
        1.3113,
        103.796,
      ),
      venue(
        'sb-waterway',
        'Starbucks Waterway Point',
        '83 Punggol Central',
        'Punggol',
        1.4064,
        103.9023,
        '828761',
      ),
    ],
  },
  {
    key: 'yakun',
    name: 'Ya Kun Kaya Toast',
    venues: [
      venue(
        'yakun-fareast',
        'Ya Kun Kaya Toast Far East Square',
        '18 China St, Far East Square',
        'Telok Ayer',
        1.2838,
        103.847,
        '049560',
      ),
    ],
  },
  {
    key: 'toastbox',
    name: 'Toast Box',
    venues: [
      venue(
        'toastbox-ion',
        'Toast Box ION Orchard',
        '2 Orchard Turn, ION Orchard',
        'Orchard',
        1.304,
        103.8318,
        '238801',
      ),
      venue(
        'toastbox-bugis',
        'Toast Box Bugis Junction',
        '200 Victoria St, Bugis Junction',
        'Bugis',
        1.2995,
        103.8556,
        '188021',
      ),
    ],
  },
  {
    key: 'oldchangkee',
    name: 'Old Chang Kee',
    venues: [
      venue(
        'ock-tiongbahru',
        'Old Chang Kee Tiong Bahru Plaza',
        '302 Tiong Bahru Rd',
        'Tiong Bahru',
        1.2864,
        103.8273,
        '168732',
      ),
      venue(
        'ock-causeway',
        'Old Chang Kee Causeway Point',
        '1 Woodlands Square',
        'Woodlands',
        1.4362,
        103.7862,
        '738099',
      ),
    ],
  },
  {
    key: 'liho',
    name: 'LiHO TEA',
    venues: [
      venue(
        'liho-plaza-sing',
        'LiHO TEA Plaza Singapura',
        '68 Orchard Rd, Plaza Singapura',
        'Dhoby Ghaut',
        1.3006,
        103.8453,
        '238839',
      ),
      venue(
        'liho-amk',
        'LiHO TEA AMK Hub',
        '53 Ang Mo Kio Ave 3, AMK Hub',
        'Ang Mo Kio',
        1.3692,
        103.8484,
        '569933',
      ),
    ],
  },
  {
    key: 'gongcha',
    name: 'Gong Cha',
    venues: [
      venue(
        'gongcha-nex',
        'Gong Cha NEX',
        '23 Serangoon Central, NEX',
        'Serangoon',
        1.3505,
        103.872,
        '556083',
      ),
    ],
  },
  {
    key: 'koi',
    name: 'KOI Thé',
    venues: [
      venue(
        'koi-compass-one',
        'KOI Thé Compass One',
        '1 Sengkang Square, Compass One',
        'Sengkang',
        1.3922,
        103.8951,
        '545078',
      ),
      venue(
        'koi-westgate',
        'KOI Thé Westgate',
        '3 Gateway Dr, Westgate',
        'Jurong East',
        1.3345,
        103.7432,
        '608532',
      ),
    ],
  },
  {
    key: 'mrbean',
    name: 'Mr Bean',
    venues: [
      venue(
        'mrbean-hougang',
        'Mr Bean Hougang Mall',
        '90 Hougang Ave 10, Hougang Mall',
        'Hougang',
        1.3724,
        103.8938,
        '538766',
      ),
      venue(
        'mrbean-j8',
        'Mr Bean Junction 8',
        '9 Bishan Pl, Junction 8',
        'Bishan',
        1.3504,
        103.8484,
        '579837',
      ),
    ],
  },
  {
    key: 'burgerking',
    name: 'Burger King',
    venues: [
      venue(
        'bk-jewel',
        'Burger King Jewel Changi Airport',
        '78 Airport Blvd, Jewel',
        'Changi',
        1.3602,
        103.9897,
        '819666',
      ),
      venue(
        'bk-lot-one',
        'Burger King Lot One',
        '21 Choa Chu Kang Ave 4, Lot One',
        'Choa Chu Kang',
        1.3851,
        103.7449,
        '689812',
      ),
    ],
  },
  {
    key: 'pizzahut',
    name: 'Pizza Hut',
    venues: [
      venue(
        'ph-parkway',
        'Pizza Hut Parkway Parade',
        '80 Marine Parade Rd, Parkway Parade',
        'Marine Parade',
        1.3014,
        103.905,
        '449269',
      ),
    ],
  },
  {
    key: 'swensens',
    name: "Swensen's",
    venues: [
      venue(
        'sw-suntec',
        "Swensen's Suntec City",
        '3 Temasek Blvd, Suntec City',
        'Promenade',
        1.295,
        103.8577,
        '038983',
      ),
      venue(
        'sw-whitesands',
        "Swensen's White Sands",
        '1 Pasir Ris Central St 3, White Sands',
        'Pasir Ris',
        1.3724,
        103.9496,
        '518457',
      ),
    ],
  },
  {
    key: 'dintaifung',
    name: 'Din Tai Fung',
    venues: [
      venue(
        'dtf-paragon',
        'Din Tai Fung Paragon',
        '290 Orchard Rd, Paragon',
        'Orchard',
        1.3037,
        103.8352,
        '238859',
      ),
      venue(
        'dtf-mbs',
        'Din Tai Fung Marina Bay Sands',
        '2 Bayfront Ave, The Shoppes',
        'Marina Bay',
        1.2838,
        103.8591,
        '018972',
      ),
    ],
  },
  {
    key: 'genki',
    name: 'Genki Sushi',
    venues: [
      venue(
        'genki-chinatown-pt',
        'Genki Sushi Chinatown Point',
        '133 New Bridge Rd, Chinatown Point',
        'Chinatown',
        1.2851,
        103.8449,
        '059413',
      ),
      venue(
        'genki-jem',
        'Genki Sushi JEM',
        '50 Jurong Gateway Rd, JEM',
        'Jurong East',
        1.3331,
        103.743,
        '608549',
      ),
    ],
  },
  {
    key: 'jollibee',
    name: 'Jollibee',
    venues: [
      venue(
        'jollibee-lucky-plaza',
        'Jollibee Lucky Plaza',
        '304 Orchard Rd, Lucky Plaza',
        'Orchard',
        1.3044,
        103.8337,
        '238863',
      ),
      venue(
        'jollibee-seletar',
        'Jollibee The Seletar Mall',
        '33 Sengkang West Ave, The Seletar Mall',
        'Fernvale',
        1.3918,
        103.8768,
        '797653',
      ),
    ],
  },
  {
    key: 'mos',
    name: 'MOS Burger',
    venues: [
      venue(
        'mos-century-sq',
        'MOS Burger Century Square',
        '2 Tampines Central 5, Century Square',
        'Tampines',
        1.3524,
        103.944,
        '529509',
      ),
      venue(
        'mos-kallang-wave',
        'MOS Burger Kallang Wave Mall',
        '1 Stadium Pl, Kallang Wave Mall',
        'Kallang',
        1.3027,
        103.8746,
        '397628',
      ),
    ],
  },
  {
    key: 'fourfingers',
    name: '4Fingers Crispy Chicken',
    venues: [
      venue(
        '4f-jewel',
        '4Fingers Jewel Changi Airport',
        '78 Airport Blvd, Jewel',
        'Changi',
        1.3602,
        103.9897,
        '819666',
      ),
    ],
  },
  {
    key: 'stuffd',
    name: "Stuff'd",
    venues: [
      venue(
        'stuffd-raffles-place',
        "Stuff'd One Raffles Place",
        '1 Raffles Pl, One Raffles Place',
        'Raffles Place',
        1.2846,
        103.8513,
        '048616',
      ),
    ],
  },
  {
    key: 'haidilao',
    name: 'Haidilao Hot Pot',
    venues: [
      venue(
        'hdl-clarke-quay',
        'Haidilao Clarke Quay',
        '3D River Valley Rd, Clarke Quay',
        'Clarke Quay',
        1.2905,
        103.8465,
        '179023',
      ),
    ],
  },
  {
    key: 'pastamania',
    name: 'PastaMania',
    venues: [
      venue(
        'pm-yew-tee',
        'PastaMania Yew Tee Point',
        '21 Choa Chu Kang North 6, Yew Tee Point',
        'Yew Tee',
        1.397,
        103.7466,
        '689578',
      ),
    ],
  },
  {
    key: 'shakeshack',
    name: 'Shake Shack',
    venues: [
      venue(
        'ss-jewel',
        'Shake Shack Jewel Changi Airport',
        '78 Airport Blvd, Jewel',
        'Changi',
        1.3602,
        103.9897,
        '819666',
      ),
      venue(
        'ss-neil-road',
        'Shake Shack Neil Road',
        '89 Neil Rd',
        'Tanjong Pagar',
        1.2795,
        103.8405,
        '088849',
      ),
    ],
  },
  {
    key: 'chateraise',
    name: 'Chateraise',
    venues: [
      venue(
        'chat-tampines1',
        'Chateraise Tampines 1',
        '10 Tampines Central 1, Tampines 1',
        'Tampines',
        1.354,
        103.945,
        '529536',
      ),
    ],
  },
  {
    key: 'breadtalk',
    name: 'BreadTalk',
    venues: [
      venue(
        'bt-northpoint',
        'BreadTalk Northpoint City',
        '930 Yishun Ave 2, Northpoint City',
        'Yishun',
        1.4294,
        103.8357,
        '769098',
      ),
      venue(
        'bt-bugis',
        'BreadTalk Bugis Junction',
        '200 Victoria St, Bugis Junction',
        'Bugis',
        1.2995,
        103.8556,
        '188021',
      ),
    ],
  },
  {
    key: 'wingstop',
    name: 'Wingstop',
    venues: [
      venue(
        'ws-bugis-plus',
        'Wingstop Bugis+',
        '201 Victoria St, Bugis+',
        'Bugis',
        1.2998,
        103.855,
        '188067',
      ),
    ],
  },
  {
    key: 'saizeriya',
    name: 'Saizeriya',
    venues: [
      venue(
        'sz-marina-sq',
        'Saizeriya Marina Square',
        '6 Raffles Blvd, Marina Square',
        'Marina Centre',
        1.2912,
        103.8578,
        '039594',
      ),
    ],
  },
  {
    key: 'astons',
    name: 'Astons Specialities',
    venues: [
      venue(
        'astons-cathay',
        'Astons The Cathay',
        '2 Handy Rd, The Cathay',
        'Dhoby Ghaut',
        1.2993,
        103.8477,
        '229233',
      ),
    ],
  },
  {
    key: 'collins',
    name: "Collin's",
    venues: [
      venue(
        'collins-wm',
        "Collin's West Mall",
        '1 Bukit Batok Central Link, West Mall',
        'Bukit Batok',
        1.3499,
        103.7495,
        '658713',
      ),
    ],
  },
  {
    key: 'nandos',
    name: "Nando's",
    venues: [
      venue(
        'nandos-tanglin',
        "Nando's Tanglin Mall",
        '163 Tanglin Rd, Tanglin Mall',
        'Tanglin',
        1.3047,
        103.8243,
        '247933',
      ),
    ],
  },
  {
    key: 'luckin',
    name: 'Luckin Coffee',
    venues: [
      venue(
        'luckin-marina-one',
        'Luckin Coffee Marina One',
        '5 Straits View, Marina One',
        'Marina Bay',
        1.2767,
        103.854,
        '018935',
      ),
    ],
  },
  {
    key: 'fishco',
    name: 'Fish & Co.',
    venues: [
      venue(
        'fishco-causeway',
        'Fish & Co. Causeway Point',
        '1 Woodlands Square, Causeway Point',
        'Woodlands',
        1.4362,
        103.7862,
        '738099',
      ),
    ],
  },
  {
    key: 'sushiexpress',
    name: 'Sushi Express',
    venues: [
      venue(
        'se-tiongbahru',
        'Sushi Express Tiong Bahru Plaza',
        '302 Tiong Bahru Rd',
        'Tiong Bahru',
        1.2864,
        103.8273,
        '168732',
      ),
    ],
  },
  {
    key: 'enciktan',
    name: 'Encik Tan',
    venues: [
      venue(
        'et-changi-city',
        'Encik Tan Changi City Point',
        '5 Changi Business Park Central 1',
        'Changi Business Park',
        1.3345,
        103.9627,
        '486038',
      ),
    ],
  },
  {
    key: 'chicha',
    name: 'CHICHA San Chen',
    venues: [
      venue(
        'chicha-313',
        'CHICHA San Chen 313@somerset',
        '313 Orchard Rd',
        'Somerset',
        1.3012,
        103.8381,
        '238895',
      ),
    ],
  },
  {
    key: 'polar',
    name: 'Polar Puffs & Cakes',
    venues: [
      venue(
        'polar-toapayoh',
        'Polar Puffs & Cakes HDB Hub',
        '480 Lor 6 Toa Payoh, HDB Hub',
        'Toa Payoh',
        1.3326,
        103.8474,
        '310480',
      ),
    ],
  },
  {
    key: 'pezzo',
    name: 'Pezzo Pizza',
    venues: [
      venue(
        'pezzo-skg-grand',
        'Pezzo Sengkang Grand Mall',
        '70 Compassvale Bow, Sengkang Grand Mall',
        'Sengkang',
        1.3922,
        103.8935,
        '544692',
      ),
    ],
  },
  {
    key: 'fiveguys',
    name: 'Five Guys',
    venues: [
      venue(
        'fg-plaza-sing',
        'Five Guys Plaza Singapura',
        '68 Orchard Rd, Plaza Singapura',
        'Dhoby Ghaut',
        1.3006,
        103.8453,
        '238839',
      ),
    ],
  },
  {
    key: 'boost',
    name: 'Boost Juice',
    venues: [
      venue(
        'boost-great-world',
        'Boost Juice Great World',
        '1 Kim Seng Promenade, Great World',
        'River Valley',
        1.2935,
        103.8318,
        '237994',
      ),
    ],
  },
  { key: 'foodpanda', name: 'foodpanda', venues: [] },
  { key: 'grabfood', name: 'GrabFood', venues: [] },
  { key: 'deliveroo', name: 'Deliveroo', venues: [] },
  { key: 'dominos', name: "Domino's Pizza", venues: [] },
]
