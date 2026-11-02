import type { TransitFeed } from './transit';

/**
 * OSIRIS — live, keyless GTFS-Realtime vehicle-position feeds (GENERATED).
 *
 * Built by tools/generate-transit-feeds.mjs on 2026-10-18 from the Mobility
 * Database catalogue (https://mobilitydatabase.org) plus a few feeds it lacks.
 * Every feed below answered with a decodable GTFS-Realtime FeedMessage when it
 * was built. `bbox` is [west, south, east, north]: the extent of the vehicles
 * the feed reported then, padded and joined to the catalogue's schedule area.
 * `center` is the fleet's median point and `core` the box its middle 90%
 * ran in, for placing and flying to the feed. `vehiclesAtProbe` is how many
 * vehicles it had at that moment.
 *
 * Do not edit by hand; run the tool again.
 */
export const TRANSIT_FEEDS: TransitFeed[] = [
  {
    "id": "adelaide-metro",
    "provider": "Adelaide Metro",
    "country": "AU",
    "region": "Adelaide",
    "url": "https://gtfs.adelaidemetro.com.au/v1/realtime/vehicle_positions",
    "bbox": [
      138.4259,
      -35.3392,
      139.0361,
      -34.571
    ],
    "center": [
      138.5946,
      -34.9221
    ],
    "core": [
      138.4719,
      -35.1542,
      138.7221,
      -34.7432
    ],
    "mdb": "1772",
    "vehiclesAtProbe": 210
  },
  {
    "id": "canberra-metro-operations",
    "provider": "Canberra Metro Operations",
    "country": "AU",
    "region": "Canberra",
    "url": "http://files.transport.act.gov.au/feeds/lightrail.pb",
    "bbox": [
      149.0806,
      -35.3203,
      149.1999,
      -35.1385
    ],
    "center": [
      149.1473,
      -35.2089
    ],
    "core": [
      149.1106,
      -35.2903,
      149.1699,
      -35.1685
    ],
    "license": "https://creativecommons.org/licenses/by/4.0/legalcode",
    "mdb": "1423",
    "vehiclesAtProbe": 4
  },
  {
    "id": "translink-south-east-queensland",
    "provider": "TransLink (South East Queensland)",
    "country": "AU",
    "region": "Queensland",
    "url": "https://gtfsrt.api.translink.com.au/api/realtime/seq/VehiclePositions",
    "bbox": [
      152.1242,
      -28.2016,
      153.5434,
      -26.1594
    ],
    "center": [
      153.0501,
      -27.5012
    ],
    "core": [
      152.8852,
      -28.1097,
      153.4512,
      -26.6841
    ],
    "license": "https://translink.com.au/about-translink/open-data",
    "mdb": "1700",
    "vehiclesAtProbe": 697
  },
  {
    "id": "translink-sunbus-cairns",
    "provider": "TransLink Sunbus Cairns",
    "country": "AU",
    "region": "Cairns",
    "url": "https://gtfsrt.api.translink.com.au/api/realtime/CNS/VehiclePositions",
    "bbox": [
      145.6323,
      -17.1482,
      145.8214,
      -16.7436
    ],
    "center": [
      145.747,
      -16.9253
    ],
    "core": [
      145.6749,
      -16.9984,
      145.7909,
      -16.8073
    ],
    "license": "https://translink.com.au/about-translink/open-data",
    "mdb": "1704",
    "vehiclesAtProbe": 23
  },
  {
    "id": "urban-mobility-center-sofia-traffic",
    "provider": "Urban Mobility Center - Sofia Traffic",
    "country": "BG",
    "region": "Sofia City",
    "url": "https://gtfs.sofiatraffic.bg/api/v1/vehicle-positions",
    "bbox": [
      23.138,
      42.5379,
      23.546,
      42.8688
    ],
    "center": [
      23.3237,
      42.6926
    ],
    "core": [
      23.2219,
      42.6135,
      23.4359,
      42.778
    ],
    "license": "https://www.sofiatraffic.bg/bg/info-center/gtfs-danni",
    "mdb": "2847",
    "vehiclesAtProbe": 352
  },
  {
    "id": "barrie-transit",
    "provider": "Barrie Transit",
    "country": "CA",
    "region": "Barrie",
    "url": "https://www.myridebarrie.ca/gtfs/GTFS_VehiclePositions.pb",
    "bbox": [
      -79.7555,
      44.3218,
      -79.6109,
      44.4394
    ],
    "center": [
      -79.6903,
      44.3828
    ],
    "core": [
      -79.7255,
      44.3539,
      -79.6697,
      44.4094
    ],
    "license": "https://www.barrie.ca/services-payments/transportation-parking/barrie-transit/barrie-gtfs",
    "mdb": "1382",
    "vehiclesAtProbe": 3
  },
  {
    "id": "bc-transit-bulkley-nechako-prince-george",
    "provider": "BC Transit (Bulkley-Nechako | Prince George)",
    "country": "CA",
    "region": "Bulkley-Nechako",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=22",
    "bbox": [
      -122.8453,
      53.8193,
      -122.6975,
      53.9706
    ],
    "center": [
      -122.7823,
      53.913
    ],
    "core": [
      -122.8153,
      53.8493,
      -122.7275,
      53.9406
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2513",
    "vehiclesAtProbe": 7
  },
  {
    "id": "bc-transit-campbell-river-transit",
    "provider": "BC Transit (Campbell River Transit)",
    "country": "CA",
    "region": "Campbell River",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=12",
    "bbox": [
      -125.2864,
      49.87,
      -125.129,
      50.0639
    ],
    "center": [
      -125.1876,
      49.9731
    ],
    "core": [
      -125.2524,
      49.9223,
      -125.1676,
      49.9931
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "1378",
    "vehiclesAtProbe": 2
  },
  {
    "id": "bc-transit-central-fraser-valley-chilliw",
    "provider": "BC Transit (Central Fraser Valley| Chilliwack| Agassiz-Harrison | Hope)",
    "country": "CA",
    "region": "Central Fraser Valley",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=13",
    "bbox": [
      -122.8953,
      48.9962,
      -121.4203,
      49.3827
    ],
    "center": [
      -122.2904,
      49.0692
    ],
    "core": [
      -122.6824,
      49.0262,
      -121.8468,
      49.1987
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2517",
    "vehiclesAtProbe": 19
  },
  {
    "id": "bc-transit-columbia-valley-cranbrook-elk",
    "provider": "BC Transit (Columbia Valley | Cranbrook | Elk Valley | Kimberley)",
    "country": "CA",
    "region": "Columbia Valley",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=21",
    "bbox": [
      -115.8144,
      49.4708,
      -115.7144,
      49.5708
    ],
    "center": [
      -115.7644,
      49.5208
    ],
    "core": [
      -115.7844,
      49.5008,
      -115.7444,
      49.5408
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2523",
    "vehiclesAtProbe": 1
  },
  {
    "id": "bc-transit-comox-valley-transit-system",
    "provider": "BC Transit (Comox Valley Transit System)",
    "country": "CA",
    "region": "Comox Valley",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=45",
    "bbox": [
      -125.1477,
      49.441,
      -124.764,
      49.8734
    ],
    "center": [
      -124.9354,
      49.6241
    ],
    "core": [
      -125.0567,
      49.471,
      -124.794,
      49.7
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2527",
    "vehiclesAtProbe": 3
  },
  {
    "id": "bc-transit-cowichan-valley-regional-tran",
    "provider": "BC Transit (Cowichan Valley Regional Transit System)",
    "country": "CA",
    "region": "British Columbia",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=10",
    "bbox": [
      -124.2186,
      48.4183,
      -123.3644,
      48.9983
    ],
    "center": [
      -123.7915,
      48.7083
    ],
    "core": [
      -124.2186,
      48.4183,
      -123.3644,
      48.9983
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "1379",
    "vehiclesAtProbe": 0
  },
  {
    "id": "bc-transit-dawson-creek",
    "provider": "BC Transit (Dawson Creek)",
    "country": "CA",
    "region": "Dawson Creek",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=27",
    "bbox": [
      -120.2569,
      55.7387,
      -120.2096,
      55.7763
    ],
    "center": [
      -120.2333,
      55.7575
    ],
    "core": [
      -120.2569,
      55.7387,
      -120.2096,
      55.7763
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2542",
    "vehiclesAtProbe": 0
  },
  {
    "id": "bc-transit-fort-st-john",
    "provider": "BC Transit (Fort St. John)",
    "country": "CA",
    "region": "Fort St. John",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=28",
    "bbox": [
      -120.8739,
      56.2318,
      -120.803,
      56.2667
    ],
    "center": [
      -120.8384,
      56.2492
    ],
    "core": [
      -120.8739,
      56.2318,
      -120.803,
      56.2667
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2550",
    "vehiclesAtProbe": 0
  },
  {
    "id": "bc-transit-hazelton-kitimat-terrace",
    "provider": "BC Transit (Hazelton | Kitimat | Terrace)",
    "country": "CA",
    "region": "Hazelton",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=26",
    "bbox": [
      -128.6825,
      54.0066,
      -128.5825,
      54.1066
    ],
    "center": [
      -128.6325,
      54.0566
    ],
    "core": [
      -128.6525,
      54.0366,
      -128.6125,
      54.0766
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2477",
    "vehiclesAtProbe": 1
  },
  {
    "id": "bc-transit-kamloops-transit-system",
    "provider": "BC Transit (Kamloops Transit System)",
    "country": "CA",
    "region": "Kamloops",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=46",
    "bbox": [
      -120.4229,
      50.5955,
      -120.0788,
      50.8603
    ],
    "center": [
      -120.3511,
      50.6747
    ],
    "core": [
      -120.3923,
      50.6255,
      -120.2864,
      50.7204
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2554",
    "vehiclesAtProbe": 9
  },
  {
    "id": "bc-transit-kelowna-regional-transit-syst",
    "provider": "BC Transit (Kelowna Regional Transit System)",
    "country": "CA",
    "region": "Kelowna",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=47",
    "bbox": [
      -119.79,
      49.7519,
      -119.337,
      50.0735
    ],
    "center": [
      -119.4541,
      49.8863
    ],
    "core": [
      -119.6511,
      49.8086,
      -119.367,
      49.9599
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2558",
    "vehiclesAtProbe": 20
  },
  {
    "id": "bc-transit-merritt",
    "provider": "BC Transit (Merritt)",
    "country": "CA",
    "region": "Merritt",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=37",
    "bbox": [
      -120.8439,
      50.055,
      -120.7439,
      50.155
    ],
    "center": [
      -120.7939,
      50.105
    ],
    "core": [
      -120.8139,
      50.085,
      -120.7739,
      50.125
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2503",
    "vehiclesAtProbe": 1
  },
  {
    "id": "bc-transit-nanaimo",
    "provider": "BC Transit (Nanaimo)",
    "country": "CA",
    "region": "Nanaimo",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=41",
    "bbox": [
      -124.2443,
      48.8664,
      -123.6959,
      49.3202
    ],
    "center": [
      -123.951,
      49.1643
    ],
    "core": [
      -124.2143,
      48.8964,
      -123.7259,
      49.2902
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2476",
    "vehiclesAtProbe": 15
  },
  {
    "id": "bc-transit-pemberton-valley",
    "provider": "BC Transit (Pemberton Valley)",
    "country": "CA",
    "region": "Pemberton Valley",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=50",
    "bbox": [
      -123.0045,
      50.0846,
      -122.8256,
      50.2306
    ],
    "center": [
      -122.8756,
      50.1806
    ],
    "core": [
      -122.9745,
      50.1146,
      -122.8556,
      50.2006
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2500",
    "vehiclesAtProbe": 2
  },
  {
    "id": "bc-transit-port-edward-prince-rupert",
    "provider": "BC Transit (Port Edward | Prince Rupert)",
    "country": "CA",
    "region": "Port Edward",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=23",
    "bbox": [
      -130.3824,
      54.2524,
      -130.2585,
      54.3602
    ],
    "center": [
      -130.3085,
      54.3102
    ],
    "core": [
      -130.3524,
      54.2824,
      -130.2885,
      54.3302
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2546",
    "vehiclesAtProbe": 0
  },
  {
    "id": "bc-transit-powell-river",
    "provider": "BC Transit (Powell River)",
    "country": "CA",
    "region": "Powell River",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=29",
    "bbox": [
      -124.7605,
      49.654,
      -124.1789,
      49.9816
    ],
    "center": [
      -124.5202,
      49.8516
    ],
    "core": [
      -124.5407,
      49.8152,
      -124.5002,
      49.8716
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2559",
    "vehiclesAtProbe": 2
  },
  {
    "id": "bc-transit-quesnel",
    "provider": "BC Transit (Quesnel)",
    "country": "CA",
    "region": "Quesnel",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=32",
    "bbox": [
      -122.5659,
      52.921,
      -122.4659,
      53.021
    ],
    "center": [
      -122.5159,
      52.971
    ],
    "core": [
      -122.5359,
      52.951,
      -122.4959,
      52.991
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2482",
    "vehiclesAtProbe": 0
  },
  {
    "id": "bc-transit-revelstoke",
    "provider": "BC Transit (Revelstoke)",
    "country": "CA",
    "region": "Revelstoke",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=36",
    "bbox": [
      -118.2632,
      50.9715,
      -118.1632,
      51.0715
    ],
    "center": [
      -118.2132,
      51.0215
    ],
    "core": [
      -118.2332,
      51.0015,
      -118.1932,
      51.0415
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2485",
    "vehiclesAtProbe": 1
  },
  {
    "id": "bc-transit-salt-spring-island",
    "provider": "BC Transit (Salt Spring Island)",
    "country": "CA",
    "region": "Salt Spring Island",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=39",
    "bbox": [
      -123.5001,
      48.719,
      -123.4001,
      48.819
    ],
    "center": [
      -123.4501,
      48.769
    ],
    "core": [
      -123.4701,
      48.749,
      -123.4301,
      48.789
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2488",
    "vehiclesAtProbe": 1
  },
  {
    "id": "bc-transit-shuswap-vernon",
    "provider": "BC Transit (Shuswap | Vernon)",
    "country": "CA",
    "region": "Shuswap",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=14",
    "bbox": [
      -125.1477,
      49.4722,
      -119.208,
      50.3331
    ],
    "center": [
      -119.2714,
      50.2708
    ],
    "core": [
      -119.3309,
      50.2335,
      -119.238,
      50.3031
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2535",
    "vehiclesAtProbe": 5
  },
  {
    "id": "bc-transit-south-okanagan-similkameen",
    "provider": "BC Transit (South Okanagan-Similkameen)",
    "country": "CA",
    "region": "South Okanagan-Similkameen",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=15",
    "bbox": [
      -119.6533,
      49.4424,
      -119.5533,
      49.5424
    ],
    "center": [
      -119.6033,
      49.4924
    ],
    "core": [
      -119.6233,
      49.4724,
      -119.5833,
      49.5124
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2562",
    "vehiclesAtProbe": 1
  },
  {
    "id": "bc-transit-squamish",
    "provider": "BC Transit (Squamish)",
    "country": "CA",
    "region": "Squamish",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=43",
    "bbox": [
      -123.2057,
      49.6478,
      -123.099,
      49.8246
    ],
    "center": [
      -123.1533,
      49.703
    ],
    "core": [
      -123.1757,
      49.6778,
      -123.1297,
      49.7946
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2566",
    "vehiclesAtProbe": 3
  },
  {
    "id": "bc-transit-sunshine-coast-transit-system",
    "provider": "BC Transit (Sunshine Coast Transit System)",
    "country": "CA",
    "region": "British Columbia",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=18",
    "bbox": [
      -123.9115,
      49.3528,
      -123.4279,
      49.531
    ],
    "center": [
      -123.5039,
      49.4399
    ],
    "core": [
      -123.7775,
      49.3828,
      -123.4579,
      49.501
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2570",
    "vehiclesAtProbe": 4
  },
  {
    "id": "bc-transit-victoria-regional-transit-sys",
    "provider": "BC Transit (Victoria Regional Transit System)",
    "country": "CA",
    "region": "Victoria",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=48",
    "bbox": [
      -123.7954,
      48.3372,
      -123.2579,
      48.7141
    ],
    "center": [
      -123.3694,
      48.4455
    ],
    "core": [
      -123.526,
      48.4005,
      -123.2937,
      48.595
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2574",
    "vehiclesAtProbe": 75
  },
  {
    "id": "bc-transit-west-coast",
    "provider": "BC Transit (West Coast)",
    "country": "CA",
    "region": "West Coast",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=51",
    "bbox": [
      -125.5993,
      48.8881,
      -125.4993,
      48.9881
    ],
    "center": [
      -125.5493,
      48.9381
    ],
    "core": [
      -125.5693,
      48.9181,
      -125.5293,
      48.9581
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2578",
    "vehiclesAtProbe": 1
  },
  {
    "id": "bc-transit-west-kootenay-transit-system",
    "provider": "BC Transit (West Kootenay Transit System)",
    "country": "CA",
    "region": "Nelson",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=20",
    "bbox": [
      -118.1408,
      49.0716,
      -116.8968,
      50.2967
    ],
    "center": [
      -117.5188,
      49.6841
    ],
    "core": [
      -118.1408,
      49.0716,
      -116.8968,
      50.2967
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2582",
    "vehiclesAtProbe": 0
  },
  {
    "id": "bc-transit-whistler",
    "provider": "BC Transit (Whistler)",
    "country": "CA",
    "region": "Whistler",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=44",
    "bbox": [
      -123.0645,
      50.0368,
      -122.8914,
      50.1981
    ],
    "center": [
      -122.9549,
      50.1132
    ],
    "core": [
      -123.0345,
      50.0668,
      -122.9214,
      50.1681
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "2586",
    "vehiclesAtProbe": 13
  },
  {
    "id": "burlington-transit",
    "provider": "Burlington Transit",
    "country": "CA",
    "region": "Burlington",
    "url": "https://opendata.burlington.ca/gtfs-rt/GTFS_VehiclePositions.pb",
    "bbox": [
      -79.9277,
      43.2132,
      -79.7252,
      43.413
    ],
    "center": [
      -79.8064,
      43.3535
    ],
    "core": [
      -79.8977,
      43.2432,
      -79.7635,
      43.383
    ],
    "license": "https://opendata.burlington.ca/opendata-terms-of-use/City%20of%20Burlington%20-%20Open%20Data%20Terms%20of%20Use.pdf",
    "mdb": "1417",
    "vehiclesAtProbe": 5
  },
  {
    "id": "durham-region-transit",
    "provider": "Durham Region Transit",
    "country": "CA",
    "region": "Durham",
    "url": "https://drtonline.durhamregiontransit.com/gtfsrealtime/VehiclePositions",
    "bbox": [
      -79.2529,
      43.7368,
      -78.6656,
      44.1123
    ],
    "center": [
      -78.9472,
      43.8815
    ],
    "core": [
      -79.1528,
      43.8056,
      -78.7745,
      43.9653
    ],
    "license": "https://opendata.durham.ca/search?q=service%20alert",
    "mdb": "1466",
    "vehiclesAtProbe": 27
  },
  {
    "id": "edmonton-transit-system",
    "provider": "Edmonton Transit System",
    "country": "CA",
    "region": "Edmonton",
    "url": "http://gtfs.edmonton.ca/TMGTFSRealTimeWebService/Vehicle/VehiclePositions.pb",
    "bbox": [
      -113.9349,
      53.3027,
      -113.2181,
      53.7044
    ],
    "center": [
      -113.5078,
      53.5249
    ],
    "core": [
      -113.6498,
      53.4246,
      -113.3715,
      53.6383
    ],
    "license": "https://www.edmonton.ca/transportation/Web-version2.1-OpenDataAgreement.pdf",
    "mdb": "1496",
    "vehiclesAtProbe": 135
  },
  {
    "id": "guelph-transit",
    "provider": "Guelph Transit",
    "country": "CA",
    "region": "",
    "url": "https://glphprdtmgtfs.glphtrpcloud.com/tmgtfsrealtimewebservice/vehicle/vehiclepositions.pb",
    "bbox": [
      -80.3641,
      43.4582,
      -80.1284,
      43.6293
    ],
    "center": [
      -80.2425,
      43.5392
    ],
    "core": [
      -80.314,
      43.4977,
      -80.1827,
      43.5878
    ],
    "license": "https://explore.guelph.ca/pages/open-data-license",
    "mdb": "2592",
    "vehiclesAtProbe": 25
  },
  {
    "id": "halifax-transit",
    "provider": "Halifax Transit",
    "country": "CA",
    "region": "Halifax",
    "url": "http://gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb",
    "bbox": [
      -63.8582,
      44.5651,
      -63.2832,
      44.8863
    ],
    "center": [
      -63.5376,
      44.694
    ],
    "core": [
      -63.6031,
      44.6502,
      -63.5176,
      44.714
    ],
    "license": "http://www.halifax.ca/opendata/transit.php",
    "mdb": "1607",
    "vehiclesAtProbe": 2
  },
  {
    "id": "hamilton-street-railway",
    "provider": "Hamilton Street Railway",
    "country": "CA",
    "region": "Hamilton",
    "url": "https://opendata.hamilton.ca/GTFS-RT/GTFS_VehiclePositions.pb",
    "bbox": [
      -80.1281,
      43.1066,
      -79.596,
      43.3692
    ],
    "center": [
      -79.8667,
      43.2368
    ],
    "core": [
      -79.9707,
      43.1654,
      -79.7455,
      43.2963
    ],
    "license": "https://www.hamilton.ca/city-council/data-maps/open-data/open-data-licence-terms-and-conditions",
    "mdb": "1458",
    "vehiclesAtProbe": 80
  },
  {
    "id": "kingston-transit",
    "provider": "Kingston Transit",
    "country": "CA",
    "region": "Kingston",
    "url": "https://api.cityofkingston.ca/gtfs-realtime/vehicleupdates.pb",
    "bbox": [
      -76.6674,
      44.1775,
      -76.4391,
      44.3137
    ],
    "center": [
      -76.507,
      44.2615
    ],
    "core": [
      -76.5599,
      44.2105,
      -76.4801,
      44.2821
    ],
    "mdb": "1433",
    "vehiclesAtProbe": 49
  },
  {
    "id": "london-transit-commission",
    "provider": "London Transit Commission",
    "country": "CA",
    "region": "London",
    "url": "http://gtfs.ltconline.ca/Vehicle/VehiclePositions.pb",
    "bbox": [
      -81.39,
      42.881,
      -81.1236,
      43.0868
    ],
    "center": [
      -81.2362,
      42.9954
    ],
    "core": [
      -81.3558,
      42.9189,
      -81.1606,
      43.0476
    ],
    "license": "https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/",
    "mdb": "1561",
    "vehiclesAtProbe": 32
  },
  {
    "id": "miway-mississauga",
    "provider": "MiWay (Mississauga)",
    "country": "CA",
    "region": "Mississauga",
    "url": "https://www.miapp.ca/GTFS_RT/Vehicle/VehiclePositions.pb",
    "bbox": [
      -79.8156,
      43.4627,
      -79.4884,
      43.8381
    ],
    "center": [
      -79.6465,
      43.5939
    ],
    "core": [
      -79.7705,
      43.5144,
      -79.5262,
      43.7374
    ],
    "license": "http://www.mississauga.ca/portal/miway/developerdownload",
    "mdb": "1612",
    "vehiclesAtProbe": 67
  },
  {
    "id": "port-alberni",
    "provider": "Port Alberni",
    "country": "CA",
    "region": "Port Alberni",
    "url": "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=11",
    "bbox": [
      -124.8505,
      49.1948,
      -124.7452,
      49.2948
    ],
    "center": [
      -124.7952,
      49.2448
    ],
    "core": [
      -124.8152,
      49.2248,
      -124.7752,
      49.2648
    ],
    "license": "https://www.bctransit.com/open-data/terms-of-use",
    "mdb": "1405",
    "vehiclesAtProbe": 1
  },
  {
    "id": "thunder-bay-transit",
    "provider": "Thunder Bay Transit",
    "country": "CA",
    "region": "Thunder Bay",
    "url": "http://api.nextlift.ca/gtfs-realtime/vehicleupdates.pb",
    "bbox": [
      -89.3885,
      48.3364,
      -89.1819,
      48.4787
    ],
    "center": [
      -89.2374,
      48.4168
    ],
    "core": [
      -89.2654,
      48.3664,
      -89.2164,
      48.4376
    ],
    "mdb": "1690",
    "vehiclesAtProbe": 15
  },
  {
    "id": "ttc-toronto",
    "provider": "TTC (Toronto)",
    "country": "CA",
    "region": "Toronto",
    "url": "https://bustime.ttc.ca/gtfsrt/vehicles",
    "bbox": [
      -79.6543,
      43.5624,
      -79.1225,
      43.9097
    ],
    "center": [
      -79.3845,
      43.6925
    ],
    "core": [
      -79.5661,
      43.617,
      -79.221,
      43.8295
    ],
    "license": "https://open.toronto.ca/open-data-licence/",
    "mdb": "2140",
    "vehiclesAtProbe": 952
  },
  {
    "id": "yrtviva-york-region",
    "provider": "YRT/Viva (York Region)",
    "country": "CA",
    "region": "York",
    "url": "https://rtu.york.ca/gtfsrealtime/VehiclePositions",
    "bbox": [
      -79.6998,
      43.7159,
      -79.163,
      44.3213
    ],
    "center": [
      -79.4376,
      43.8251
    ],
    "core": [
      -79.5868,
      43.7535,
      -79.2223,
      43.9008
    ],
    "license": "https://www.yrt.ca/en/about-us/open-data-licence-agreement.aspx",
    "mdb": "1750",
    "vehiclesAtProbe": 41
  },
  {
    "id": "prazska-integrovana-doprava-pid",
    "provider": "Prazska integrovana doprava (PID)",
    "country": "CZ",
    "region": "Praha, hlavní mešto",
    "url": "https://api.golemio.cz/v2/vehiclepositions/gtfsrt/vehicle_positions.pb",
    "bbox": [
      13.3127,
      49.0078,
      15.5763,
      50.9512
    ],
    "center": [
      14.4511,
      50.077
    ],
    "core": [
      14.0661,
      49.8521,
      15.0661,
      50.2637
    ],
    "license": "https://pid.cz/o-systemu/opendata/",
    "mdb": "2391",
    "vehiclesAtProbe": 880
  },
  {
    "id": "elron",
    "provider": "ELRON",
    "country": "EE",
    "region": "",
    "url": "https://jbb.ghsq.de/gtfs/elron/VehiclePositions",
    "bbox": [
      24.108,
      58.4874,
      26.8244,
      59.4899
    ],
    "center": [
      24.8198,
      59.312
    ],
    "core": [
      24.138,
      58.5174,
      26.7944,
      59.4599
    ],
    "mdb": "3418",
    "vehiclesAtProbe": 19
  },
  {
    "id": "dbus-donostiabus",
    "provider": "dBus (Donostiabus)",
    "country": "ES",
    "region": "San Sebastián",
    "url": "https://opendata.euskadi.eus/transport/moveuskadi/dbus/gtfsrt_dbus_vehicle_positions.pb",
    "bbox": [
      -1.992,
      43.2702,
      -1.8866,
      43.3702
    ],
    "center": [
      -1.9366,
      43.3202
    ],
    "core": [
      -1.962,
      43.3002,
      -1.9166,
      43.3402
    ],
    "license": "https://nap.transportes.gob.es/licencia-datos",
    "mdb": "3066",
    "vehiclesAtProbe": 0
  },
  {
    "id": "empresa-malaguena-de-transportes-emt",
    "provider": "Empresa Malagueña de Transportes (EMT)",
    "country": "ES",
    "region": "Málaga",
    "url": "https://gtfs.emtmalaga.es/GTFSRTapi/api/vehicleposition",
    "bbox": [
      -4.5761,
      36.646,
      -4.3066,
      36.8074
    ],
    "center": [
      -4.4325,
      36.7173
    ],
    "core": [
      -4.5155,
      36.676,
      -4.3366,
      36.7774
    ],
    "mdb": "2213",
    "vehiclesAtProbe": 12
  },
  {
    "id": "empresa-municipal-de-transportes-de-fuen",
    "provider": "Empresa Municipal de Transportes de Fuenlabrada (EMTF)",
    "country": "ES",
    "region": "Fuenlabrada",
    "url": "https://api.control.optibus.co/opendata/v1/gtfs-rt/vehicle-positions?uid=c-5cfcd2d1",
    "bbox": [
      -3.8295,
      40.2337,
      -3.7295,
      40.3337
    ],
    "center": [
      -3.7795,
      40.2837
    ],
    "core": [
      -3.7995,
      40.2637,
      -3.7595,
      40.3037
    ],
    "mdb": "2402",
    "vehiclesAtProbe": 1
  },
  {
    "id": "la-regional-vallisoletana-sa",
    "provider": "La Regional Vallisoletana S.A",
    "country": "ES",
    "region": "Arroyo de la Encomienda",
    "url": "https://enzeyiwpoomhlxmcjivn.supabase.co/functions/v1/gtfs-rt",
    "bbox": [
      -4.7703,
      41.5753,
      -4.6515,
      41.7076
    ],
    "center": [
      -4.7018,
      41.6254
    ],
    "core": [
      -4.7403,
      41.6053,
      -4.6815,
      41.6776
    ],
    "mdb": "3511",
    "vehiclesAtProbe": 3
  },
  {
    "id": "metro-bilbao",
    "provider": "Metro Bilbao",
    "country": "ES",
    "region": "",
    "url": "https://ctb-gtfs-rt.s3.eu-south-2.amazonaws.com/metro-bilbao-vehicle-positions.pb",
    "bbox": [
      -3.0594,
      43.2125,
      -2.8831,
      43.4004
    ],
    "center": [
      -2.9647,
      43.2807
    ],
    "core": [
      -3.0294,
      43.2425,
      -2.9131,
      43.3704
    ],
    "license": "https://data.ctb.eus/en/pages/legal-notice",
    "mdb": "3058",
    "vehiclesAtProbe": 5
  },
  {
    "id": "renfe-commuter-trains-cercanias",
    "provider": "Renfe commuter trains (Cercanias)",
    "country": "ES",
    "region": "",
    "url": "https://gtfsrt.renfe.com/vehicle_positions.pb",
    "bbox": [
      -6.2882,
      36.468,
      3.1633,
      43.5895
    ],
    "center": [
      -3.3663,
      40.6443
    ],
    "core": [
      -5.8387,
      37.3615,
      2.3067,
      43.4023
    ],
    "license": "https://data.renfe.com/dataset/ubicacion-vehiculos",
    "mdb": "2835",
    "vehiclesAtProbe": 200
  },
  {
    "id": "hsl-helsinki-region",
    "provider": "HSL (Helsinki region)",
    "country": "FI",
    "region": "Helsinki",
    "url": "https://realtime.hsl.fi/realtime/vehicle-positions/v2/hsl",
    "bbox": [
      24.0181,
      59.9875,
      26.705,
      60.9763
    ],
    "center": [
      24.9391,
      60.2065
    ],
    "core": [
      24.6851,
      60.1369,
      25.1219,
      60.3535
    ],
    "license": "https://www.hsl.fi/en/hsl/open-data",
    "mdb": "3229",
    "vehiclesAtProbe": 345
  },
  {
    "id": "car-jaune",
    "provider": "Car Jaune",
    "country": "FR",
    "region": "",
    "url": "https://pysae.com/api/v2/groups/car-jaune/gtfs-rt",
    "bbox": [
      55.1866,
      -21.4285,
      55.8466,
      -20.8248
    ],
    "center": [
      55.4713,
      -21.0393
    ],
    "core": [
      55.228,
      -21.3686,
      55.7299,
      -20.8574
    ],
    "license": "https://transport.data.gouv.fr/datasets/horaires-theoriques-au-format-gtfs-et-horaires-temps-reel-au-format-gtfs-rt-du-reseau-car-jaune-a-la-reunion",
    "mdb": "2459",
    "vehiclesAtProbe": 34
  },
  {
    "id": "reseau-urbain-cap-cotentin",
    "provider": "Réseau urbain Cap Cotentin",
    "country": "FR",
    "region": "Communauté d'agglomération Le Cotentin",
    "url": "https://pysae.com/api/v2/groups/transdev-cotentin/gtfs-rt",
    "bbox": [
      -1.6464,
      49.5552,
      -1.5333,
      49.7008
    ],
    "center": [
      -1.5833,
      49.6508
    ],
    "core": [
      -1.6164,
      49.5852,
      -1.5633,
      49.6708
    ],
    "license": "https://www.etalab.gouv.fr/wp-content/uploads/2017/04/ETALAB-Licence-Ouverte-v2.0.pdf",
    "mdb": "1841",
    "vehiclesAtProbe": 2
  },
  {
    "id": "transports-bordeaux-metropole-tbm",
    "provider": "Transports Bordeaux Métropole (TBM)",
    "country": "FR",
    "region": "Bordeaux",
    "url": "https://bdx.mecatran.com/utw/ws/gtfsfeed/vehicles/bordeaux?apiKey=opendata-bordeaux-metropole-flux-gtfs-rt",
    "bbox": [
      -0.8314,
      44.72,
      -0.4244,
      44.9796
    ],
    "center": [
      -0.5824,
      44.839
    ],
    "core": [
      -0.7385,
      44.7615,
      -0.4992,
      44.9394
    ],
    "license": "https://transport.data.gouv.fr/datasets/offres-de-services-bus-tram-et-scolaire-au-format-gtfs-gtfs-rt-siri-lite-1",
    "mdb": "2625",
    "vehiclesAtProbe": 66
  },
  {
    "id": "bus-open-data-service-great-britain",
    "provider": "Bus Open Data Service (Great Britain)",
    "country": "GB",
    "region": "Great Britain",
    "url": "https://data.bus-data.dft.gov.uk/avl/download/gtfsrt",
    "bbox": [
      -8.7,
      49.8,
      1.9,
      60.9
    ],
    "center": [
      -0.2373,
      51.5404
    ],
    "core": [
      -2.9091,
      50.9165,
      0.1732,
      53.8558
    ],
    "license": "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    "vehiclesAtProbe": 7937,
    "format": "zip",
    "ttlMs": 30000,
    "defaultMode": "bus"
  },
  {
    "id": "azienda-del-consorzio-trasporti-venezian-3424",
    "provider": "Azienda del Consorzio Trasporti Veneziano (ACTV) Automobilistico",
    "country": "IT",
    "region": "Venice",
    "url": "https://tpl.actv.it/aut/GTFSRT/vehiclePositions",
    "bbox": [
      11.8825,
      45.0446,
      12.4274,
      45.6619
    ],
    "center": [
      12.2693,
      45.4853
    ],
    "core": [
      12.0846,
      45.3522,
      12.3863,
      45.6219
    ],
    "license": "https://actv.avmspa.it/it/content/catalogo-dei-dati-metadati-e-banche-dati-actv",
    "mdb": "3424",
    "vehiclesAtProbe": 103
  },
  {
    "id": "azienda-del-consorzio-trasporti-venezian",
    "provider": "Azienda del Consorzio Trasporti Veneziano (ACTV) Navigazione",
    "country": "IT",
    "region": "Venice",
    "url": "https://tpl.actv.it/nav/GTFSRT/vehiclePositions",
    "bbox": [
      12.2518,
      45.2237,
      12.4471,
      45.5074
    ],
    "center": [
      12.3321,
      45.4386
    ],
    "core": [
      12.2822,
      45.401,
      12.3875,
      45.4747
    ],
    "license": "https://actv.avmspa.it/it/content/catalogo-dei-dati-metadati-e-banche-dati-actv",
    "mdb": "3422",
    "vehiclesAtProbe": 46
  },
  {
    "id": "cotral-busone",
    "provider": "Cotral - BusOne",
    "country": "IT",
    "region": "Rome",
    "url": "https://proxy.busone.app/cotral/gtfs-rt/vehicle-positions.pb",
    "bbox": [
      12.0166,
      41.1634,
      28.1167,
      57.7746
    ],
    "center": [
      12.5781,
      41.9327
    ],
    "core": [
      12.1575,
      41.6246,
      13.3668,
      42.3122
    ],
    "license": "https://proxy.busone.app/cotral/readme",
    "mdb": "3387",
    "vehiclesAtProbe": 44
  },
  {
    "id": "gruppo-torinese-trasporti",
    "provider": "Gruppo Torinese Trasporti",
    "country": "IT",
    "region": "Turin",
    "url": "https://percorsieorari.gtt.to.it/das_gtfsrt/vehicle_position.aspx",
    "bbox": [
      7.4748,
      44.9465,
      7.8079,
      45.1883
    ],
    "center": [
      7.6662,
      45.0704
    ],
    "core": [
      7.5543,
      44.9971,
      7.7464,
      45.144
    ],
    "license": "https://www.gtt.to.it/gtt_gtfs_license.html",
    "mdb": "2696",
    "vehiclesAtProbe": 145
  },
  {
    "id": "roma-servizi-per-la-mobilita",
    "provider": "Roma Servizi per la Mobilità",
    "country": "IT",
    "region": "Rome",
    "url": "https://romamobilita.it/sites/default/files/rome_rtgtfs_vehicle_positions_feed.pb",
    "bbox": [
      12.1078,
      41.6486,
      12.7892,
      42.4415
    ],
    "center": [
      12.4995,
      41.8921
    ],
    "core": [
      12.34,
      41.7569,
      12.6643,
      41.986
    ],
    "license": "https://romamobilita.it/it/tecnologie/open-data/dataset",
    "mdb": "1776",
    "vehiclesAtProbe": 481
  },
  {
    "id": "lanka-metro-transit",
    "provider": "Lanka Metro Transit",
    "country": "LK",
    "region": "Colombo",
    "url": "https://api.transit.seyone.dev/api/v1/realtime/vehicle-positions",
    "bbox": [
      79.7947,
      6.6676,
      80.0333,
      7.1512
    ],
    "center": [
      79.8945,
      6.9063
    ],
    "core": [
      79.831,
      6.7045,
      79.9941,
      7.1056
    ],
    "license": "https://creativecommons.org/licenses/by/4.0/",
    "mdb": "3489",
    "vehiclesAtProbe": 53
  },
  {
    "id": "si-susisiekimo-paslaugos",
    "provider": "SĮ 'Susisiekimo paslaugos'",
    "country": "LT",
    "region": "Vilnius",
    "url": "https://www.stops.lt/vilnius/vehicle_positions.pb",
    "bbox": [
      25.0397,
      54.5518,
      25.5165,
      54.8501
    ],
    "center": [
      25.2764,
      54.6966
    ],
    "core": [
      25.1555,
      54.6173,
      25.3994,
      54.7684
    ],
    "mdb": "2383",
    "vehiclesAtProbe": 243
  },
  {
    "id": "regia-transport-electric-chisinau-im-par",
    "provider": "Regia Transport Electric Chișinău, Î.M. Parcul Urban de Autobuze",
    "country": "MD",
    "region": "Chișinău",
    "url": "https://chisinau-rt-feed.gtfs.ro/vehiclePositions",
    "bbox": [
      28.6843,
      46.8832,
      29.109,
      47.1708
    ],
    "center": [
      28.8399,
      47.0237
    ],
    "core": [
      28.7617,
      46.9613,
      28.9099,
      47.0752
    ],
    "mdb": "2342",
    "vehiclesAtProbe": 187
  },
  {
    "id": "ovapi-all-of-the-netherlands",
    "provider": "OVapi (all of the Netherlands)",
    "country": "NL",
    "region": "",
    "url": "https://gtfs.ovapi.nl/nl/vehiclePositions.pb",
    "bbox": [
      3.2,
      50.7,
      7.3,
      53.7
    ],
    "center": [
      4.8377,
      52.3527
    ],
    "core": [
      4.5197,
      52.1046,
      6.4538,
      53.162
    ],
    "license": "https://gtfs.ovapi.nl/README",
    "mdb": "1646",
    "vehiclesAtProbe": 119
  },
  {
    "id": "entur-all-of-norway",
    "provider": "Entur (all of Norway)",
    "country": "NO",
    "region": "",
    "url": "https://api.entur.io/realtime/v1/gtfs-rt/vehicle-positions",
    "headers": {
      "ET-Client-Name": "osiris-transit"
    },
    "bbox": [
      4.5,
      57.9,
      31.2,
      71.2
    ],
    "center": [
      10.9806,
      60.5263
    ],
    "core": [
      5.726,
      58.1212,
      19.6365,
      69.7204
    ],
    "license": "https://developer.entur.org/pages-intro-authentication",
    "vehiclesAtProbe": 539
  },
  {
    "id": "go-ahead",
    "provider": "Go-Ahead",
    "country": "NO",
    "region": "",
    "url": "https://api.entur.io/realtime/v1/gtfs-rt/vehicle-positions?datasource=GOA",
    "bbox": [
      4.5128,
      53.5519,
      31.112,
      78.2468
    ],
    "center": [
      17.8124,
      65.8993
    ],
    "core": [
      4.5128,
      53.5519,
      31.112,
      78.2468
    ],
    "license": "https://data.norge.no/nlod/en/",
    "mdb": "1797",
    "vehiclesAtProbe": 0
  },
  {
    "id": "vy-buss-se",
    "provider": "Vy Buss (SE)",
    "country": "NO",
    "region": "",
    "url": "https://api.entur.io/realtime/v1/gtfs-rt/vehicle-positions?datasource=VYB",
    "bbox": [
      4.5128,
      53.5519,
      31.112,
      78.2468
    ],
    "center": [
      16.5467,
      59.3734
    ],
    "core": [
      12.6368,
      55.6107,
      18.0279,
      59.6697
    ],
    "license": "https://data.norge.no/nlod/en/",
    "mdb": "1801",
    "vehiclesAtProbe": 12
  },
  {
    "id": "vy-express",
    "provider": "Vy Express",
    "country": "NO",
    "region": "",
    "url": "https://api.entur.io/realtime/v1/gtfs-rt/vehicle-positions?datasource=VYX",
    "bbox": [
      4.5128,
      53.5519,
      31.112,
      78.2468
    ],
    "center": [
      10.8664,
      60.1926
    ],
    "core": [
      5.7121,
      59.2261,
      11.2273,
      63.172
    ],
    "license": "https://data.norge.no/nlod/en/",
    "mdb": "1803",
    "vehiclesAtProbe": 17
  },
  {
    "id": "pks-w-rzeszowie-sa",
    "provider": "PKS w Rzeszowie S.A.",
    "country": "PL",
    "region": "",
    "url": "https://www.mpkrzeszow.pl/gtfs-pks/rt/gtfsrt.pb",
    "bbox": [
      21.8212,
      49.8202,
      22.2233,
      50.2881
    ],
    "center": [
      22.004,
      50.0422
    ],
    "core": [
      21.8779,
      49.9958,
      22.1933,
      50.2581
    ],
    "license": "https://www.mpkrzeszow.pl/otwartedane/",
    "mdb": "3428",
    "vehiclesAtProbe": 20
  },
  {
    "id": "rzeszowski-transport-miejski",
    "provider": "Rzeszowski Transport Miejski",
    "country": "PL",
    "region": "",
    "url": "https://www.mpkrzeszow.pl/gtfs/rt/gtfsrt.pb",
    "bbox": [
      21.8419,
      49.8805,
      22.1166,
      50.1689
    ],
    "center": [
      21.9998,
      50.0417
    ],
    "core": [
      21.914,
      49.9291,
      22.065,
      50.1108
    ],
    "license": "https://www.mpkrzeszow.pl/otwartedane/",
    "mdb": "3429",
    "vehiclesAtProbe": 56
  },
  {
    "id": "zarzad-drog-i-transportu-miejskiego-zdit",
    "provider": "Zarząd Dróg i Transportu Miejskiego (ZDiTM)",
    "country": "PL",
    "region": "Szczecin",
    "url": "https://www.zditm.szczecin.pl/storage/gtfs/gtfs-rt-vehicles.pb",
    "bbox": [
      14.3098,
      53.2825,
      14.7951,
      53.6025
    ],
    "center": [
      14.5527,
      53.432
    ],
    "core": [
      14.4678,
      53.3478,
      14.7095,
      53.556
    ],
    "license": "https://creativecommons.org/publicdomain/zero/1.0/",
    "mdb": "1968",
    "vehiclesAtProbe": 124
  },
  {
    "id": "zarzad-transportu-miejskiego-poznan-ztm-",
    "provider": "Zarząd Transportu Miejskiego Poznań (ZTM Poznań)",
    "country": "PL",
    "region": "Poznań",
    "url": "https://www.ztm.poznan.pl/pl/dla-deweloperow/getGtfsRtFile/?file=vehicle_positions.pb",
    "bbox": [
      16.4812,
      52.1517,
      17.2769,
      52.6
    ],
    "center": [
      16.9175,
      52.4073
    ],
    "core": [
      16.8083,
      52.3343,
      17.0222,
      52.4852
    ],
    "license": "https://www.ztm.poznan.pl/otwarte-dane/dla-deweloperow/",
    "mdb": "2335",
    "vehiclesAtProbe": 227
  },
  {
    "id": "zarzad-transportu-publicznego-w-krakowie",
    "provider": "Zarząd Transportu Publicznego w Krakowie (ZTP Kraków)",
    "country": "PL",
    "region": "Kraków",
    "url": "https://gtfs.ztp.krakow.pl/VehiclePositions_T.pb",
    "bbox": [
      19.8384,
      49.9627,
      20.1683,
      50.1542
    ],
    "center": [
      19.9587,
      50.0649
    ],
    "core": [
      19.8938,
      49.9939,
      20.0866,
      50.122
    ],
    "license": "https://ztp.krakow.pl",
    "mdb": "2340",
    "vehiclesAtProbe": 74
  },
  {
    "id": "zarzad-transportu-publicznego-w-krakowie-2601",
    "provider": "Zarząd Transportu Publicznego w Krakowie (ZTP Kraków)",
    "country": "PL",
    "region": "Kraków",
    "url": "https://gtfs.ztp.krakow.pl/VehiclePositions.pb",
    "bbox": [
      19.584,
      49.9025,
      20.3526,
      50.2452
    ],
    "center": [
      19.9491,
      50.0651
    ],
    "core": [
      19.8057,
      49.9734,
      20.0943,
      50.1247
    ],
    "license": "https://ztp.krakow.pl/",
    "mdb": "2601",
    "vehiclesAtProbe": 329
  },
  {
    "id": "carris",
    "provider": "Carris",
    "country": "PT",
    "region": "Lisbon",
    "url": "https://gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS/realtime/vehiclepositions",
    "bbox": [
      -9.2753,
      38.6473,
      -9.0591,
      38.8404
    ],
    "center": [
      -9.149,
      38.7382
    ],
    "core": [
      -9.2287,
      38.6837,
      -9.0957,
      38.8063
    ],
    "mdb": "2930",
    "vehiclesAtProbe": 26
  },
  {
    "id": "carris-metropolitana",
    "provider": "Carris Metropolitana",
    "country": "PT",
    "region": "Lisboa",
    "url": "https://api.carrismetropolitana.pt/vehicles.pb",
    "bbox": [
      -9.5086,
      38.4111,
      -8.4459,
      39.0883
    ],
    "center": [
      -9.1634,
      38.7664
    ],
    "core": [
      -9.3249,
      38.5353,
      -8.975,
      38.8821
    ],
    "license": "https://github.com/carrismetropolitana/gtfs",
    "mdb": "2028",
    "vehiclesAtProbe": 36
  },
  {
    "id": "asociatia-de-dezvoltare-intercomunitara-",
    "provider": "Asociația de Dezvoltare Intercomunitară pentru Transport Public București – Ilfov (TPBI)",
    "country": "RO",
    "region": "București",
    "url": "https://gtfs.tpbi.ro/api/gtfs-rt/vehiclePositions",
    "bbox": [
      25.87,
      44.2567,
      26.3862,
      44.7506
    ],
    "center": [
      26.0945,
      44.4326
    ],
    "core": [
      25.993,
      44.3585,
      26.1929,
      44.5118
    ],
    "mdb": "2104",
    "vehiclesAtProbe": 464
  },
  {
    "id": "compania-de-transport-public-cluj-napoca",
    "provider": "Compania de Transport Public Cluj-Napoca",
    "country": "RO",
    "region": "Cluj-Napoca",
    "url": "https://cluj-rt-feed.gtfs.ro/vehiclePositions",
    "bbox": [
      23.2888,
      46.5789,
      23.8409,
      46.8983
    ],
    "center": [
      23.5901,
      46.7712
    ],
    "core": [
      23.5226,
      46.7284,
      23.6668,
      46.808
    ],
    "mdb": "2614",
    "vehiclesAtProbe": 71
  },
  {
    "id": "compania-de-transport-public-iasi",
    "provider": "Compania de Transport Public Iași",
    "country": "RO",
    "region": "Iași",
    "url": "https://iasi-rt-feed.gtfs.ro/vehiclePositions",
    "bbox": [
      27.4461,
      47.0467,
      27.8242,
      47.2879
    ],
    "center": [
      27.5874,
      47.1602
    ],
    "core": [
      27.5118,
      47.1092,
      27.6452,
      47.2001
    ],
    "mdb": "2118",
    "vehiclesAtProbe": 77
  },
  {
    "id": "transbus-buzau",
    "provider": "Transbus Buzău",
    "country": "RO",
    "region": "Buzău",
    "url": "https://gtfsagent.transportpublic.ro/transbus/vehiclePositions",
    "bbox": [
      26.4764,
      44.9645,
      27.1482,
      45.3375
    ],
    "center": [
      26.7997,
      45.1387
    ],
    "core": [
      26.7797,
      45.1187,
      26.8197,
      45.1587
    ],
    "mdb": "2113",
    "vehiclesAtProbe": 1
  },
  {
    "id": "lvivavtodor",
    "provider": "Lvivavtodor",
    "country": "UA",
    "region": "Lviv",
    "url": "https://track.ua-gis.com/gtfs/lviv/vehicle_position",
    "bbox": [
      23.8235,
      49.733,
      24.1977,
      49.9546
    ],
    "center": [
      24.0218,
      49.8335
    ],
    "core": [
      23.9122,
      49.768,
      24.0972,
      49.8942
    ],
    "license": "https://opendata.city-adm.lviv.ua/ne/dataset/lviv-public-transport-gtfs-real-time/resource/d45fd95a-ffc9-45b1-be05-52012707d51f?inner_span=True",
    "mdb": "2376",
    "vehiclesAtProbe": 357
  },
  {
    "id": "arlington-transit",
    "provider": "Arlington Transit",
    "country": "US",
    "region": "Arlington",
    "url": "https://realtime.arlingtontransit.com/gtfsrt/vehicles",
    "bbox": [
      -77.2558,
      38.7947,
      -77.0034,
      38.9466
    ],
    "center": [
      -77.0834,
      38.8461
    ],
    "core": [
      -77.2258,
      38.8247,
      -77.0334,
      38.9166
    ],
    "mdb": "1790",
    "vehiclesAtProbe": 13
  },
  {
    "id": "beach-cities-transit",
    "provider": "Beach Cities Transit",
    "country": "US",
    "region": "Redondo Beach",
    "url": "https://redondobeachbct.com/gtfs-rt/vehiclepositions",
    "bbox": [
      -118.465,
      33.8161,
      -118.3527,
      33.9494
    ],
    "center": [
      -118.415,
      33.8945
    ],
    "core": [
      -118.435,
      33.8745,
      -118.395,
      33.9145
    ],
    "license": "https://www.redondo.org/depts/recreation/transit/trip_planner/gtfs_data.asp",
    "mdb": "1566",
    "vehiclesAtProbe": 1
  },
  {
    "id": "ben-franklin-transit",
    "provider": "Ben Franklin Transit",
    "country": "US",
    "region": "Richland",
    "url": "https://myride.bft.org/Realtime/GTFS_VehiclePositions.pb",
    "bbox": [
      -119.7888,
      46.1373,
      -119.043,
      46.3538
    ],
    "center": [
      -119.1812,
      46.2325
    ],
    "core": [
      -119.3824,
      46.1673,
      -119.073,
      46.3238
    ],
    "mdb": "2125",
    "vehiclesAtProbe": 19
  },
  {
    "id": "big-blue-bus",
    "provider": "Big Blue Bus",
    "country": "US",
    "region": "Santa Monica",
    "url": "http://gtfs.bigbluebus.com/vehiclepositions.bin",
    "bbox": [
      -118.5492,
      33.9295,
      -118.2373,
      34.0757
    ],
    "center": [
      -118.3932,
      34.0026
    ],
    "core": [
      -118.5492,
      33.9295,
      -118.2373,
      34.0757
    ],
    "license": "http://gtfs.bigbluebus.com/",
    "mdb": "1436",
    "vehiclesAtProbe": 0
  },
  {
    "id": "broward-county-transit",
    "provider": "Broward County Transit",
    "country": "US",
    "region": "Fort Lauderdale",
    "url": "https://myride2.broward.org/gtfsrealtime/api/vehiclepositions",
    "bbox": [
      -80.4285,
      25.7618,
      -80.055,
      26.3509
    ],
    "center": [
      -80.2048,
      26.0254
    ],
    "core": [
      -80.3564,
      25.9588,
      -80.085,
      26.2823
    ],
    "mdb": "3475",
    "vehiclesAtProbe": 10
  },
  {
    "id": "capital-area-transportation-authority",
    "provider": "Capital Area Transportation Authority",
    "country": "US",
    "region": "Lansing",
    "url": "http://developers.cata.org/gtfsrt/vehicle/vehiclepositions.pb",
    "bbox": [
      -84.6306,
      42.5657,
      -84.174,
      42.7813
    ],
    "center": [
      -84.4749,
      42.7313
    ],
    "core": [
      -84.5139,
      42.7026,
      -84.4549,
      42.7513
    ],
    "license": "https://www.cata.org/Portals/0/CATAGTFSLicenseAgreement20150323.pdf",
    "mdb": "1424",
    "vehiclesAtProbe": 2
  },
  {
    "id": "capital-district-transportation-authorit",
    "provider": "Capital District Transportation Authority",
    "country": "US",
    "region": "Albany",
    "url": "http://gtfs.cdta.org:8080/gtfsrealtime/VehiclePositions",
    "bbox": [
      -74.0101,
      42.4671,
      -73.6146,
      43.1294
    ],
    "center": [
      -73.7834,
      42.6962
    ],
    "core": [
      -73.966,
      42.617,
      -73.6541,
      43.0994
    ],
    "license": "https://www.cdta.org/developer-license-agreement/169",
    "mdb": "2700",
    "vehiclesAtProbe": 15
  },
  {
    "id": "capmetro-austin",
    "provider": "CapMetro (Austin)",
    "country": "US",
    "region": "Austin",
    "url": "https://data.texas.gov/download/eiei-9rpf/application%2Foctet-stream",
    "bbox": [
      -97.9911,
      30.1076,
      -97.3704,
      30.5879
    ],
    "center": [
      -97.7146,
      30.2653
    ],
    "core": [
      -97.8024,
      30.1828,
      -97.645,
      30.4398
    ],
    "license": "https://www.capmetro.org/developertools",
    "mdb": "1427",
    "vehiclesAtProbe": 239
  },
  {
    "id": "cecil-transit",
    "provider": "Cecil Transit",
    "country": "US",
    "region": "Maryland",
    "url": "https://passio3.com/cecil/passioTransit/gtfs/realtime/vehiclePositions",
    "bbox": [
      -76.0763,
      39.5499,
      -75.7435,
      39.6832
    ],
    "center": [
      -75.9099,
      39.6166
    ],
    "core": [
      -76.0763,
      39.5499,
      -75.7435,
      39.6832
    ],
    "mdb": "3080",
    "vehiclesAtProbe": 0
  },
  {
    "id": "central-florida-regional-transit-authori",
    "provider": "Central Florida Regional Transit Authority (LYNX)",
    "country": "US",
    "region": "Orlando",
    "url": "http://gtfsrt.golynx.com/gtfsrt/GTFS_VehiclePositions.pb",
    "bbox": [
      -81.6768,
      28.1093,
      -81.2053,
      28.815
    ],
    "center": [
      -81.4433,
      28.4971
    ],
    "core": [
      -81.5708,
      28.3746,
      -81.2871,
      28.617
    ],
    "mdb": "1766",
    "vehiclesAtProbe": 17
  },
  {
    "id": "central-ohio-transit-authority",
    "provider": "Central Ohio Transit Authority",
    "country": "US",
    "region": "Columbus",
    "url": "http://realtime.cota.com/TMGTFSRealTimeWebService/Vehicle/VehiclePositions.pb",
    "bbox": [
      -83.1627,
      39.8301,
      -82.7717,
      40.1505
    ],
    "center": [
      -82.9672,
      39.9903
    ],
    "core": [
      -83.1627,
      39.8301,
      -82.7717,
      40.1505
    ],
    "license": "https://www.cota.com/data/",
    "mdb": "1430",
    "vehiclesAtProbe": 0
  },
  {
    "id": "cincinnati-metro",
    "provider": "Cincinnati Metro",
    "country": "US",
    "region": "Cincinnati",
    "url": "https://tmgtfsprd.sorttrpcloud.com/TMGTFSRealTimeWebService/vehicle/vehiclepositions.pb",
    "bbox": [
      -84.7939,
      39.0515,
      -84.2599,
      39.3572
    ],
    "center": [
      -84.511,
      39.1359
    ],
    "core": [
      -84.6347,
      39.0816,
      -84.3545,
      39.2762
    ],
    "mdb": "1489",
    "vehiclesAtProbe": 38
  },
  {
    "id": "clackco-connects-clackamas-county",
    "provider": "ClackCo Connects (Clackamas County)",
    "country": "US",
    "region": "Oregon",
    "url": "https://passio3.com/clackamas/passioTransit/gtfs/realtime/vehiclePositions",
    "bbox": [
      -122.6558,
      45.2585,
      -122.3389,
      45.466
    ],
    "center": [
      -122.5756,
      45.3218
    ],
    "core": [
      -122.6258,
      45.2885,
      -122.3689,
      45.436
    ],
    "mdb": "2744",
    "vehiclesAtProbe": 0
  },
  {
    "id": "commerce-municipal-bus-lines",
    "provider": "Commerce Municipal Bus Lines",
    "country": "US",
    "region": "Commerce",
    "url": "https://citycommbus.com/gtfs-rt/vehiclepositions",
    "bbox": [
      -118.2643,
      33.9511,
      -118.1077,
      34.0631
    ],
    "center": [
      -118.1577,
      34.0011
    ],
    "core": [
      -118.1777,
      33.9811,
      -118.1377,
      34.0211
    ],
    "mdb": "1794",
    "vehiclesAtProbe": 1
  },
  {
    "id": "community-transit",
    "provider": "Community Transit",
    "country": "US",
    "region": "Washington",
    "url": "https://s3.amazonaws.com/commtrans-realtime-prod/vehiclepositions.pb",
    "bbox": [
      -122.4335,
      47.5921,
      -121.601,
      48.2785
    ],
    "center": [
      -122.2488,
      47.8502
    ],
    "core": [
      -122.403,
      47.7464,
      -122.0781,
      48.1686
    ],
    "license": "https://www.communitytransit.org/OpenData",
    "mdb": "1448",
    "vehiclesAtProbe": 54
  },
  {
    "id": "connecticut-transit",
    "provider": "Connecticut Transit",
    "country": "US",
    "region": "Connecticut",
    "url": "https://cttprdtmgtfs.ctttrpcloud.com/TMGTFSRealTimeWebService/Vehicle/VehiclePositions.pb",
    "bbox": [
      -73.7737,
      40.998,
      -71.7945,
      42.0208
    ],
    "center": [
      -72.865,
      41.556
    ],
    "core": [
      -73.0611,
      41.2645,
      -72.6577,
      41.7923
    ],
    "license": "https://www.cttransit.com/about/developers/terms-of-use",
    "mdb": "2422",
    "vehiclesAtProbe": 50
  },
  {
    "id": "des-moines-area-regional-transit-authori",
    "provider": "Des Moines Area Regional Transit Authority (DART)",
    "country": "US",
    "region": "Des Moines",
    "url": "https://www.ridedart.com/gtfs/real-time/vehicle-positions",
    "bbox": [
      -93.8327,
      41.5118,
      -93.4665,
      41.7329
    ],
    "center": [
      -93.6345,
      41.587
    ],
    "core": [
      -93.6545,
      41.567,
      -93.6145,
      41.607
    ],
    "license": "https://www.ridedart.com/open-data-policy-and-terms-use",
    "mdb": "1771",
    "vehiclesAtProbe": 1
  },
  {
    "id": "duluth-transit",
    "provider": "Duluth Transit",
    "country": "US",
    "region": "Duluth",
    "url": "https://duluthtransit.com/gtfsrt/Vehicle/VehiclePositions.pb",
    "bbox": [
      -92.2908,
      46.6547,
      -92.0096,
      46.8554
    ],
    "center": [
      -92.1502,
      46.7551
    ],
    "core": [
      -92.2908,
      46.6547,
      -92.0096,
      46.8554
    ],
    "license": "https://www.duluthtransit.com/home/doing-business/developer-resources/",
    "mdb": "1461",
    "vehiclesAtProbe": 0
  },
  {
    "id": "el-paso-transportation-authority",
    "provider": "El Paso Transportation Authority",
    "country": "US",
    "region": "El Paso",
    "url": "https://data.peaktransit.com/gtfsrt/193/VehiclePosition.pb",
    "bbox": [
      51.6293,
      22.9433,
      55.924,
      24.7483
    ],
    "center": [
      53.7767,
      23.8458
    ],
    "core": [
      51.6293,
      22.9433,
      55.924,
      24.7483
    ],
    "mdb": "3204",
    "vehiclesAtProbe": 0
  },
  {
    "id": "emery-go-round",
    "provider": "Emery Go-Round",
    "country": "US",
    "region": "Emeryville",
    "url": "https://emerygoround.tripshot.com/v1/gtfs/realtime/feed/egr?types=VehiclePosition",
    "bbox": [
      -122.3446,
      37.7792,
      -122.2173,
      37.896
    ],
    "center": [
      -122.2699,
      37.8299
    ],
    "core": [
      -122.3146,
      37.8092,
      -122.2473,
      37.866
    ],
    "license": "https://www.foothilltransit.org/about/developer-resources/developer-license-agreement/",
    "mdb": "2227",
    "vehiclesAtProbe": 3
  },
  {
    "id": "everett-transit",
    "provider": "Everett Transit",
    "country": "US",
    "region": "Everett",
    "url": "https://everett.mapstrat.com/current/gtfrealtime_VehiclePositions.bin",
    "bbox": [
      -122.3064,
      47.8581,
      -122.1428,
      48.0536
    ],
    "center": [
      -122.1945,
      47.9743
    ],
    "core": [
      -122.2494,
      47.8881,
      -122.1728,
      48.0236
    ],
    "license": "https://www.soundtransit.org/help-contacts/business-information/open-transit-data-otd/transit-data-terms-use",
    "mdb": "3074",
    "vehiclesAtProbe": 18
  },
  {
    "id": "foothill-transit",
    "provider": "Foothill Transit",
    "country": "US",
    "region": "Pasadena",
    "url": "https://foothill_3rdparty.rideralerts.com/myStop/GTFS-Realtime.ashx?&Type=VehiclePosition&serverid=0",
    "bbox": [
      -118.2672,
      33.9162,
      -117.6904,
      34.1516
    ],
    "center": [
      -117.9788,
      34.0339
    ],
    "core": [
      -118.2672,
      33.9162,
      -117.6904,
      34.1516
    ],
    "license": "https://www.foothilltransit.org/about/developer-resources/developer-license-agreement/",
    "mdb": "2229",
    "vehiclesAtProbe": 0
  },
  {
    "id": "frederick-county-transit",
    "provider": "Frederick County TransIT",
    "country": "US",
    "region": "Frederick",
    "url": "https://passio3.com/frederick/passioTransit/gtfs/realtime/vehiclePositions",
    "bbox": [
      -77.6651,
      39.2739,
      -77.3174,
      39.7054
    ],
    "center": [
      -77.4912,
      39.4897
    ],
    "core": [
      -77.6651,
      39.2739,
      -77.3174,
      39.7054
    ],
    "mdb": "3070",
    "vehiclesAtProbe": 0
  },
  {
    "id": "greater-cleveland-regional-transit-autho",
    "provider": "Greater Cleveland Regional Transit Authority (GCRTA)",
    "country": "US",
    "region": "Cleveland",
    "url": "https://gtfs-rt.gcrta.vontascloud.com/TMGTFSRealTimeWebService/Vehicle/VehiclePositions.pb",
    "bbox": [
      -81.9674,
      41.2278,
      -81.4136,
      41.6371
    ],
    "center": [
      -81.6535,
      41.4806
    ],
    "core": [
      -81.8259,
      41.4036,
      -81.524,
      41.5527
    ],
    "license": "https://www.riderta.com/developers",
    "mdb": "3410",
    "vehiclesAtProbe": 145
  },
  {
    "id": "greater-portland-metro-bus",
    "provider": "Greater Portland Metro Bus",
    "country": "US",
    "region": "Portland",
    "url": "https://gtfsrt.gptd.cadavl.com/ProfilGtfsRt2_0RSProducer-GPTD/VehiclePosition.pb",
    "bbox": [
      -70.4482,
      43.5966,
      -69.9625,
      43.9138
    ],
    "center": [
      -70.2778,
      43.6469
    ],
    "core": [
      -70.2979,
      43.6266,
      -70.2578,
      43.6669
    ],
    "license": "https://www.gpmetro.org/about-us/projects-initiatives/developers/",
    "mdb": "2645",
    "vehiclesAtProbe": 2
  },
  {
    "id": "intercity-transit",
    "provider": "Intercity Transit",
    "country": "US",
    "region": "Olympia",
    "url": "https://its.rideralerts.com/InfoPoint/GTFS-Realtime.ashx?Type=VehiclePosition",
    "bbox": [
      -123.0271,
      46.8985,
      -122.4831,
      47.1609
    ],
    "center": [
      -122.8734,
      47.042
    ],
    "core": [
      -122.9962,
      46.9707,
      -122.7423,
      47.0917
    ],
    "mdb": "1537",
    "vehiclesAtProbe": 37
  },
  {
    "id": "king-county-metro",
    "provider": "King County Metro",
    "country": "US",
    "region": "Seattle",
    "url": "https://s3.amazonaws.com/kcm-alerts-realtime-prod/vehiclepositions.pb",
    "bbox": [
      -122.5066,
      47.1891,
      -121.7858,
      47.8711
    ],
    "center": [
      -122.3134,
      47.6152
    ],
    "core": [
      -122.3962,
      47.3381,
      -122.1138,
      47.7543
    ],
    "license": "https://kingcounty.gov/depts/transportation/metro/travel-options/bus/app-center/developer-resources/terms-of-use.aspx",
    "mdb": "1542",
    "vehiclesAtProbe": 263
  },
  {
    "id": "knoxville-area-transit-kat",
    "provider": "Knoxville Area Transit (KAT)",
    "country": "US",
    "region": "Knoxville",
    "url": "https://knoxville.syncromatics.com/gtfs-rt/vehiclepositions",
    "bbox": [
      -84.1031,
      35.9063,
      -83.8387,
      36.0448
    ],
    "center": [
      -83.9139,
      35.9792
    ],
    "core": [
      -83.9339,
      35.9592,
      -83.8939,
      35.9992
    ],
    "license": "https://www.knoxvilletn.gov/government/opendata/knoxville_area_transit_kat_gtfs_feed",
    "mdb": "3513",
    "vehiclesAtProbe": 1
  },
  {
    "id": "maryland-transit-administration",
    "provider": "Maryland Transit Administration",
    "country": "US",
    "region": "Maryland",
    "url": "https://mdotmta-gtfs-rt.s3.amazonaws.com/MARC+RT/marc.pb",
    "bbox": [
      -77.9617,
      38.899,
      -76.0732,
      39.5581
    ],
    "center": [
      -77.0174,
      39.2286
    ],
    "core": [
      -77.9617,
      38.899,
      -76.0732,
      39.5581
    ],
    "mdb": "1619",
    "vehiclesAtProbe": 0
  },
  {
    "id": "mbta-boston",
    "provider": "MBTA (Boston)",
    "country": "US",
    "region": "Boston",
    "url": "https://cdn.mbta.com/realtime/VehiclePositions.pb",
    "bbox": [
      -71.8485,
      41.5813,
      -70.2766,
      42.7978
    ],
    "center": [
      -71.0834,
      42.3477
    ],
    "core": [
      -71.2056,
      42.1819,
      -70.9716,
      42.4469
    ],
    "license": "https://www.mbta.com/developers",
    "mdb": "1602",
    "vehiclesAtProbe": 278
  },
  {
    "id": "merced-county-transit-the-bus",
    "provider": "Merced County Transit (The Bus)",
    "country": "US",
    "region": "Merced",
    "url": "https://thebuslive.com/gtfs-rt/vehiclepositions",
    "bbox": [
      -121.0202,
      36.9645,
      -120.248,
      37.5218
    ],
    "center": [
      -120.6341,
      37.2431
    ],
    "core": [
      -121.0202,
      36.9645,
      -120.248,
      37.5218
    ],
    "mdb": "1506",
    "vehiclesAtProbe": 0
  },
  {
    "id": "metro-st-louis",
    "provider": "Metro St. Louis",
    "country": "US",
    "region": "St. Louis",
    "url": "https://www.metrostlouis.org/RealTimeData/StlRealTimeVehicles.pb",
    "bbox": [
      -90.6621,
      38.4638,
      -89.8747,
      38.8381
    ],
    "center": [
      -90.2588,
      38.6522
    ],
    "core": [
      -90.4259,
      38.5451,
      -89.9913,
      38.793
    ],
    "license": "https://www.metrostlouis.org/developer-resources/",
    "mdb": "1414",
    "vehiclesAtProbe": 56
  },
  {
    "id": "metro-transit-city-of-madison",
    "provider": "Metro Transit - City of Madison",
    "country": "US",
    "region": "Madison",
    "url": "https://metromap.cityofmadison.com/gtfsrt/vehicles",
    "bbox": [
      -89.5639,
      42.9877,
      -89.2448,
      43.2032
    ],
    "center": [
      -89.3681,
      43.0845
    ],
    "core": [
      -89.4486,
      43.02,
      -89.296,
      43.173
    ],
    "license": "http://www.cityofmadison.com/metro/Apps/developers.cfm",
    "mdb": "2097",
    "vehiclesAtProbe": 23
  },
  {
    "id": "metro-transit-minneapolisst-paul",
    "provider": "Metro Transit (Minneapolis–St Paul)",
    "country": "US",
    "region": "Minneapolis",
    "url": "https://svc.metrotransit.org/mtgtfs/vehiclepositions.pb",
    "bbox": [
      -94.1574,
      44.7255,
      -92.8059,
      45.5601
    ],
    "center": [
      -93.2519,
      44.9553
    ],
    "core": [
      -93.3566,
      44.8399,
      -93.0051,
      45.061
    ],
    "license": "https://svc.metrotransit.org/",
    "mdb": "1683",
    "vehiclesAtProbe": 145
  },
  {
    "id": "metropolitan-atlanta-rapid-transit-autho",
    "provider": "Metropolitan Atlanta Rapid Transit Authority (MARTA)",
    "country": "US",
    "region": "Atlanta",
    "url": "https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/vehicle/vehiclepositions.pb",
    "bbox": [
      -84.6698,
      33.4324,
      -84.0834,
      34.1362
    ],
    "center": [
      -84.4081,
      33.7467
    ],
    "core": [
      -84.5493,
      33.5939,
      -84.1796,
      33.9322
    ],
    "mdb": "1601",
    "vehiclesAtProbe": 86
  },
  {
    "id": "metropolitan-transit-authority-mta",
    "provider": "Metropolitan Transit Authority (MTA)",
    "country": "US",
    "region": "Long Island",
    "url": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr",
    "bbox": [
      -74.0529,
      40.5402,
      -71.9039,
      41.0997
    ],
    "center": [
      -73.7505,
      40.7486
    ],
    "core": [
      -74.0097,
      40.6022,
      -73.0859,
      40.8834
    ],
    "license": "https://api.mta.info/#/DataFeedAgreement",
    "mdb": "1624",
    "vehiclesAtProbe": 53
  },
  {
    "id": "metropolitan-transit-authority-mta-1630",
    "provider": "Metropolitan Transit Authority (MTA)",
    "country": "US",
    "region": "New York City",
    "url": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
    "bbox": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "center": [
      -74.0037,
      40.7079
    ],
    "core": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "license": "https://api.mta.info/#/DataFeedAgreement",
    "mdb": "1630",
    "vehiclesAtProbe": 0
  },
  {
    "id": "metropolitan-transit-authority-mta-1631",
    "provider": "Metropolitan Transit Authority (MTA)",
    "country": "US",
    "region": "New York City",
    "url": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
    "bbox": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "center": [
      -74.0037,
      40.7079
    ],
    "core": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "license": "https://api.mta.info/#/DataFeedAgreement",
    "mdb": "1631",
    "vehiclesAtProbe": 0
  },
  {
    "id": "metropolitan-transit-authority-mta-1632",
    "provider": "Metropolitan Transit Authority (MTA)",
    "country": "US",
    "region": "New York City",
    "url": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g",
    "bbox": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "center": [
      -74.0037,
      40.7079
    ],
    "core": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "license": "https://api.mta.info/#/DataFeedAgreement",
    "mdb": "1632",
    "vehiclesAtProbe": 0
  },
  {
    "id": "metropolitan-transit-authority-mta-1633",
    "provider": "Metropolitan Transit Authority (MTA)",
    "country": "US",
    "region": "New York City",
    "url": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",
    "bbox": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "center": [
      -74.0037,
      40.7079
    ],
    "core": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "license": "https://api.mta.info/#/DataFeedAgreement",
    "mdb": "1633",
    "vehiclesAtProbe": 0
  },
  {
    "id": "metropolitan-transit-authority-mta-1634",
    "provider": "Metropolitan Transit Authority (MTA)",
    "country": "US",
    "region": "New York City",
    "url": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
    "bbox": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "center": [
      -74.0037,
      40.7079
    ],
    "core": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "license": "https://api.mta.info/#/DataFeedAgreement",
    "mdb": "1634",
    "vehiclesAtProbe": 0
  },
  {
    "id": "metropolitan-transit-authority-mta-1635",
    "provider": "Metropolitan Transit Authority (MTA)",
    "country": "US",
    "region": "New York City",
    "url": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
    "bbox": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "center": [
      -74.0037,
      40.7079
    ],
    "core": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "license": "https://api.mta.info/#/DataFeedAgreement",
    "mdb": "1635",
    "vehiclesAtProbe": 0
  },
  {
    "id": "metropolitan-transit-authority-mta-1636",
    "provider": "Metropolitan Transit Authority (MTA)",
    "country": "US",
    "region": "New York City",
    "url": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l",
    "bbox": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "center": [
      -74.0037,
      40.7079
    ],
    "core": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "license": "https://api.mta.info/#/DataFeedAgreement",
    "mdb": "1636",
    "vehiclesAtProbe": 0
  },
  {
    "id": "middletown-area-transit",
    "provider": "Middletown Area Transit",
    "country": "US",
    "region": "Middletown",
    "url": "https://passio3.com/9town/passioTransit/gtfs/realtime",
    "bbox": [
      -72.658,
      41.2614,
      -72.0935,
      41.5613
    ],
    "center": [
      -72.3757,
      41.4114
    ],
    "core": [
      -72.658,
      41.2614,
      -72.0935,
      41.5613
    ],
    "mdb": "2271",
    "vehiclesAtProbe": 0
  },
  {
    "id": "milwaukee-county-transit-system-mcts",
    "provider": "Milwaukee County Transit System (MCTS)",
    "country": "US",
    "region": "Milwaukee",
    "url": "https://realtime.ridemcts.com/gtfsrt/vehicles",
    "bbox": [
      -88.1202,
      42.8519,
      -87.8156,
      43.3842
    ],
    "center": [
      -87.9473,
      43.0599
    ],
    "core": [
      -88.0657,
      42.9622,
      -87.868,
      43.1686
    ],
    "license": "https://www.ridemcts.com/policies/developer-terms",
    "mdb": "2130",
    "vehiclesAtProbe": 83
  },
  {
    "id": "monroe-county-transportation-authority-m",
    "provider": "Monroe County Transportation Authority (MCTA)",
    "country": "US",
    "region": "Pennsylvania",
    "url": "https://ponytracker.availtec.com/InfoPoint/gtfs-realtime.ashx?type=vehicleposition",
    "bbox": [
      -75.4273,
      40.9826,
      -75.1551,
      41.2191
    ],
    "center": [
      -75.2912,
      41.1008
    ],
    "core": [
      -75.4273,
      40.9826,
      -75.1551,
      41.2191
    ],
    "mdb": "3436",
    "vehiclesAtProbe": 0
  },
  {
    "id": "montebello-bus-lines",
    "provider": "Montebello Bus Lines",
    "country": "US",
    "region": "Montebello",
    "url": "https://mbl.rideralerts.com/InfoPoint/GTFS-Realtime.ashx?Type=VehiclePosition",
    "bbox": [
      -118.2664,
      33.8917,
      -117.9947,
      34.111
    ],
    "center": [
      -118.1243,
      34.0122
    ],
    "core": [
      -118.2043,
      33.9777,
      -118.0345,
      34.0728
    ],
    "mdb": "2218",
    "vehiclesAtProbe": 9
  },
  {
    "id": "mountain-line-transit",
    "provider": "Mountain Line Transit",
    "country": "US",
    "region": "Flagstaff",
    "url": "https://mountainline.syncromatics.com/gtfs-rt/vehiclepositions",
    "bbox": [
      -111.7197,
      35.1603,
      -111.5734,
      35.3302
    ],
    "center": [
      -111.6465,
      35.2452
    ],
    "core": [
      -111.7197,
      35.1603,
      -111.5734,
      35.3302
    ],
    "mdb": "1980",
    "vehiclesAtProbe": 0
  },
  {
    "id": "mountain-view-transportation-management-",
    "provider": "Mountain View Transportation Management Association (MVgo)",
    "country": "US",
    "region": "Mountain View",
    "url": "https://mtma.tripshot.com/v1/gtfs/realtime/feed/mvgo?types=VehiclePosition",
    "bbox": [
      -122.1116,
      37.3877,
      -122.0478,
      37.4314
    ],
    "center": [
      -122.0797,
      37.4095
    ],
    "core": [
      -122.1116,
      37.3877,
      -122.0478,
      37.4314
    ],
    "license": "https://mvgo.org/developers/",
    "mdb": "2110",
    "vehiclesAtProbe": 0
  },
  {
    "id": "mta-new-york-city-buses",
    "provider": "MTA New York City buses",
    "country": "US",
    "region": "New York City",
    "url": "https://gtfsrt.prod.obanyc.com/vehiclePositions",
    "bbox": [
      -74.3,
      40.48,
      -73.68,
      40.95
    ],
    "center": [
      -73.9254,
      40.7179
    ],
    "core": [
      -74.0562,
      40.5813,
      -73.7603,
      40.8776
    ],
    "license": "https://new.mta.info/developers/terms-and-conditions",
    "vehiclesAtProbe": 719,
    "defaultMode": "bus"
  },
  {
    "id": "nashville-mta-wego-public-transit",
    "provider": "Nashville MTA WeGo Public Transit",
    "country": "US",
    "region": "Nashville",
    "url": "http://transitdata.nashvillemta.org/TMGTFSRealTimeWebService/vehicle/vehiclepositions.pb",
    "bbox": [
      -87.3791,
      35.7416,
      -86.2972,
      36.525
    ],
    "center": [
      -86.7568,
      36.1579
    ],
    "core": [
      -86.8646,
      36.0595,
      -86.6541,
      36.2504
    ],
    "license": "https://www.wegotransit.com/contact-us/data-request-submission/",
    "mdb": "1622",
    "vehiclesAtProbe": 68
  },
  {
    "id": "ny-waterway",
    "provider": "NY Waterway",
    "country": "US",
    "region": "New York",
    "url": "https://nywaterway.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/vehicleposition",
    "bbox": [
      -74.0788,
      40.4333,
      -73.8702,
      41.5058
    ],
    "center": [
      -74.0068,
      40.7748
    ],
    "core": [
      -74.0268,
      40.7548,
      -73.9868,
      40.7948
    ],
    "mdb": "3199",
    "vehiclesAtProbe": 1
  },
  {
    "id": "port-authority-of-allegheny-county",
    "provider": "Port Authority of Allegheny County",
    "country": "US",
    "region": "Pittsburgh",
    "url": "http://truetime.portauthority.org/gtfsrt-train/vehicles",
    "bbox": [
      -80.2589,
      40.2679,
      -79.7054,
      40.6676
    ],
    "center": [
      -80.0583,
      40.3397
    ],
    "core": [
      -80.0793,
      40.3185,
      -79.9827,
      40.4513
    ],
    "license": "https://www.portauthority.org/business-center/developer-resources/developer-license-agreement/",
    "mdb": "1711",
    "vehiclesAtProbe": 24
  },
  {
    "id": "port-authority-of-allegheny-county-1714",
    "provider": "Port Authority of Allegheny County",
    "country": "US",
    "region": "Pittsburgh",
    "url": "https://truetime.portauthority.org/gtfsrt-bus/vehicles",
    "bbox": [
      -80.2589,
      40.2731,
      -79.7054,
      40.6676
    ],
    "center": [
      -79.9343,
      40.4446
    ],
    "core": [
      -80.1245,
      40.3416,
      -79.8463,
      40.521
    ],
    "license": "https://www.portauthority.org/business-center/developer-resources/developer-license-agreement/",
    "mdb": "1714",
    "vehiclesAtProbe": 170
  },
  {
    "id": "regional-transportation-district-rtd",
    "provider": "Regional Transportation District (RTD)",
    "country": "US",
    "region": "Denver",
    "url": "https://www.rtd-denver.com/files/gtfs-rt/VehiclePosition.pb",
    "bbox": [
      -105.5841,
      39.4569,
      -104.6695,
      40.2066
    ],
    "center": [
      -104.985,
      39.7483
    ],
    "core": [
      -105.2691,
      39.5937,
      -104.7641,
      40.0401
    ],
    "license": "https://www.rtd-denver.com/business-center/open-spatial-data/gtfs-realtime-license-agreement",
    "mdb": "1678",
    "vehiclesAtProbe": 258
  },
  {
    "id": "rhode-island-public-transit-authority",
    "provider": "Rhode Island Public Transit Authority",
    "country": "US",
    "region": "Rhode Island",
    "url": "http://realtime.ripta.com:81/api/vehiclepositions?format=gtfs.proto",
    "bbox": [
      -71.8298,
      41.3727,
      -71.1543,
      42.017
    ],
    "center": [
      -71.3179,
      41.8129
    ],
    "core": [
      -71.3821,
      41.4711,
      -71.2979,
      41.8329
    ],
    "mdb": "1662",
    "vehiclesAtProbe": 2
  },
  {
    "id": "riverside-transit-agency",
    "provider": "Riverside Transit Agency",
    "country": "US",
    "region": "Riverside",
    "url": "https://rtabus.com/gtfsrt/vehicles",
    "bbox": [
      -117.9659,
      33.4523,
      -116.8758,
      34.1001
    ],
    "center": [
      -117.3513,
      33.9839
    ],
    "core": [
      -117.4045,
      33.7158,
      -116.9908,
      34.0045
    ],
    "mdb": "1665",
    "vehiclesAtProbe": 95
  },
  {
    "id": "rochester-genesee-regional-transportatio",
    "provider": "Rochester-Genesee Regional Transportation Authority (RGRTA)",
    "country": "US",
    "region": "Rochester",
    "url": "https://api.rgrta.com/rtgvehicles?key=00e2dbf6b15742febb37d0a1d7d3acd5",
    "bbox": [
      -78.1411,
      42.5264,
      -76.9934,
      43.2973
    ],
    "center": [
      -77.6956,
      43.1619
    ],
    "core": [
      -77.7704,
      43.0757,
      -77.5531,
      43.2262
    ],
    "mdb": "1775",
    "vehiclesAtProbe": 3
  },
  {
    "id": "rogue-valley-transportation-district",
    "provider": "Rogue Valley Transportation District",
    "country": "US",
    "region": "Medford",
    "url": "https://gtfsrt.rvtd.cadavl.com/ProfilGtfsRt2_0RSProducer-RVTD/VehiclePosition.pb",
    "bbox": [
      -122.9667,
      42.1758,
      -122.6715,
      42.4815
    ],
    "center": [
      -122.8191,
      42.3287
    ],
    "core": [
      -122.9667,
      42.1758,
      -122.6715,
      42.4815
    ],
    "mdb": "3458",
    "vehiclesAtProbe": 0
  },
  {
    "id": "sandy-area-metro",
    "provider": "Sandy Area Metro",
    "country": "US",
    "region": "Sandy",
    "url": "https://passio3.com/sandyor/passioTransit/gtfs/realtime/vehiclePositions",
    "bbox": [
      -122.6179,
      45.2859,
      -121.709,
      45.503
    ],
    "center": [
      -122.2813,
      45.4357
    ],
    "core": [
      -122.5879,
      45.3815,
      -122.2613,
      45.4557
    ],
    "mdb": "2747",
    "vehiclesAtProbe": 2
  },
  {
    "id": "santa-cruz-metro-scmtd",
    "provider": "Santa Cruz Metro (SCMTD)",
    "country": "US",
    "region": "Santa Cruz",
    "url": "https://rt.scmetro.org/gtfsrt/vehicles",
    "bbox": [
      -122.173,
      36.8597,
      -121.7087,
      37.3666
    ],
    "center": [
      -122.0242,
      36.9814
    ],
    "core": [
      -122.0784,
      36.8916,
      -121.7397,
      37.3237
    ],
    "license": "https://scmtd.com/en/riders-guide/google-transit/gtfs-dev-data",
    "mdb": "1910",
    "vehiclesAtProbe": 40
  },
  {
    "id": "shore-transit",
    "provider": "Shore Transit",
    "country": "US",
    "region": "Salisbury",
    "url": "https://myride.shoretransit.org/gtfs/GTFS_VehiclePositions.pb",
    "bbox": [
      -75.6153,
      38.0246,
      -75.5153,
      38.1246
    ],
    "center": [
      -75.5653,
      38.0746
    ],
    "core": [
      -75.5853,
      38.0546,
      -75.5453,
      38.0946
    ],
    "mdb": "3443",
    "vehiclesAtProbe": 0
  },
  {
    "id": "south-bend-public-transportation-corpora",
    "provider": "South Bend Public Transportation Corporation",
    "country": "US",
    "region": "South Bend",
    "url": "https://passio3.com/transpo/passioTransit/gtfs/realtime/vehiclePositions",
    "bbox": [
      -87.6231,
      41.5979,
      -86.311,
      41.8842
    ],
    "center": [
      -86.967,
      41.741
    ],
    "core": [
      -87.6231,
      41.5979,
      -86.311,
      41.8842
    ],
    "mdb": "3077",
    "vehiclesAtProbe": 0
  },
  {
    "id": "south-metro-area-regional-transit-smart",
    "provider": "South Metro Area Regional Transit (SMART)",
    "country": "US",
    "region": "Wilsonville",
    "url": "https://mysmartbus.com/gtfs-rt/vehiclepositions",
    "bbox": [
      -123.035,
      44.9378,
      -122.6916,
      45.3947
    ],
    "center": [
      -122.8633,
      45.1662
    ],
    "core": [
      -123.035,
      44.9378,
      -122.6916,
      45.3947
    ],
    "mdb": "2707",
    "vehiclesAtProbe": 0
  },
  {
    "id": "southeastern-pennsylvania-transportation",
    "provider": "Southeastern Pennsylvania Transportation Authority (SEPTA)",
    "country": "US",
    "region": "Philadelphia",
    "url": "https://www3.septa.org/gtfsrt/septarail-pa-us/Vehicle/rtVehiclePosition.pb",
    "bbox": [
      -75.7636,
      39.6706,
      -74.7049,
      40.3064
    ],
    "center": [
      -75.1616,
      40.1116
    ],
    "core": [
      -75.4706,
      39.7799,
      -74.7349,
      40.2378
    ],
    "license": "https://www3.septa.org/developer/",
    "mdb": "3060",
    "vehiclesAtProbe": 21
  },
  {
    "id": "southeastern-pennsylvania-transportation-3063",
    "provider": "Southeastern Pennsylvania Transportation Authority (SEPTA)",
    "country": "US",
    "region": "Philadelphia",
    "url": "https://www3.septa.org/gtfsrt/septa-pa-us/Vehicle/rtVehiclePosition.pb",
    "bbox": [
      -75.8347,
      39.8123,
      -74.7542,
      40.334
    ],
    "center": [
      -75.1808,
      39.9835
    ],
    "core": [
      -75.3218,
      39.8944,
      -75.0542,
      40.1208
    ],
    "license": "https://www3.septa.org/developer/",
    "mdb": "3063",
    "vehiclesAtProbe": 636
  },
  {
    "id": "spirit-bus",
    "provider": "Spirit Bus",
    "country": "US",
    "region": "Monterey Park",
    "url": "https://passio3.com/montereyp/passioTransit/gtfs/realtime/vehiclePositions",
    "bbox": [
      -118.1688,
      34.0351,
      -118.1087,
      34.0697
    ],
    "center": [
      -118.1388,
      34.0524
    ],
    "core": [
      -118.1688,
      34.0351,
      -118.1087,
      34.0697
    ],
    "mdb": "2221",
    "vehiclesAtProbe": 0
  },
  {
    "id": "springfield-mass-transit-district-smtd",
    "provider": "Springfield Mass Transit District (SMTD)",
    "country": "US",
    "region": "Springfield",
    "url": "http://ride.smtd.org/gtfsrt/vehicles",
    "bbox": [
      -89.7584,
      39.6678,
      -89.527,
      39.8986
    ],
    "center": [
      -89.6433,
      39.7915
    ],
    "core": [
      -89.6633,
      39.7715,
      -89.6233,
      39.8115
    ],
    "license": "https://www.smtd.org/gtfs-information/",
    "mdb": "1781",
    "vehiclesAtProbe": 1
  },
  {
    "id": "stanislaus-regional-transit-authority-st",
    "provider": "Stanislaus Regional Transit Authority (StanRTA)",
    "country": "US",
    "region": "Modesto",
    "url": "https://max.availtec.com/InfoPoint/GTFS-Realtime.ashx?Type=VehiclePosition",
    "bbox": [
      -121.899,
      37.2571,
      -120.7495,
      37.9549
    ],
    "center": [
      -120.9481,
      37.6387
    ],
    "core": [
      -121.6483,
      37.4872,
      -120.8435,
      37.7534
    ],
    "mdb": "1614",
    "vehiclesAtProbe": 4
  },
  {
    "id": "staten-island-railway",
    "provider": "Staten Island Railway",
    "country": "US",
    "region": "New York City",
    "url": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-si",
    "bbox": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "center": [
      -74.0037,
      40.7079
    ],
    "core": [
      -74.252,
      40.5128,
      -73.7554,
      40.9031
    ],
    "license": "https://api.mta.info/#/DataFeedAgreement",
    "mdb": "1637",
    "vehiclesAtProbe": 0
  },
  {
    "id": "tompkins-consolidated-area-transit-tcat",
    "provider": "Tompkins Consolidated Area Transit (TCAT)",
    "country": "US",
    "region": "Ithaca",
    "url": "https://realtimetcatbus.availtec.com/InfoPoint/GTFS-Realtime.ashx?&Type=VehiclePosition&serverid=0",
    "bbox": [
      -76.6781,
      42.3279,
      -76.2809,
      42.5907
    ],
    "center": [
      -76.4817,
      42.4516
    ],
    "core": [
      -76.5178,
      42.4174,
      -76.4541,
      42.4768
    ],
    "mdb": "1649",
    "vehiclesAtProbe": 6
  },
  {
    "id": "transit-authority-of-river-city-tarc",
    "provider": "Transit Authority of River City (TARC)",
    "country": "US",
    "region": "Louisville",
    "url": "https://tarc.rideralerts.com/InfoPoint/GTFS-realtime.ashx?Type=VehiclePosition",
    "bbox": [
      -85.9043,
      38.0564,
      -85.503,
      38.3833
    ],
    "center": [
      -85.7688,
      38.2451
    ],
    "core": [
      -85.7897,
      38.2238,
      -85.7488,
      38.2651
    ],
    "mdb": "2665",
    "vehiclesAtProbe": 2
  },
  {
    "id": "university-of-minnesota",
    "provider": "University of Minnesota",
    "country": "US",
    "region": "Minneapolis",
    "url": "https://data.peaktransit.com/gtfsrt/88/VehiclePosition.pb",
    "bbox": [
      -94.1574,
      44.7255,
      -92.8059,
      45.5601
    ],
    "center": [
      -93.2287,
      44.9736
    ],
    "core": [
      -93.2657,
      44.9503,
      -93.2057,
      44.9986
    ],
    "mdb": "3528",
    "vehiclesAtProbe": 4
  },
  {
    "id": "valley-metro",
    "provider": "Valley Metro",
    "country": "US",
    "region": "Phoenix",
    "url": "https://app.mecatran.com/utw/ws/gtfsfeed/vehicles/valleymetro?apiKey=4f22263f69671d7f49726c3011333e527368211f",
    "bbox": [
      -112.8722,
      32.3827,
      -111.6347,
      33.7433
    ],
    "center": [
      -112.0506,
      33.4483
    ],
    "core": [
      -112.2477,
      33.3573,
      -111.7187,
      33.6605
    ],
    "license": "https://phoenixopendata.com/dataset/valley-metro-bus-schedule/resource/28ccc0a5-49c8-495c-b91f-193de5ce2cb7",
    "mdb": "1722",
    "vehiclesAtProbe": 380
  },
  {
    "id": "valley-regional-transit",
    "provider": "Valley Regional Transit",
    "country": "US",
    "region": "Boise",
    "url": "https://s3.amazonaws.com/etatransit.gtfs/valleyregionaltransit.etaspot.net/position_updates.pb",
    "bbox": [
      -116.286,
      43.5904,
      -116.186,
      43.6904
    ],
    "center": [
      -116.236,
      43.6404
    ],
    "core": [
      -116.256,
      43.6204,
      -116.216,
      43.6604
    ],
    "license": "https://www.valleyregionaltransit.org/about-us/resources/",
    "mdb": "2454",
    "vehiclesAtProbe": 0
  },
  {
    "id": "via-mobility",
    "provider": "Via Mobility",
    "country": "US",
    "region": "Colorado",
    "url": "https://passio3.com/viaboulder/passioTransit/gtfs/realtime/vehiclePositions",
    "bbox": [
      -105.5948,
      39.9304,
      -105.1694,
      40.0633
    ],
    "center": [
      -105.3821,
      39.9969
    ],
    "core": [
      -105.5948,
      39.9304,
      -105.1694,
      40.0633
    ],
    "mdb": "2398",
    "vehiclesAtProbe": 0
  },
  {
    "id": "votran",
    "provider": "Votran",
    "country": "US",
    "region": "Daytona Beach",
    "url": "http://realtimevotran.availtec.com/infopoint/GTFS-Realtime.ashx?&Type=VehiclePosition",
    "bbox": [
      -81.5068,
      28.856,
      -80.8474,
      29.384
    ],
    "center": [
      -81.1771,
      29.12
    ],
    "core": [
      -81.5068,
      28.856,
      -80.8474,
      29.384
    ],
    "license": "http://www.votran.org/about-us/data.stml",
    "mdb": "1740",
    "vehiclesAtProbe": 0
  },
  {
    "id": "autolinee-federico",
    "provider": "Autolinee Federico",
    "country": "",
    "region": "",
    "url": "https://autolineefederico.selfip.com:8080/gtfs-rt/vehicle_positions.pb",
    "bbox": [
      15.9444,
      38.4279,
      16.6377,
      38.9625
    ],
    "center": [
      16.5476,
      38.6559
    ],
    "core": [
      15.9744,
      38.4579,
      16.6077,
      38.9325
    ],
    "mdb": "3118",
    "vehiclesAtProbe": 3
  },
  {
    "id": "basmy-alor-setar",
    "provider": "BAS.MY Alor Setar",
    "country": "",
    "region": "",
    "url": "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-alor-setar",
    "bbox": [
      100.2883,
      5.5389,
      100.6599,
      6.3185
    ],
    "center": [
      100.4138,
      6.1067
    ],
    "core": [
      100.3334,
      5.6188,
      100.5408,
      6.2777
    ],
    "mdb": "3168",
    "vehiclesAtProbe": 43
  },
  {
    "id": "basmy-johor-bahru",
    "provider": "BAS.MY Johor Bahru",
    "country": "",
    "region": "",
    "url": "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-johor",
    "bbox": [
      103.5222,
      1.3101,
      103.9859,
      1.7791
    ],
    "center": [
      103.7567,
      1.4948
    ],
    "core": [
      103.565,
      1.4359,
      103.9196,
      1.6759
    ],
    "mdb": "3174",
    "vehiclesAtProbe": 78
  },
  {
    "id": "basmy-kangar",
    "provider": "BAS.MY Kangar",
    "country": "",
    "region": "",
    "url": "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-kangar",
    "bbox": [
      100.0893,
      6.0726,
      100.4783,
      6.6997
    ],
    "center": [
      100.2706,
      6.4309
    ],
    "core": [
      100.1624,
      6.1201,
      100.4452,
      6.6613
    ],
    "mdb": "3167",
    "vehiclesAtProbe": 23
  },
  {
    "id": "basmy-kota-bharu",
    "provider": "BAS.MY Kota Bharu",
    "country": "",
    "region": "",
    "url": "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-kota-bharu",
    "bbox": [
      101.8093,
      4.9089,
      102.6486,
      6.2829
    ],
    "center": [
      102.2394,
      6.0993
    ],
    "core": [
      101.9529,
      5.7059,
      102.463,
      6.2291
    ],
    "mdb": "3169",
    "vehiclesAtProbe": 59
  },
  {
    "id": "basmy-kuala-terengganu",
    "provider": "BAS.MY Kuala Terengganu",
    "country": "",
    "region": "",
    "url": "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-kuala-terengganu",
    "bbox": [
      102.8987,
      5.0207,
      103.2556,
      5.5829
    ],
    "center": [
      103.1371,
      5.3281
    ],
    "core": [
      102.9911,
      5.185,
      103.2238,
      5.4703
    ],
    "mdb": "3170",
    "vehiclesAtProbe": 28
  },
  {
    "id": "basmy-kuching",
    "provider": "BAS.MY Kuching",
    "country": "",
    "region": "",
    "url": "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-kuching",
    "bbox": [
      110.1048,
      1.116,
      110.6167,
      1.7094
    ],
    "center": [
      110.3422,
      1.5374
    ],
    "core": [
      110.2377,
      1.2884,
      110.4761,
      1.6229
    ],
    "mdb": "3152",
    "vehiclesAtProbe": 43
  },
  {
    "id": "basmy-melaka",
    "provider": "BAS.MY Melaka",
    "country": "",
    "region": "",
    "url": "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-melaka",
    "bbox": [
      102.0476,
      2.1375,
      102.4116,
      2.5119
    ],
    "center": [
      102.2482,
      2.2376
    ],
    "core": [
      102.138,
      2.1739,
      102.3117,
      2.4816
    ],
    "mdb": "3173",
    "vehiclesAtProbe": 31
  },
  {
    "id": "basmy-seremban-a",
    "provider": "BAS.MY Seremban A",
    "country": "",
    "region": "",
    "url": "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-seremban-a",
    "bbox": [
      101.6314,
      2.4177,
      102.2814,
      2.8995
    ],
    "center": [
      101.9045,
      2.7255
    ],
    "core": [
      101.6659,
      2.5131,
      102.1659,
      2.8429
    ],
    "mdb": "3171",
    "vehiclesAtProbe": 22
  },
  {
    "id": "basmy-seremban-b",
    "provider": "BAS.MY Seremban B",
    "country": "",
    "region": "",
    "url": "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-seremban-b",
    "bbox": [
      101.7422,
      2.3978,
      102.4545,
      2.9551
    ],
    "center": [
      101.9926,
      2.7208
    ],
    "core": [
      101.7726,
      2.5043,
      102.4232,
      2.8553
    ],
    "mdb": "3172",
    "vehiclesAtProbe": 24
  },
  {
    "id": "butte-regional-transit-b-line",
    "provider": "Butte Regional Transit (B-Line)",
    "country": "",
    "region": "",
    "url": "https://planmyride.blinetransit.com/gtfsrealtime/GTFS_VehiclePositions.pb",
    "bbox": [
      -121.9326,
      39.6788,
      -121.7795,
      39.797
    ],
    "center": [
      -121.8424,
      39.7456
    ],
    "core": [
      -121.9026,
      39.7088,
      -121.8095,
      39.767
    ],
    "mdb": "2428",
    "vehiclesAtProbe": 0
  },
  {
    "id": "champaign-urbana-mass-transit-district",
    "provider": "Champaign-Urbana Mass Transit District",
    "country": "",
    "region": "",
    "url": "https://gtfs-rt.mtd.org/vehicle-positions",
    "bbox": [
      -88.3056,
      40.0197,
      -88.1457,
      40.1927
    ],
    "center": [
      -88.23,
      40.1103
    ],
    "core": [
      -88.2702,
      40.0708,
      -88.1836,
      40.1434
    ],
    "mdb": "2889",
    "vehiclesAtProbe": 21
  },
  {
    "id": "motionbuscard",
    "provider": "motionbuscard",
    "country": "",
    "region": "",
    "url": "http://20.19.98.194:8328/Api/api/gtfs-realtime",
    "bbox": [
      32.3461,
      34.6014,
      34.1155,
      35.2226
    ],
    "center": [
      33.3581,
      34.987
    ],
    "core": [
      32.4021,
      34.6496,
      34.0587,
      35.1904
    ],
    "mdb": "1920",
    "vehiclesAtProbe": 154
  },
  {
    "id": "tango-bus",
    "provider": "Tango Bus",
    "country": "",
    "region": "",
    "url": "http://185.220.72.38:8085/ProfilGtfsRt2_0RSProducer-TANGO/VehiclePosition.pb",
    "bbox": [
      4.2737,
      43.7734,
      4.3737,
      43.8734
    ],
    "center": [
      4.3237,
      43.8234
    ],
    "core": [
      4.3037,
      43.8034,
      4.3437,
      43.8434
    ],
    "license": "https://www.data.gouv.fr/pages/legal/licences/etalab-2.0",
    "mdb": "3466",
    "vehiclesAtProbe": 1
  },
  {
    "id": "tep-parma",
    "provider": "TEP PARMA",
    "country": "",
    "region": "",
    "url": "https://s3.eu-south-1.amazonaws.com/temporeale.cl.tep.pr.it/temporeale/vehicle_positions.pb",
    "bbox": [
      10.2277,
      44.7202,
      10.4062,
      44.896
    ],
    "center": [
      10.3347,
      44.7969
    ],
    "core": [
      10.2577,
      44.7502,
      10.3762,
      44.866
    ],
    "mdb": "3452",
    "vehiclesAtProbe": 10
  },
  {
    "id": "tukebusz",
    "provider": "Tükebusz",
    "country": "",
    "region": "",
    "url": "http://menobusz.tukebusz.hu:30080/mobilapp/GTFS/RTx_positions.x",
    "bbox": [
      18.1386,
      45.9826,
      18.3934,
      46.1771
    ],
    "center": [
      18.2304,
      46.072
    ],
    "core": [
      18.174,
      46.0156,
      18.3325,
      46.1319
    ],
    "mdb": "3120",
    "vehiclesAtProbe": 21
  },
  {
    "id": "university-of-georgia",
    "provider": "University of Georgia",
    "country": "",
    "region": "",
    "url": "https://passio3.com/uga/passioTransit/gtfs/realtime/vehiclePositions",
    "bbox": [
      -83.4281,
      33.8779,
      -83.3256,
      34.0077
    ],
    "center": [
      -83.3756,
      33.9577
    ],
    "core": [
      -83.3981,
      33.9079,
      -83.3556,
      33.9777
    ],
    "mdb": "2619",
    "vehiclesAtProbe": 2
  }
];
