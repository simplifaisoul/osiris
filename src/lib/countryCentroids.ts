/**
 * ISO 3166-1 alpha-2 → approximate country centroid as [lng, lat].
 *
 * Used to place country-scoped feeds (Cloudflare Radar outages and attack
 * origins) on the map. These are eyeballed centroids for marker placement,
 * not survey-grade geometry — do not use them for distance maths.
 *
 * NOTE: /api/radar carries its own copy of this table. Consolidating the two
 * is worthwhile but would touch a working route, so it is left for a
 * dedicated change.
 */
export const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  AF:[65,33],AL:[20,41],DZ:[3,28],AO:[18.5,-12.5],AR:[-64,-34],AM:[45,40],AU:[134,-25],AT:[14,47.5],AZ:[50,40.5],
  BD:[90,24],BY:[28,53],BE:[4,50.8],BR:[-51,-10],BG:[25.5,42.7],KH:[105,12.5],CM:[12,6],CA:[-96,62],CL:[-71,-30],
  CN:[105,35],CO:[-72,4],CD:[24,-3],CG:[15.8,-0.2],HR:[16,45.2],CU:[-79.5,22],CZ:[15.5,49.8],DK:[10,56],
  EC:[-78.5,-2],EG:[30,27],ET:[39.5,9],FI:[26,64],FR:[2,46],DE:[10,51],GH:[-1.5,8],GR:[22,39],
  GT:[-90.4,15.5],HN:[-86.6,14.8],HU:[19.5,47],IN:[79,22],ID:[120,-5],IR:[53,32],IQ:[44,33],IE:[-8,53],
  IL:[34.8,31.5],IT:[12.5,42.8],JP:[138,36],JO:[36.5,31],KZ:[67,48],KE:[38,1],KW:[47.5,29.5],
  LB:[35.8,33.9],LY:[17,27],LT:[24,55.5],MG:[47,-19],MY:[112,3],MX:[-102,23.5],MA:[-6,32],
  MZ:[35,-18.2],MM:[96.5,22],NP:[84,28.2],NL:[5.5,52.5],NZ:[174,-41],NG:[8,10],NO:[8,62],
  PK:[70,30],PS:[35.2,31.9],PA:[-80,9],PE:[-76,-10],PH:[122,12.5],PL:[19.5,52],PT:[-8,39.5],
  RO:[25,46],RU:[100,60],SA:[45,25],SN:[-14.5,14.5],RS:[21,44],SG:[103.8,1.35],SK:[19.5,48.7],
  ZA:[24,-29],KR:[128,36],ES:[-4,40],SD:[30,15],SE:[16,62],CH:[8,47],SY:[38,35],TW:[121,23.7],
  TZ:[35,-6],TH:[101,15],TR:[35,39],UA:[32,49],AE:[54,24],GB:[-2,54],US:[-97,38],UZ:[65,41.5],
  VE:[-66,8],VN:[106,16],YE:[48,15.5],ZM:[28,-14],ZW:[30,-20],
  // Additional territories that appear in Cloudflare Radar reporting.
  BA:[18,44],EE:[26,59],GE:[43.5,42],IS:[-19,65],LV:[25,57],LU:[6.1,49.8],MD:[29,47],
  MK:[21.7,41.6],ME:[19.3,42.8],CY:[33,35],MT:[14.4,35.9],SI:[15,46.1],AZO:[-28,38.5],
  BO:[-64,-17],CR:[-84,10],DO:[-70.7,19],SV:[-89,13.8],JM:[-77.3,18.1],NI:[-85,12.9],
  PY:[-58,-23],UY:[-56,-33],TT:[-61.2,10.7],PR:[-66.5,18.2],
  BF:[-1.7,12.3],CI:[-5.5,7.5],ET2:[39.5,9],GA:[11.8,-0.8],GN:[-10,10.5],ML:[-4,17],
  MR:[-10.9,20],NE:[8,17.6],RW:[30,-2],SO:[46,5],SS:[31,7],TN:[9.5,34],UG:[32.4,1.4],
  BH:[50.5,26],OM:[56,21],QA:[51.2,25.3],LK:[81,7.5],BT:[90.4,27.4],LA:[103,18],
  MN:[104,46],PG:[144,-6],FJ:[178,-17.8],KG:[74.6,41.2],TJ:[71,38.9],TM:[59.5,39],
  HK:[114.2,22.3],MO:[113.5,22.2],BN:[114.7,4.5],MV:[73.5,3.2],
};

/** Returns [lng, lat] for a country code, or null when unknown. */
export function centroidFor(code: string | null | undefined): [number, number] | null {
  if (!code) return null;
  return COUNTRY_CENTROIDS[code.toUpperCase()] ?? null;
}
