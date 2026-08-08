/**
 * OSIRIS — Airport Database with Dynamic Fallback
 * ~350 hardcoded airports + dynamic lookup cache for unknowns.
 * Uses ADSBDB airport API as fallback for codes not in our local DB.
 */

export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
}

// Indexed by ICAO code (primary key for ATC/ADS-B data)
const AIRPORTS_BY_ICAO: Record<string, Airport> = {};
// Indexed by IATA code (fallback)
const AIRPORTS_BY_IATA: Record<string, Airport> = {};

const RAW: [string, string, string, string, string, number, number][] = [
  // North America — US
  ['ATL','KATL','Hartsfield-Jackson','Atlanta','US',33.6367,-84.4281],
  ['LAX','KLAX','Los Angeles Intl','Los Angeles','US',33.9425,-118.4081],
  ['ORD','KORD','O\'Hare Intl','Chicago','US',41.9742,-87.9073],
  ['DFW','KDFW','Dallas/Fort Worth','Dallas','US',32.8998,-97.0403],
  ['DEN','KDEN','Denver Intl','Denver','US',39.8561,-104.6737],
  ['JFK','KJFK','John F Kennedy','New York','US',40.6399,-73.7787],
  ['SFO','KSFO','San Francisco Intl','San Francisco','US',37.6213,-122.3790],
  ['SEA','KSEA','Seattle-Tacoma','Seattle','US',47.4502,-122.3088],
  ['LAS','KLAS','Harry Reid Intl','Las Vegas','US',36.0840,-115.1537],
  ['MCO','KMCO','Orlando Intl','Orlando','US',28.4312,-81.3081],
  ['MIA','KMIA','Miami Intl','Miami','US',25.7959,-80.2870],
  ['EWR','KEWR','Newark Liberty','Newark','US',40.6895,-74.1745],
  ['CLT','KCLT','Charlotte Douglas','Charlotte','US',35.2140,-80.9431],
  ['PHX','KPHX','Phoenix Sky Harbor','Phoenix','US',33.4373,-112.0078],
  ['IAH','KIAH','George Bush Intercontinental','Houston','US',29.9902,-95.3368],
  ['MSP','KMSP','Minneapolis-Saint Paul','Minneapolis','US',44.8848,-93.2223],
  ['DTW','KDTW','Detroit Metropolitan','Detroit','US',42.2124,-83.3534],
  ['BOS','KBOS','Logan Intl','Boston','US',42.3656,-71.0096],
  ['FLL','KFLL','Fort Lauderdale-Hollywood','Fort Lauderdale','US',26.0726,-80.1527],
  ['LGA','KLGA','LaGuardia','New York','US',40.7769,-73.8740],
  ['BWI','KBWI','Baltimore/Washington','Baltimore','US',39.1754,-76.6684],
  ['IAD','KIAD','Washington Dulles','Washington','US',38.9445,-77.4558],
  ['DCA','KDCA','Reagan National','Washington','US',38.8521,-77.0377],
  ['SAN','KSAN','San Diego Intl','San Diego','US',32.7336,-117.1897],
  ['TPA','KTPA','Tampa Intl','Tampa','US',27.9755,-82.5332],
  ['PDX','KPDX','Portland Intl','Portland','US',45.5887,-122.5975],
  ['SLC','KSLC','Salt Lake City Intl','Salt Lake City','US',40.7884,-111.9778],
  ['STL','KSTL','St Louis Lambert','St Louis','US',38.7487,-90.3700],
  ['HNL','PHNL','Daniel K Inouye','Honolulu','US',21.3187,-157.9225],
  ['AUS','KAUS','Austin-Bergstrom','Austin','US',30.1945,-97.6699],
  ['BNA','KBNA','Nashville Intl','Nashville','US',36.1263,-86.6774],
  ['RDU','KRDU','Raleigh-Durham','Raleigh','US',35.8776,-78.7875],
  ['MCI','KMCI','Kansas City Intl','Kansas City','US',39.2976,-94.7139],
  ['PIT','KPIT','Pittsburgh Intl','Pittsburgh','US',40.4915,-80.2329],
  ['SMF','KSMF','Sacramento Intl','Sacramento','US',38.6954,-121.5908],
  ['IND','KIND','Indianapolis Intl','Indianapolis','US',39.7173,-86.2944],
  ['CLE','KCLE','Cleveland Hopkins','Cleveland','US',41.4117,-81.8498],
  ['ANC','PANC','Ted Stevens','Anchorage','US',61.1744,-149.9964],
  ['OAK','KOAK','Oakland Intl','Oakland','US',37.7213,-122.2208],
  ['SJC','KSJC','San José Mineta','San José','US',37.3626,-121.9291],
  ['RSW','KRSW','Southwest Florida','Fort Myers','US',26.5362,-81.7552],
  ['MDW','KMDW','Midway','Chicago','US',41.7868,-87.7522],
  ['HOU','KHOU','Hobby','Houston','US',29.6454,-95.2789],
  ['DAL','KDAL','Love Field','Dallas','US',32.8471,-96.8518],
  ['PBI','KPBI','Palm Beach Intl','West Palm Beach','US',26.6832,-80.0956],
  ['JAX','KJAX','Jacksonville Intl','Jacksonville','US',30.4941,-81.6879],
  ['ABQ','KABQ','Sunport','Albuquerque','US',35.0402,-106.6091],
  ['OMA','KOMA','Eppley Airfield','Omaha','US',41.3032,-95.8941],
  ['MKE','KMKE','Mitchell Intl','Milwaukee','US',42.9472,-87.8966],
  ['CVG','KCVG','Cincinnati/Northern Kentucky','Cincinnati','US',39.0489,-84.6678],
  ['CMH','KCMH','John Glenn','Columbus','US',39.9980,-82.8919],
  ['SAT','KSAT','San Antonio Intl','San Antonio','US',29.5337,-98.4698],
  ['OGG','PHOG','Kahului','Maui','US',20.8986,-156.4305],
  ['LIH','PHLI','Lihue','Kauai','US',21.9760,-159.3390],
  ['KOA','PHKO','Kona Intl','Kona','US',19.7388,-156.0456],
  ['BUF','KBUF','Buffalo Niagara','Buffalo','US',42.9405,-78.7322],
  ['PVD','KPVD','T.F. Green','Providence','US',41.7241,-71.4283],
  ['RNO','KRNO','Reno-Tahoe','Reno','US',39.4991,-119.7681],
  ['TUS','KTUS','Tucson Intl','Tucson','US',32.1161,-110.9410],
  ['SDF','KSDF','Louisville Muhammad Ali','Louisville','US',38.1744,-85.7360],
  ['BDL','KBDL','Bradley Intl','Hartford','US',41.9389,-72.6832],
  ['ONT','KONT','Ontario Intl','Ontario','US',34.0560,-117.6012],
  ['SNA','KSNA','John Wayne','Orange County','US',33.6757,-117.8682],
  ['BUR','KBUR','Hollywood Burbank','Burbank','US',34.2007,-118.3585],
  ['MSY','KMSY','Louis Armstrong','New Orleans','US',29.9934,-90.2580],
  ['RIC','KRIC','Richmond Intl','Richmond','US',37.5052,-77.3197],
  ['ORF','KORF','Norfolk Intl','Norfolk','US',36.8946,-76.2012],
  ['MEM','KMEM','Memphis Intl','Memphis','US',35.0424,-89.9767],
  // North America — Canada
  ['YYZ','CYYZ','Toronto Pearson','Toronto','CA',43.6777,-79.6248],
  ['YVR','CYVR','Vancouver Intl','Vancouver','CA',49.1947,-123.1790],
  ['YUL','CYUL','Montréal Trudeau','Montréal','CA',45.4706,-73.7408],
  ['YYC','CYYC','Calgary Intl','Calgary','CA',51.1215,-114.0076],
  ['YOW','CYOW','Ottawa Macdonald-Cartier','Ottawa','CA',45.3225,-75.6692],
  ['YEG','CYEG','Edmonton Intl','Edmonton','CA',53.3097,-113.5800],
  ['YHZ','CYHZ','Halifax Stanfield','Halifax','CA',44.8808,-63.5085],
  ['YWG','CYWG','Winnipeg Intl','Winnipeg','CA',49.9100,-97.2399],
  ['YQB','CYQB','Québec City Jean Lesage','Québec City','CA',46.7911,-71.3933],
  ['YXE','CYXE','Saskatoon John G. Diefenbaker','Saskatoon','CA',52.1708,-106.6999],
  ['YQR','CYQR','Regina Intl','Regina','CA',50.4319,-104.6658],
  ['YXU','CYXU','London Intl','London','CA',43.0336,-81.1508],
  ['YKF','CYKF','Region of Waterloo','Kitchener','CA',43.4608,-80.3786],
  // North America — Mexico
  ['MEX','MMMX','Mexico City Intl','Mexico City','MX',19.4363,-99.0721],
  ['CUN','MMUN','Cancún Intl','Cancún','MX',21.0365,-86.8771],
  ['GDL','MMGL','Guadalajara Intl','Guadalajara','MX',20.5218,-103.3113],
  ['MTY','MMMY','Monterrey Intl','Monterrey','MX',25.7785,-100.1069],
  ['SJD','MMSD','Los Cabos','San José del Cabo','MX',23.1518,-109.7215],
  ['PVR','MMPR','Licenciado Gustavo Díaz Ordaz','Puerto Vallarta','MX',20.6801,-105.2542],
  // Europe — UK
  ['LHR','EGLL','Heathrow','London','GB',51.4700,-0.4543],
  ['LGW','EGKK','Gatwick','London','GB',51.1481,-0.1903],
  ['STN','EGSS','Stansted','London','GB',51.8850,0.2350],
  ['MAN','EGCC','Manchester','Manchester','GB',53.3537,-2.2750],
  ['EDI','EGPH','Edinburgh','Edinburgh','GB',55.9508,-3.3725],
  ['BHX','EGBB','Birmingham','Birmingham','GB',52.4539,-1.7480],
  ['BRS','EGGD','Bristol','Bristol','GB',51.3827,-2.7191],
  ['LTN','EGGW','Luton','London','GB',51.8747,-0.3683],
  ['GLA','EGPF','Glasgow','Glasgow','GB',55.8642,-4.4331],
  ['NCL','EGNT','Newcastle','Newcastle','GB',55.0375,-1.6917],
  ['LPL','EGGP','John Lennon','Liverpool','GB',53.3336,-2.8497],
  ['ABZ','EGPD','Aberdeen','Aberdeen','GB',57.2019,-2.1978],
  ['BFS','EGAA','Belfast Intl','Belfast','GB',54.6575,-6.2158],
  // Europe — France
  ['CDG','LFPG','Charles de Gaulle','Paris','FR',49.0097,2.5479],
  ['ORY','LFPO','Orly','Paris','FR',48.7233,2.3794],
  ['NCE','LFMN','Nice Côte d\'Azur','Nice','FR',43.6584,7.2159],
  ['LYS','LFLL','Lyon-Saint Exupéry','Lyon','FR',45.7256,5.0811],
  ['MRS','LFML','Marseille Provence','Marseille','FR',43.4393,5.2214],
  ['TLS','LFBO','Blagnac','Toulouse','FR',43.6291,1.3638],
  ['BOD','LFBD','Mérignac','Bordeaux','FR',44.8283,-0.7156],
  ['NTE','LFRS','Atlantique','Nantes','FR',47.1532,-1.6108],
  // Europe — Germany
  ['FRA','EDDF','Frankfurt','Frankfurt','DE',50.0333,8.5706],
  ['MUC','EDDM','Munich','Munich','DE',48.3538,11.7861],
  ['BER','EDDB','Berlin Brandenburg','Berlin','DE',52.3667,13.5033],
  ['DUS','EDDL','Düsseldorf','Düsseldorf','DE',51.2895,6.7668],
  ['HAM','EDDH','Hamburg','Hamburg','DE',53.6304,9.9882],
  ['STR','EDDS','Stuttgart','Stuttgart','DE',48.6899,9.2220],
  ['CGN','EDDK','Cologne Bonn','Cologne','DE',50.8659,7.1427],
  ['HAJ','EDDV','Hannover','Hannover','DE',52.4611,9.6850],
  ['NUE','EDDN','Nuremberg','Nuremberg','DE',49.4987,11.0669],
  ['LEJ','EDDP','Leipzig/Halle','Leipzig','DE',51.4324,12.2416],
  // Europe — Netherlands / Belgium / Luxembourg
  ['AMS','EHAM','Schiphol','Amsterdam','NL',52.3086,4.7639],
  ['BRU','EBBR','Brussels','Brussels','BE',50.9014,4.4844],
  ['LUX','ELLX','Luxembourg','Luxembourg','LU',49.6233,6.2044],
  ['EIN','EHEH','Eindhoven','Eindhoven','NL',51.4501,5.3746],
  ['RTM','EHRD','Rotterdam The Hague','Rotterdam','NL',51.9569,4.4372],
  // Europe — Spain / Portugal
  ['MAD','LEMD','Adolfo Suárez Madrid–Barajas','Madrid','ES',40.4936,-3.5668],
  ['BCN','LEBL','El Prat','Barcelona','ES',41.2971,2.0785],
  ['AGP','LEMG','Málaga','Málaga','ES',36.6749,-4.4991],
  ['PMI','LEPA','Palma de Mallorca','Palma','ES',39.5517,2.7388],
  ['ALC','LEAL','Alicante-Elche','Alicante','ES',38.2822,-0.5582],
  ['SVQ','LEZL','San Pablo','Seville','ES',37.4180,-5.8931],
  ['TFS','GCTS','Tenerife Sur','Tenerife','ES',28.0445,-16.5725],
  ['LPA','GCLP','Gran Canaria','Las Palmas','ES',27.9319,-15.3866],
  ['BIO','LEBB','Bilbao','Bilbao','ES',43.3011,-2.9106],
  ['VLC','LEVC','Valencia','Valencia','ES',39.4893,-0.4816],
  ['LIS','LPPT','Humberto Delgado','Lisbon','PT',38.7756,-9.1354],
  ['OPO','LPPR','Francisco Sá Carneiro','Porto','PT',41.2481,-8.6814],
  ['FAO','LPFR','Faro','Faro','PT',37.0144,-7.9659],
  // Europe — Italy
  ['FCO','LIRF','Fiumicino','Rome','IT',41.8003,12.2389],
  ['MXP','LIMC','Malpensa','Milan','IT',45.6306,8.7281],
  ['VCE','LIPZ','Marco Polo','Venice','IT',45.5053,12.3519],
  ['NAP','LIRN','Napoli Capodichino','Naples','IT',40.8861,14.2908],
  ['BGY','LIME','Orio al Serio','Bergamo','IT',45.6739,9.7042],
  ['BLQ','LIPE','Guglielmo Marconi','Bologna','IT',44.5354,11.2887],
  ['CTA','LICC','Fontanarossa','Catania','IT',37.4668,15.0664],
  ['PMO','LICJ','Falcone–Borsellino','Palermo','IT',38.1760,13.0910],
  ['FLR','LIRQ','Peretola','Florence','IT',43.8100,11.2051],
  ['PSA','LIRP','Galileo Galilei','Pisa','IT',43.6839,10.3927],
  ['TRN','LIMF','Caselle','Turin','IT',45.2008,7.6496],
  // Europe — Scandinavia
  ['CPH','EKCH','Copenhagen','Copenhagen','DK',55.6181,12.6560],
  ['ARN','ESSA','Arlanda','Stockholm','SE',59.6519,17.9186],
  ['OSL','ENGM','Gardermoen','Oslo','NO',60.1939,11.1004],
  ['HEL','EFHK','Helsinki-Vantaa','Helsinki','FI',60.3172,24.9633],
  ['BGO','ENBR','Bergen Flesland','Bergen','NO',60.2934,5.2181],
  ['GOT','ESGG','Landvetter','Gothenburg','SE',57.6628,12.2798],
  ['TRD','ENVA','Trondheim Værnes','Trondheim','NO',63.4578,10.9240],
  ['SVG','ENZV','Stavanger Sola','Stavanger','NO',58.8767,5.6378],
  // Europe — Eastern
  ['WAW','EPWA','Chopin','Warsaw','PL',52.1657,20.9671],
  ['KRK','EPKK','John Paul II','Kraków','PL',50.0777,19.7848],
  ['GDN','EPGD','Lech Wałęsa','Gdańsk','PL',54.3776,18.4662],
  ['WRO','EPWR','Copernicus','Wrocław','PL',51.1027,16.8858],
  ['PRG','LKPR','Václav Havel','Prague','CZ',50.1008,14.2600],
  ['BUD','LHBP','Budapest Liszt Ferenc','Budapest','HU',47.4298,19.2611],
  ['VIE','LOWW','Vienna Intl','Vienna','AT',48.1103,16.5697],
  ['ZRH','LSZH','Zürich','Zürich','CH',47.4647,8.5492],
  ['GVA','LSGG','Geneva','Geneva','CH',46.2381,6.1089],
  ['BSL','LFSB','EuroAirport','Basel/Mulhouse','CH',47.5896,7.5299],
  ['OTP','LROP','Henri Coandă','Bucharest','RO',44.5711,26.0850],
  ['SOF','LBSF','Sofia','Sofia','BG',42.6952,23.4114],
  ['BEG','LYBE','Nikola Tesla','Belgrade','RS',44.8184,20.3091],
  ['ZAG','LDZA','Franjo Tuđman','Zagreb','HR',45.7429,16.0688],
  ['LJU','LJLJ','Jože Pučnik','Ljubljana','SI',46.2237,14.4576],
  ['SKP','LWSK','Alexander the Great','Skopje','MK',41.9616,21.6214],
  ['TIA','LATI','Nënë Tereza','Tirana','AL',41.4147,19.7206],
  // Europe — Greece / Turkey
  ['ATH','LGAV','Eleftherios Venizelos','Athens','GR',37.9364,23.9445],
  ['SKG','LGTS','Makedonia','Thessaloniki','GR',40.5197,22.9709],
  ['HER','LGIR','Heraklion','Heraklion','GR',35.3397,25.1802],
  ['CFU','LGKR','Ioannis Kapodistrias','Corfu','GR',39.6019,19.9117],
  ['RHO','LGRP','Diagoras','Rhodes','GR',36.4054,28.0862],
  ['JTR','LGSR','Santorini','Santorini','GR',36.3992,25.4793],
  ['IST','LTFM','Istanbul Airport','Istanbul','TR',41.2753,28.7519],
  ['SAW','LTFJ','Sabiha Gökçen','Istanbul','TR',40.8986,29.3092],
  ['AYT','LTAI','Antalya','Antalya','TR',36.8987,30.8005],
  ['ADB','LTBJ','Adnan Menderes','Izmir','TR',38.2924,27.1570],
  ['ESB','LTAC','Esenboğa','Ankara','TR',40.1281,32.9951],
  ['DLM','LTBS','Dalaman','Dalaman','TR',36.7131,28.7925],
  // Europe — Ireland
  ['DUB','EIDW','Dublin','Dublin','IE',53.4213,-6.2700],
  ['SNN','EINN','Shannon','Shannon','IE',52.7020,-8.9248],
  ['ORK','EICK','Cork','Cork','IE',51.8413,-8.4912],
  // Middle East
  ['DXB','OMDB','Dubai Intl','Dubai','AE',25.2528,55.3644],
  ['AUH','OMAA','Abu Dhabi Intl','Abu Dhabi','AE',24.4330,54.6511],
  ['SHJ','OMSJ','Sharjah Intl','Sharjah','AE',25.3286,55.5172],
  ['DOH','OTHH','Hamad Intl','Doha','QA',25.2731,51.6081],
  ['RUH','OERK','King Khalid','Riyadh','SA',24.9576,46.6988],
  ['JED','OEJN','King Abdulaziz','Jeddah','SA',21.6796,39.1565],
  ['DMM','OEDF','King Fahd','Dammam','SA',26.4712,49.7979],
  ['MED','OEMA','Prince Mohammad','Medina','SA',24.5534,39.7051],
  ['TLV','LLBG','Ben Gurion','Tel Aviv','IL',32.0114,34.8867],
  ['AMM','OJAI','Queen Alia','Amman','JO',31.7226,35.9932],
  ['BAH','OBBI','Bahrain Intl','Manama','BH',26.2708,50.6336],
  ['MCT','OOMS','Muscat Intl','Muscat','OM',23.5933,58.2844],
  ['KWI','OKBK','Kuwait Intl','Kuwait City','KW',29.2266,47.9689],
  ['BGW','ORBI','Baghdad Intl','Baghdad','IQ',33.2625,44.2346],
  ['IKA','OIIE','Imam Khomeini','Tehran','IR',35.4161,51.1522],
  // South Asia
  ['DEL','VIDP','Indira Gandhi','Delhi','IN',28.5562,77.1000],
  ['BOM','VABB','Chhatrapati Shivaji','Mumbai','IN',19.0896,72.8656],
  ['BLR','VOBL','Kempegowda','Bengaluru','IN',13.1986,77.7066],
  ['MAA','VOMM','Chennai Intl','Chennai','IN',12.9941,80.1709],
  ['HYD','VOHS','Rajiv Gandhi','Hyderabad','IN',17.2403,78.4294],
  ['CCU','VECC','Netaji Subhas Chandra Bose','Kolkata','IN',22.6547,88.4467],
  ['COK','VOCI','Cochin Intl','Kochi','IN',10.1520,76.4019],
  ['GOI','VOGO','Dabolim','Goa','IN',15.3808,73.8314],
  ['AMD','VAAH','Sardar Vallabhbhai Patel','Ahmedabad','IN',23.0772,72.6347],
  ['PNQ','VAPO','Pune','Pune','IN',18.5822,73.9197],
  ['JAI','VIJP','Jaipur Intl','Jaipur','IN',26.8242,75.8122],
  ['CMB','VCBI','Bandaranaike','Colombo','LK',7.1808,79.8841],
  ['KTM','VNKT','Tribhuvan','Kathmandu','NP',27.6966,85.3591],
  ['DAC','VGHS','Hazrat Shahjalal','Dhaka','BD',23.8433,90.3978],
  ['ISB','OPIS','Islamabad Intl','Islamabad','PK',33.5605,72.8526],
  ['KHI','OPKC','Jinnah Intl','Karachi','PK',24.9065,67.1609],
  ['LHE','OPLA','Allama Iqbal','Lahore','PK',31.5216,74.4036],
  ['MLE','VRMM','Velana Intl','Malé','MV',4.1918,73.5291],
  // East Asia
  ['PEK','ZBAA','Beijing Capital','Beijing','CN',40.0799,116.6031],
  ['PKX','ZBAD','Beijing Daxing','Beijing','CN',39.5098,116.4105],
  ['PVG','ZSPD','Shanghai Pudong','Shanghai','CN',31.1434,121.8052],
  ['SHA','ZSSS','Shanghai Hongqiao','Shanghai','CN',31.1979,121.3364],
  ['CAN','ZGGG','Guangzhou Baiyun','Guangzhou','CN',23.3924,113.2988],
  ['SZX','ZGSZ','Shenzhen Bao\'an','Shenzhen','CN',22.6393,113.8107],
  ['CTU','ZUUU','Chengdu Shuangliu','Chengdu','CN',30.5785,103.9471],
  ['TFU','ZUTF','Chengdu Tianfu','Chengdu','CN',30.3191,104.4451],
  ['CKG','ZUCK','Chongqing Jiangbei','Chongqing','CN',29.7192,106.6417],
  ['XIY','ZLXY','Xi\'an Xianyang','Xi\'an','CN',34.4471,108.7515],
  ['KMG','ZPPP','Kunming Changshui','Kunming','CN',25.1019,102.9292],
  ['HGH','ZSHC','Hangzhou Xiaoshan','Hangzhou','CN',30.2295,120.4344],
  ['WUH','ZHHH','Wuhan Tianhe','Wuhan','CN',30.7838,114.2081],
  ['NKG','ZSNJ','Nanjing Lukou','Nanjing','CN',31.7420,118.8620],
  ['HKG','VHHH','Hong Kong Intl','Hong Kong','HK',22.3089,113.9144],
  ['MFM','VMMC','Macau Intl','Macau','MO',22.1496,113.5920],
  ['NRT','RJAA','Narita','Tokyo','JP',35.7647,140.3864],
  ['HND','RJTT','Haneda','Tokyo','JP',35.5494,139.7798],
  ['KIX','RJBB','Kansai','Osaka','JP',34.4347,135.2441],
  ['ITM','RJOO','Itami','Osaka','JP',34.7855,135.4380],
  ['NGO','RJGG','Chubu Centrair','Nagoya','JP',34.8584,136.8123],
  ['FUK','RJFF','Fukuoka','Fukuoka','JP',33.5859,130.4506],
  ['CTS','RJCC','New Chitose','Sapporo','JP',42.7752,141.6925],
  ['OKA','ROAH','Naha','Okinawa','JP',26.1958,127.6458],
  ['ICN','RKSI','Incheon','Seoul','KR',37.4602,126.4407],
  ['GMP','RKSS','Gimpo','Seoul','KR',37.5586,126.7906],
  ['PUS','RKPK','Gimhae','Busan','KR',35.1796,128.9382],
  ['CJU','RKPC','Jeju','Jeju','KR',33.5113,126.4929],
  ['TPE','RCTP','Taiwan Taoyuan','Taipei','TW',25.0777,121.2325],
  ['TSA','RCSS','Songshan','Taipei','TW',25.0694,121.5517],
  ['ULN','ZMUB','Chinggis Khaan','Ulaanbaatar','MN',47.8431,106.7667],
  // Southeast Asia
  ['SIN','WSSS','Changi','Singapore','SG',1.3502,103.9940],
  ['BKK','VTBS','Suvarnabhumi','Bangkok','TH',13.6900,100.7501],
  ['DMK','VTBD','Don Mueang','Bangkok','TH',13.9126,100.6068],
  ['CNX','VTCC','Chiang Mai','Chiang Mai','TH',18.7668,98.9626],
  ['HKT','VTSP','Phuket','Phuket','TH',8.1132,98.3169],
  ['KUL','WMKK','Kuala Lumpur Intl','Kuala Lumpur','MY',2.7456,101.7099],
  ['PEN','WMKP','Penang','Penang','MY',5.2972,100.2769],
  ['BKI','WBKK','Kota Kinabalu','Kota Kinabalu','MY',5.9372,116.0512],
  ['CGK','WIII','Soekarno-Hatta','Jakarta','ID',-6.1256,106.6559],
  ['DPS','WADD','Ngurah Rai','Bali','ID',-8.7482,115.1672],
  ['SUB','WARR','Juanda','Surabaya','ID',-7.3798,112.7868],
  ['MNL','RPLL','Ninoy Aquino','Manila','PH',14.5086,121.0198],
  ['CEB','RPVM','Mactan-Cebu','Cebu','PH',10.3075,123.9794],
  ['SGN','VVTS','Tan Son Nhat','Ho Chi Minh City','VN',10.8188,106.6520],
  ['HAN','VVNB','Noi Bai','Hanoi','VN',21.2212,105.8072],
  ['DAD','VVDN','Da Nang','Da Nang','VN',16.0439,108.1992],
  ['RGN','VYYY','Yangon Intl','Yangon','MM',16.9073,96.1332],
  ['PNH','VDPP','Phnom Penh','Phnom Penh','KH',11.5466,104.8442],
  ['REP','VDSR','Siem Reap','Siem Reap','KH',13.4107,103.8128],
  ['VTE','VLVT','Wattay','Vientiane','LA',17.9884,102.5633],
  // Oceania
  ['SYD','YSSY','Kingsford Smith','Sydney','AU',-33.9399,151.1753],
  ['MEL','YMML','Tullamarine','Melbourne','AU',-37.6733,144.8433],
  ['BNE','YBBN','Brisbane','Brisbane','AU',-27.3842,153.1175],
  ['PER','YPPH','Perth','Perth','AU',-31.9403,115.9672],
  ['ADL','YPAD','Adelaide','Adelaide','AU',-34.9450,138.5306],
  ['CBR','YSCB','Canberra','Canberra','AU',-35.3069,149.1951],
  ['OOL','YBCG','Gold Coast','Gold Coast','AU',-28.1644,153.5047],
  ['CNS','YBCS','Cairns','Cairns','AU',-16.8858,145.7553],
  ['AKL','NZAA','Auckland','Auckland','NZ',-37.0082,174.7850],
  ['WLG','NZWN','Wellington','Wellington','NZ',-41.3272,174.8053],
  ['CHC','NZCH','Christchurch','Christchurch','NZ',-43.4894,172.5322],
  ['ZQN','NZQN','Queenstown','Queenstown','NZ',-45.0211,168.7392],
  ['NAN','NFFN','Nadi','Nadi','FJ',-17.7554,177.4437],
  ['PPT','NTAA','Faa\'a','Papeete','PF',-17.5537,-149.6064],
  ['NOU','NWWW','La Tontouta','Nouméa','NC',-22.0146,166.2160],
  // Africa
  ['JNB','FAOR','O R Tambo','Johannesburg','ZA',-26.1392,28.2460],
  ['CPT','FACT','Cape Town Intl','Cape Town','ZA',-33.9649,18.6017],
  ['DUR','FALE','King Shaka','Durban','ZA',-29.6144,31.1197],
  ['CAI','HECA','Cairo Intl','Cairo','EG',30.1219,31.4056],
  ['HRG','HEGN','Hurghada','Hurghada','EG',27.1783,33.7994],
  ['SSH','HESH','Sharm el-Sheikh','Sharm el-Sheikh','EG',27.9773,34.3925],
  ['ADD','HAAB','Bole Intl','Addis Ababa','ET',8.9779,38.7993],
  ['NBO','HKJK','Jomo Kenyatta','Nairobi','KE',-1.3192,36.9278],
  ['MBA','HKMO','Moi Intl','Mombasa','KE',-4.0348,39.5942],
  ['LOS','DNMM','Murtala Muhammed','Lagos','NG',6.5774,3.3212],
  ['ABV','DNAA','Nnamdi Azikiwe','Abuja','NG',9.0065,7.2632],
  ['CMN','GMMN','Mohammed V','Casablanca','MA',33.3675,-7.5898],
  ['RAK','GMMX','Ménara','Marrakech','MA',31.6069,-8.0363],
  ['ALG','DAAG','Houari Boumediene','Algiers','DZ',36.6910,3.2154],
  ['TUN','DTTA','Tunis-Carthage','Tunis','TN',36.8510,10.2272],
  ['DAR','HTDA','Julius Nyerere','Dar es Salaam','TZ',-6.8781,39.2026],
  ['ZNZ','HTZA','Abeid Amani Karume','Zanzibar','TZ',-6.2220,39.2249],
  ['ACC','DGAA','Kotoka','Accra','GH',5.6052,-0.1668],
  ['DSS','GOBD','Blaise Diagne','Dakar','SN',14.6710,-17.0728],
  ['EBB','HUEN','Entebbe','Kampala','UG',0.0424,32.4435],
  ['KGL','HRYR','Kigali','Kigali','RW',-1.9686,30.1395],
  ['MPM','FQMA','Maputo','Maputo','MZ',-25.9208,32.5726],
  ['WDH','FYWH','Hosea Kutako','Windhoek','NA',-22.4799,17.4709],
  ['TNR','FMMI','Ivato','Antananarivo','MG',-18.7969,47.4789],
  ['MRU','FIMP','Sir Seewoosagur Ramgoolam','Mauritius','MU',-20.4302,57.6836],
  // South America
  ['GRU','SBGR','Guarulhos','São Paulo','BR',-23.4356,-46.4731],
  ['GIG','SBGL','Galeão','Rio de Janeiro','BR',-22.8100,-43.2506],
  ['BSB','SBBR','Brasília','Brasília','BR',-15.8711,-47.9186],
  ['CGH','SBSP','Congonhas','São Paulo','BR',-23.6261,-46.6564],
  ['CNF','SBCF','Confins','Belo Horizonte','BR',-19.6244,-43.9719],
  ['SSA','SBSV','Deputado Luís Eduardo Magalhães','Salvador','BR',-12.9086,-38.3225],
  ['REC','SBRF','Guararapes','Recife','BR',-8.1265,-34.9236],
  ['FOR','SBFZ','Pinto Martins','Fortaleza','BR',-3.7763,-38.5326],
  ['CWB','SBCT','Afonso Pena','Curitiba','BR',-25.5285,-49.1758],
  ['POA','SBPA','Salgado Filho','Porto Alegre','BR',-29.9944,-51.1714],
  ['EZE','SAEZ','Ministro Pistarini','Buenos Aires','AR',-34.8222,-58.5358],
  ['AEP','SABE','Jorge Newbery','Buenos Aires','AR',-34.5592,-58.4156],
  ['COR','SACO','Pajas Blancas','Córdoba','AR',-31.3236,-64.2081],
  ['SCL','SCEL','Arturo Merino Benítez','Santiago','CL',-33.3930,-70.7858],
  ['BOG','SKBO','El Dorado','Bogotá','CO',4.7016,-74.1469],
  ['MDE','SKRG','José María Córdova','Medellín','CO',6.1645,-75.4231],
  ['CTG','SKCG','Rafael Núñez','Cartagena','CO',10.4424,-75.5130],
  ['LIM','SPJC','Jorge Chávez','Lima','PE',-12.0219,-77.1143],
  ['CUZ','SPZO','Velasco Astete','Cusco','PE',-13.5357,-71.9389],
  ['PTY','MPTO','Tocumen','Panama City','PA',9.0714,-79.3835],
  ['UIO','SEQM','Mariscal Sucre','Quito','EC',-0.1292,-78.3575],
  ['GYE','SEGU','José Joaquín de Olmedo','Guayaquil','EC',-2.1574,-79.8837],
  ['CCS','SVMI','Simón Bolívar','Caracas','VE',10.6031,-66.9906],
  ['MVD','SUMU','Carrasco','Montevideo','UY',-34.8384,-56.0308],
  ['ASU','SGAS','Silvio Pettirossi','Asunción','PY',-25.2400,-57.5200],
  ['VVI','SLVR','Viru Viru','Santa Cruz','BO',-17.6448,-63.1354],
  // Central America / Caribbean
  ['SJO','MROC','Juan Santamaría','San José','CR',9.9939,-84.2088],
  ['SJU','TJSJ','Luis Muñoz Marín','San Juan','PR',18.4394,-66.0018],
  ['NAS','MYNN','Lynden Pindling','Nassau','BS',25.0390,-77.4662],
  ['MBJ','MKJS','Sangster Intl','Montego Bay','JM',18.5037,-77.9134],
  ['HAV','MUHA','José Martí','Havana','CU',22.9892,-82.4091],
  ['KIN','MKJP','Norman Manley','Kingston','JM',17.9357,-76.7875],
  ['PUJ','MDPC','Punta Cana','Punta Cana','DO',18.5674,-68.3634],
  ['SDQ','MDSD','Las Américas','Santo Domingo','DO',18.4297,-69.6689],
  ['GUA','MGGT','La Aurora','Guatemala City','GT',14.5833,-90.5275],
  ['SAL','MSLP','Óscar Arnulfo Romero','San Salvador','SV',13.4409,-89.0557],
  ['SAP','MHLM','Ramón Villeda Morales','San Pedro Sula','HN',15.4526,-87.9236],
  ['MGA','MNMG','Augusto C. Sandino','Managua','NI',12.1415,-86.1682],
  ['BZE','MZBZ','Philip S.W. Goldson','Belize City','BZ',17.5391,-88.3082],
  ['AUA','TNCA','Queen Beatrix','Aruba','AW',12.5014,-70.0152],
  ['CUR','TNCC','Hato','Curaçao','CW',12.1689,-68.9600],
  ['SXM','TNCM','Princess Juliana','St Maarten','SX',18.0410,-63.1089],
  ['POS','TTPP','Piarco','Port of Spain','TT',10.5953,-61.3372],
  ['BGI','TBPB','Grantley Adams','Bridgetown','BB',13.0746,-59.4925],
  // Central Asia / Caucasus
  ['TBS','UGTB','Shota Rustaveli','Tbilisi','GE',41.6692,44.9547],
  ['GYD','UBBB','Heydar Aliyev','Baku','AZ',40.4675,50.0467],
  ['EVN','UDYZ','Zvartnots','Yerevan','AM',40.1473,44.3959],
  ['ALA','UAAA','Almaty','Almaty','KZ',43.3521,77.0405],
  ['NQZ','UACC','Nursultan Nazarbayev','Astana','KZ',51.0222,71.4669],
  ['TAS','UTTT','Islam Karimov','Tashkent','UZ',41.2573,69.2817],
  ['FRU','UAFM','Manas','Bishkek','KG',43.0613,74.4774],
  ['DYU','UTDD','Dushanbe','Dushanbe','TJ',38.5433,68.8250],
  ['ASB','UTAA','Oguz Han','Ashgabat','TM',37.9868,58.3610],
  // Russia
  ['SVO','UUEE','Sheremetyevo','Moscow','RU',55.9726,37.4146],
  ['DME','UUDD','Domodedovo','Moscow','RU',55.4088,37.9063],
  ['VKO','UUWW','Vnukovo','Moscow','RU',55.5915,37.2615],
  ['LED','ULLI','Pulkovo','St Petersburg','RU',59.8003,30.2625],
  ['AER','URSS','Sochi','Sochi','RU',43.4500,39.9566],
  ['SVX','USSS','Koltsovo','Yekaterinburg','RU',56.7431,60.8027],
  ['KZN','UWKD','Kazan','Kazan','RU',55.6062,49.2786],
  ['OVB','UNNT','Tolmachevo','Novosibirsk','RU',55.0126,82.6507],
  ['KJA','UNKL','Yemelyanovo','Krasnoyarsk','RU',56.1729,92.4932],
  ['VVO','UHWW','Vladivostok','Vladivostok','RU',43.3960,132.1483],
  ['IKT','UIII','Irkutsk','Irkutsk','RU',52.2680,104.3889],
];

// Build indexes
for (const [iata, icao, name, city, country, lat, lng] of RAW) {
  const ap: Airport = { iata, icao, name, city, country, lat, lng };
  AIRPORTS_BY_ICAO[icao] = ap;
  // Only index IATA if not already taken (handles duplicate IATA codes)
  if (!AIRPORTS_BY_IATA[iata]) {
    AIRPORTS_BY_IATA[iata] = ap;
  }
}

// ── Dynamic lookup cache (for airports not in our local DB) ──
const dynamicCache = new Map<string, Airport | null>();
const DYNAMIC_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const dynamicCacheTimes = new Map<string, number>();

/**
 * Look up an airport by ICAO or IATA code.
 * Returns null if not found in local database.
 */
export function lookupAirport(code: string): Airport | null {
  if (!code) return null;
  const upper = code.toUpperCase().trim();
  // Check local DB first
  const local = AIRPORTS_BY_ICAO[upper] || AIRPORTS_BY_IATA[upper];
  if (local) return local;
  // Check dynamic cache
  const cached = dynamicCache.get(upper);
  if (cached !== undefined) {
    const ts = dynamicCacheTimes.get(upper) || 0;
    if (Date.now() - ts < DYNAMIC_CACHE_TTL) return cached;
  }
  return null;
}

/**
 * Look up an airport, falling back to ADSBDB API if not in local DB.
 * This is async and should be used in API routes.
 */
export async function lookupAirportAsync(code: string): Promise<Airport | null> {
  if (!code) return null;
  const upper = code.toUpperCase().trim();

  // Check local DB
  const local = AIRPORTS_BY_ICAO[upper] || AIRPORTS_BY_IATA[upper];
  if (local) return local;

  // Check dynamic cache
  const cached = dynamicCache.get(upper);
  if (cached !== undefined) {
    const ts = dynamicCacheTimes.get(upper) || 0;
    if (Date.now() - ts < DYNAMIC_CACHE_TTL) return cached;
  }

  // Try ADSBDB airport API
  try {
    const isICAO = upper.length === 4;
    const url = isICAO
      ? `https://api.adsbdb.com/v0/airport/${upper}`
      : `https://api.adsbdb.com/v0/airport/${upper}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      const ap = data?.response?.airport;
      if (ap?.latitude && ap?.longitude) {
        const airport: Airport = {
          iata: ap.iata_code || '',
          icao: ap.icao || upper,
          name: ap.name || upper,
          city: ap.municipality || ap.name || '',
          country: ap.country_iso_name || '',
          lat: parseFloat(ap.latitude),
          lng: parseFloat(ap.longitude),
        };
        // Cache the result
        dynamicCache.set(upper, airport);
        dynamicCacheTimes.set(upper, Date.now());
        // Also cache by the other code if available
        if (airport.icao && airport.icao !== upper) {
          dynamicCache.set(airport.icao, airport);
          dynamicCacheTimes.set(airport.icao, Date.now());
        }
        if (airport.iata && airport.iata !== upper) {
          dynamicCache.set(airport.iata, airport);
          dynamicCacheTimes.set(airport.iata, Date.now());
        }
        return airport;
      }
    }
  } catch {
    // Silently fail — we'll return null
  }

  // Cache the miss to avoid repeated lookups
  dynamicCache.set(upper, null);
  dynamicCacheTimes.set(upper, Date.now());
  return null;
}

/**
 * Get all airports (for debugging/lookup).
 */
export function getAllAirports(): Airport[] {
  return Object.values(AIRPORTS_BY_ICAO);
}

/**
 * The airport closest to a position, or null if none is within `maxKm`.
 *
 * Used to name the airport a flown leg actually started from. Schedule data is
 * keyed by callsign and routinely returns a different leg of the aircraft's
 * day, so the departure is read back off the track instead of trusted.
 */
export function nearestAirport(lat: number, lng: number, maxKm = 25): Airport | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best: Airport | null = null;
  let bestKm = maxKm;
  // A degree of longitude shrinks toward the poles; without this an airport
  // 25 km away at 60°N measures as 12 km and the wrong one wins.
  const lngScale = Math.cos((lat * Math.PI) / 180);
  for (const ap of Object.values(AIRPORTS_BY_ICAO)) {
    const dy = (ap.lat - lat) * 111.32;
    const dx = (ap.lng - lng) * 111.32 * lngScale;
    const d = Math.hypot(dx, dy);
    if (d < bestKm) {
      bestKm = d;
      best = ap;
    }
  }
  return best;
}

export { AIRPORTS_BY_ICAO, AIRPORTS_BY_IATA };
