import { NextResponse } from 'next/server';

/**
 * OSIRIS — Global Infrastructure API
 * Tracks critical global infrastructure: Nuclear Power Plants worldwide
 * Comprehensive coverage including all Russian, Chinese, and strategically important facilities
 */

const NUCLEAR_FACILITIES = [
  // ═══ EUROPE ═══
  // Ukraine
  { id: 'nuc-ua-zaporizhzhia', name: 'Zaporizhzhia NPP', city: 'Enerhodar', country: 'Ukraine', lat: 47.5113, lng: 34.5861, status: 'Active Conflict Zone', reactors: 6, capacityMW: 5700, owner: 'Energoatom (Russian controlled)' },
  { id: 'nuc-ua-rivne', name: 'Rivne NPP', city: 'Varash', country: 'Ukraine', lat: 51.3278, lng: 25.8917, status: 'Operational', reactors: 4, capacityMW: 2835, owner: 'Energoatom' },
  { id: 'nuc-ua-south', name: 'South Ukraine NPP', city: 'Yuzhnoukrainsk', country: 'Ukraine', lat: 47.8147, lng: 31.2186, status: 'Operational', reactors: 3, capacityMW: 2850, owner: 'Energoatom' },
  { id: 'nuc-ua-khmelnytskyi', name: 'Khmelnytskyi NPP', city: 'Netishyn', country: 'Ukraine', lat: 50.3017, lng: 26.6489, status: 'Operational', reactors: 2, capacityMW: 2000, owner: 'Energoatom' },
  { id: 'nuc-ua-chernobyl', name: 'Chernobyl (Decommissioned)', city: 'Pripyat', country: 'Ukraine', lat: 51.3891, lng: 30.0992, status: 'Decommissioned / Exclusion Zone', reactors: 4, capacityMW: 0, owner: 'State Agency' },

  // France
  { id: 'nuc-fr-gravelines', name: 'Gravelines NPP', city: 'Gravelines', country: 'France', lat: 51.0125, lng: 2.1363, status: 'Operational', reactors: 6, capacityMW: 5460, owner: 'EDF' },
  { id: 'nuc-fr-cattenom', name: 'Cattenom NPP', city: 'Cattenom', country: 'France', lat: 49.4158, lng: 6.2181, status: 'Operational', reactors: 4, capacityMW: 5200, owner: 'EDF' },
  { id: 'nuc-fr-flamanville', name: 'Flamanville NPP', city: 'Flamanville', country: 'France', lat: 49.5386, lng: -1.8811, status: 'Operational', reactors: 3, capacityMW: 3960, owner: 'EDF' },
  { id: 'nuc-fr-tricastin', name: 'Tricastin NPP', city: 'Saint-Paul-Trois-Châteaux', country: 'France', lat: 44.3322, lng: 4.7306, status: 'Operational', reactors: 4, capacityMW: 3660, owner: 'EDF' },

  // UK
  { id: 'nuc-uk-sizewell', name: 'Sizewell B NPP', city: 'Leiston', country: 'UK', lat: 52.2131, lng: 1.6186, status: 'Operational', reactors: 1, capacityMW: 1198, owner: 'EDF Energy' },
  { id: 'nuc-uk-hinkley', name: 'Hinkley Point C', city: 'Somerset', country: 'UK', lat: 51.2081, lng: -3.1319, status: 'Under Construction', reactors: 2, capacityMW: 3200, owner: 'EDF Energy' },

  // Other Europe
  { id: 'nuc-se-ringhals', name: 'Ringhals NPP', city: 'Varberg', country: 'Sweden', lat: 57.2639, lng: 12.1128, status: 'Operational', reactors: 3, capacityMW: 3156, owner: 'Vattenfall' },
  { id: 'nuc-fi-olkiluoto', name: 'Olkiluoto NPP', city: 'Eurajoki', country: 'Finland', lat: 61.2353, lng: 21.4469, status: 'Operational', reactors: 3, capacityMW: 4360, owner: 'TVO' },
  { id: 'nuc-be-doel', name: 'Doel NPP', city: 'Doel', country: 'Belgium', lat: 51.3256, lng: 4.2589, status: 'Partial Shutdown', reactors: 4, capacityMW: 2911, owner: 'Engie' },
  { id: 'nuc-ch-beznau', name: 'Beznau NPP', city: 'Döttingen', country: 'Switzerland', lat: 47.5581, lng: 8.2286, status: 'Operational', reactors: 2, capacityMW: 730, owner: 'Axpo' },
  { id: 'nuc-es-cofrentes', name: 'Cofrentes NPP', city: 'Cofrentes', country: 'Spain', lat: 39.2142, lng: -1.0486, status: 'Operational', reactors: 1, capacityMW: 1064, owner: 'Iberdrola' },
  { id: 'nuc-cz-temelin', name: 'Temelín NPP', city: 'Temelín', country: 'Czech Republic', lat: 49.1814, lng: 14.3758, status: 'Operational', reactors: 2, capacityMW: 2116, owner: 'ČEZ' },
  { id: 'nuc-hu-paks', name: 'Paks NPP', city: 'Paks', country: 'Hungary', lat: 46.5722, lng: 18.8533, status: 'Operational', reactors: 4, capacityMW: 2000, owner: 'MVM' },
  { id: 'nuc-by-ostrovets', name: 'Belarusian NPP', city: 'Ostrovets', country: 'Belarus', lat: 54.7556, lng: 26.0889, status: 'Operational', reactors: 2, capacityMW: 2400, owner: 'Rosatom-built' },

  // ═══ RUSSIA (comprehensive) ═══
  { id: 'nuc-ru-kursk', name: 'Kursk NPP', city: 'Kurchatov', country: 'Russia', lat: 51.6742, lng: 35.6033, status: 'Operational', reactors: 4, capacityMW: 4000, owner: 'Rosenergoatom' },
  { id: 'nuc-ru-leningrad', name: 'Leningrad NPP', city: 'Sosnovy Bor', country: 'Russia', lat: 59.8406, lng: 29.0433, status: 'Operational', reactors: 4, capacityMW: 4000, owner: 'Rosenergoatom' },
  { id: 'nuc-ru-novovoronezh', name: 'Novovoronezh NPP', city: 'Novovoronezh', country: 'Russia', lat: 51.2756, lng: 39.2144, status: 'Operational', reactors: 5, capacityMW: 3600, owner: 'Rosenergoatom' },
  { id: 'nuc-ru-kalinin', name: 'Kalinin NPP', city: 'Udomlya', country: 'Russia', lat: 57.8708, lng: 34.9786, status: 'Operational', reactors: 4, capacityMW: 4000, owner: 'Rosenergoatom' },
  { id: 'nuc-ru-balakovo', name: 'Balakovo NPP', city: 'Balakovo', country: 'Russia', lat: 52.0911, lng: 47.9564, status: 'Operational', reactors: 4, capacityMW: 4000, owner: 'Rosenergoatom' },
  { id: 'nuc-ru-rostov', name: 'Rostov NPP', city: 'Volgodonsk', country: 'Russia', lat: 47.5286, lng: 42.1014, status: 'Operational', reactors: 4, capacityMW: 4014, owner: 'Rosenergoatom' },
  { id: 'nuc-ru-smolensk', name: 'Smolensk NPP', city: 'Desnogorsk', country: 'Russia', lat: 54.1528, lng: 33.2331, status: 'Operational', reactors: 3, capacityMW: 3000, owner: 'Rosenergoatom' },
  { id: 'nuc-ru-kola', name: 'Kola NPP', city: 'Polyarnyye Zori', country: 'Russia', lat: 67.4642, lng: 32.4750, status: 'Operational', reactors: 4, capacityMW: 1760, owner: 'Rosenergoatom' },
  { id: 'nuc-ru-bilibino', name: 'Bilibino NPP', city: 'Bilibino', country: 'Russia', lat: 68.0544, lng: 166.5444, status: 'Operational', reactors: 4, capacityMW: 48, owner: 'Rosenergoatom' },
  { id: 'nuc-ru-beloyarsk', name: 'Beloyarsk NPP (BN-800)', city: 'Zarechny', country: 'Russia', lat: 56.8419, lng: 60.7250, status: 'Operational', reactors: 2, capacityMW: 1400, owner: 'Rosenergoatom' },
  { id: 'nuc-ru-akademik', name: 'Akademik Lomonosov (Floating)', city: 'Pevek', country: 'Russia', lat: 69.7008, lng: 170.3131, status: 'Operational', reactors: 2, capacityMW: 70, owner: 'Rosenergoatom' },

  // ═══ NORTH AMERICA ═══
  { id: 'nuc-us-palo-verde', name: 'Palo Verde', city: 'Tonopah', country: 'US', lat: 33.3886, lng: -112.8617, status: 'Operational', reactors: 3, capacityMW: 3937, owner: 'APS' },
  { id: 'nuc-us-browns-ferry', name: 'Browns Ferry', city: 'Athens', country: 'US', lat: 34.7042, lng: -87.1186, status: 'Operational', reactors: 3, capacityMW: 3400, owner: 'TVA' },
  { id: 'nuc-us-south-texas', name: 'South Texas Project', city: 'Bay City', country: 'US', lat: 28.7950, lng: -96.0481, status: 'Operational', reactors: 2, capacityMW: 2560, owner: 'STP Nuclear' },
  { id: 'nuc-us-vogtle', name: 'Vogtle (AP1000)', city: 'Waynesboro', country: 'US', lat: 33.1417, lng: -81.7631, status: 'Operational', reactors: 4, capacityMW: 4500, owner: 'Georgia Power' },
  { id: 'nuc-ca-bruce', name: 'Bruce Nuclear', city: 'Tiverton', country: 'Canada', lat: 44.3253, lng: -81.5997, status: 'Operational', reactors: 8, capacityMW: 6503, owner: 'Bruce Power' },
  { id: 'nuc-ca-darlington', name: 'Darlington Nuclear', city: 'Bowmanville', country: 'Canada', lat: 43.8719, lng: -78.7183, status: 'Operational', reactors: 4, capacityMW: 3512, owner: 'OPG' },
  { id: 'nuc-ca-pickering', name: 'Pickering Nuclear', city: 'Pickering', country: 'Canada', lat: 43.8103, lng: -79.0661, status: 'Operational (Extended)', reactors: 6, capacityMW: 3094, owner: 'OPG' },

  // ═══ ASIA ═══
  // China
  { id: 'nuc-cn-hongyanhe', name: 'Hongyanhe NPP', city: 'Dalian', country: 'China', lat: 39.7944, lng: 121.4800, status: 'Operational', reactors: 6, capacityMW: 6366, owner: 'CGN' },
  { id: 'nuc-cn-yangjiang', name: 'Yangjiang NPP', city: 'Yangjiang', country: 'China', lat: 21.7061, lng: 112.2597, status: 'Operational', reactors: 6, capacityMW: 6000, owner: 'CGN' },
  { id: 'nuc-cn-tianwan', name: 'Tianwan NPP', city: 'Lianyungang', country: 'China', lat: 34.6869, lng: 119.4597, status: 'Operational', reactors: 6, capacityMW: 6050, owner: 'CNNC' },
  { id: 'nuc-cn-fuqing', name: 'Fuqing NPP (Hualong One)', city: 'Fuqing', country: 'China', lat: 25.4375, lng: 119.4444, status: 'Operational', reactors: 6, capacityMW: 6000, owner: 'CNNC' },
  { id: 'nuc-cn-taishan', name: 'Taishan NPP (EPR)', city: 'Taishan', country: 'China', lat: 21.9167, lng: 112.9833, status: 'Operational', reactors: 2, capacityMW: 3320, owner: 'CGN/EDF' },
  { id: 'nuc-cn-daya-bay', name: 'Daya Bay NPP', city: 'Shenzhen', country: 'China', lat: 22.5975, lng: 114.5436, status: 'Operational', reactors: 6, capacityMW: 6086, owner: 'CGN' },

  // Japan
  { id: 'nuc-jp-kashiwazaki', name: 'Kashiwazaki-Kariwa', city: 'Kashiwazaki', country: 'Japan', lat: 37.4286, lng: 138.5958, status: 'Suspended', reactors: 7, capacityMW: 7965, owner: 'TEPCO' },
  { id: 'nuc-jp-fukushima', name: 'Fukushima Daiichi', city: 'Okuma', country: 'Japan', lat: 37.4211, lng: 141.0328, status: 'Destroyed / Decommissioning', reactors: 6, capacityMW: 0, owner: 'TEPCO' },
  { id: 'nuc-jp-takahama', name: 'Takahama NPP', city: 'Takahama', country: 'Japan', lat: 35.5217, lng: 135.4950, status: 'Partially Operational', reactors: 4, capacityMW: 3392, owner: 'KEPCO' },
  { id: 'nuc-jp-ohi', name: 'Ōi NPP', city: 'Ōi', country: 'Japan', lat: 35.5439, lng: 135.6581, status: 'Operational', reactors: 4, capacityMW: 4710, owner: 'KEPCO' },

  // South Korea
  { id: 'nuc-kr-kori', name: 'Kori/Shin-Kori NPP', city: 'Busan', country: 'South Korea', lat: 35.3197, lng: 129.2894, status: 'Operational', reactors: 7, capacityMW: 7489, owner: 'KHNP' },
  { id: 'nuc-kr-hanul', name: 'Hanul NPP', city: 'Uljin', country: 'South Korea', lat: 37.0933, lng: 129.3831, status: 'Operational', reactors: 6, capacityMW: 5928, owner: 'KHNP' },
  { id: 'nuc-kr-wolsong', name: 'Wolsong NPP', city: 'Gyeongju', country: 'South Korea', lat: 35.7131, lng: 129.4739, status: 'Operational', reactors: 4, capacityMW: 2779, owner: 'KHNP' },

  // India
  { id: 'nuc-in-kudankulam', name: 'Kudankulam NPP', city: 'Kudankulam', country: 'India', lat: 8.1706, lng: 77.7114, status: 'Operational', reactors: 2, capacityMW: 2000, owner: 'NPCIL' },
  { id: 'nuc-in-tarapur', name: 'Tarapur NPP', city: 'Tarapur', country: 'India', lat: 19.8306, lng: 72.6550, status: 'Operational', reactors: 4, capacityMW: 1400, owner: 'NPCIL' },

  // ═══ MIDDLE EAST ═══
  { id: 'nuc-ir-bushehr', name: 'Bushehr NPP', city: 'Bushehr', country: 'Iran', lat: 28.8292, lng: 50.8864, status: 'Operational', reactors: 1, capacityMW: 915, owner: 'AEOI' },
  { id: 'nuc-ae-barakah', name: 'Barakah NPP', city: 'Al Dhafra', country: 'UAE', lat: 23.9686, lng: 52.2356, status: 'Operational', reactors: 4, capacityMW: 5380, owner: 'ENEC' },

  // ═══ AFRICA ═══
  { id: 'nuc-za-koeberg', name: 'Koeberg NPP', city: 'Cape Town', country: 'South Africa', lat: -33.6769, lng: 18.4344, status: 'Operational', reactors: 2, capacityMW: 1860, owner: 'Eskom' },

  // ═══ SOUTH AMERICA ═══
  { id: 'nuc-ar-atucha', name: 'Atucha NPP', city: 'Lima', country: 'Argentina', lat: -34.0167, lng: -59.2083, status: 'Operational', reactors: 2, capacityMW: 745, owner: 'NA-SA' },
  { id: 'nuc-br-angra', name: 'Angra NPP', city: 'Angra dos Reis', country: 'Brazil', lat: -23.0083, lng: -44.4583, status: 'Operational', reactors: 2, capacityMW: 1884, owner: 'Eletronuclear' },
];

export async function GET() {
  return NextResponse.json({
    infrastructure: NUCLEAR_FACILITIES,
    total: NUCLEAR_FACILITIES.length,
    timestamp: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=86400' }
  });
}
