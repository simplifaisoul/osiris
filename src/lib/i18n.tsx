'use client';

/* ═══════════════════════════════════════════════════════════════
   OSIRIS — i18n (Русская локаль)
   Простой словарь переводов + хук t(). Локаль по умолчанию: ru.
   Ключи словаря — оригинальные английские строки интерфейса.
   ═══════════════════════════════════════════════════════════════ */

import { useMemo } from 'react';

export type Locale = 'ru' | 'en';

const RU: Record<string, string> = {
  // ── Общие / статусная строка ──
  'GLOBAL INTELLIGENCE PLATFORM': 'ГЛОБАЛЬНАЯ РАЗВЕДЫВАТЕЛЬНАЯ ПЛАТФОРМА',
  'GLOBAL INTELLIGENCE COMMAND': 'КОМАНДНЫЙ ПУНКТ ГЛОБАЛЬНОЙ РАЗВЕДКИ',
  'POWERED BY OSIRIS OPEN SOURCE INTELLIGENCE': 'НА БАЗЕ ОТКРЫТОЙ РАЗВЕДЫВАТЕЛЬНОЙ СИСТЕМЫ OSIRIS',
  'C2 ENGINE: PHYSICAL COMMAND CORE · SENSORS: ORBITAL LATTICE · NET: LYCAN NETWORK':
    'СИУ: КОМАНДНОЕ ЯДРО · ДАТЧИКИ: ОРБИТАЛЬНАЯ СЕТКА · СЕТЬ: LYCAN',
  'SYS:': 'СИСТ:',
  'connecting': 'ПОДКЛЮЧЕНИЕ',
  'connected': 'ПОДКЛЮЧЕНО',
  'error': 'ОШИБКА',
  'SOLAR:': 'СОЛН. АКТИВНОСТЬ:',
  'FEEDS': 'ЛЕНТ',
  'UPTIME:': 'ОНЛАЙН:',
  'SUPPORT PROJECT': 'ПОДДЕРЖАТЬ ПРОЕКТ',
  'SHORTCUTS': 'ГОРЯЧИЕ КЛАВИШИ',
  'FULLSCREEN': 'ПОЛНЫЙ ЭКРАН',
  'SHARE': 'ПОДЕЛИТЬСЯ',
  'RESET VIEW': 'СБРОС ВИДА',
  'Unknown': 'Неизвестно',
  'HOVER MAP': 'НАВЕДИТЕ НА КАРТУ',
  'LOADING...': 'ЗАГРУЗКА...',
  'UTC': 'UTC',
  'No alerts for this filter': 'Нет тревог по этому фильтру',
  '{m} min ago': '{m} мин назад',
  '{h} hours ago': '{h} ч назад',
  '{d} days ago': '{d} дн назад',
  'km': 'км',
  'm': 'м',

  // ── Загрузочный экран ──
  'ESTABLISHING SECURE CONNECTION...': 'УСТАНОВЛЕНИЕ ЗАЩИЩЁННОГО СОЕДИНЕНИЯ...',
  'INITIALIZING FEEDS...': 'ИНИЦИАЛИЗАЦИЯ ЛЕНТОВ ДАННЫХ...',
  'CALIBRATING SENSORS...': 'КАЛИБРОВКА ДАТЧИКОВ...',
  'SYSTEM READY': 'СИСТЕМА ГОТОВА',

  // ── Управление картой ──
  'Switch to 2D Map': 'Переключить на 2D-карту',
  'Switch to 3D Globe': 'Переключить на 3D-глобус',
  '2D MAP': '2D-КАРТА',
  '3D GLOBE': '3D-ГЛОБУС',
  'Satellite View': 'Спутниковый вид',
  'Night View': 'Ночной вид',
  'SATELLITE': 'СПУТНИК',
  'NIGHT MODE': 'НОЧНОЙ РЕЖИМ',

  // ── Досье региона ──
  'REGION DOSSIER': 'ДОСЬЕ РЕГИОНА',
  'COMPILING INTEL...': 'СБОР РАЗВЕДАННЫХ...',
  'LOCATION': 'МЕСТОПОЛОЖЕНИЕ',
  'COUNTRY': 'СТРАНА',
  'CAPITAL': 'СТОЛИЦА',
  'POPULATION': 'НАСЕЛЕНИЕ',
  'REGION': 'РЕГИОН',
  'LANGUAGES': 'ЯЗЫКИ',
  'AREA': 'ПЛОЩАДЬ',
  'HEAD OF STATE': 'ГЛАВА ГОСУДАРСТВА',
  'INTELLIGENCE BRIEF': 'РАЗВЕДЫВАТЕЛЬНАЯ СПРАВКА',

  // ── Мобильная навигация ──
  'LAYERS': 'СЛОИ',
  'MARKETS': 'РЫНКИ',
  'INTEL': 'РАЗВЕДКА',
  'RECON': 'РЕКОН',
  'SEARCH': 'ПОИСК',
  'LAYERS & STATS': 'СЛОИ И СТАТИСТИКА',
  'MARKETS & INTEL': 'РЫНКИ И РАЗВЕДКА',
  'INTEL FEED': 'РАЗВЕДЫВАТЕЛЬНАЯ ЛЕНТА',
  'OSIRIS RECON': 'РЕКОН OSIRIS',

  // ── Live-трансляции ──
  'LIVE STREAM': 'ПРЯМОЙ ЭФИР',
  'EXTERNAL ONLY': 'ТОЛЬКО ВНЕШНЯЯ ССЫЛКА',
  'Open in YouTube': 'Открыть на YouTube',
  'EMBED RESTRICTED': 'ВСТРАИВАНИЕ ЗАПРЕЩЕНО',
  'OPEN LIVE STREAM': 'ОТКРЫТЬ ПРЯМОЙ ЭФИР',
  'does not allow third-party embedding. Click below to open the live stream directly.':
    'не поддерживает сторонние встраивания. Нажмите ниже, чтобы открыть трансляцию напрямую.',
  'If you see “Video unavailable”, use': 'Если вы видите «Видео недоступно», используйте',
  'above.': 'выше.',

  // ── LayerPanel ──
  'SDK': 'SDK',
  'OSIRIS SDK': 'SDK OSIRIS',
  'Maritime Lines': 'Морские линии',
  'AVIATION': 'АВИАЦИЯ',
  'Commercial': 'Гражданские',
  'Private': 'Частные',
  'Private Jets': 'Частные самолёты',
  'Military': 'Военные',
  'MARITIME': 'МОРСКОЙ ФЛОТ',
  'Maritime / Naval': 'Морской / Военно-морской',
  'SPACE': 'КОСМОС',
  'SPACE TRACKING': 'ОТСЛЕЖИВАНИЕ КОСМОСА',
  'All Satellites': 'Все спутники',
  'Starlink / Comms': 'Starlink / Связь',
  'Military / Intel': 'Военные / Разведка',
  'GPS / Navigation': 'GPS / Навигация',
  'Earth Observation': 'Дистанционное зондирование',
  'Stations / Telescopes': 'Станции / Телескопы',
  'SURVEIL': 'НАБЛЮДЕНИЕ',
  'SURVEILLANCE': 'НАБЛЮДЕНИЕ',
  'CCTV Cameras': 'Камеры видеонаблюдения',
  'Live News Feeds': 'Новостные трансляции',
  'SIGINT News': 'Новости SIGINT',
  'HAZARD': 'УГРОЗЫ ПРИРОДЫ',
  'NATURAL HAZARDS': 'ПРИРОДНЫЕ ОПАСНОСТИ',
  'Earthquakes': 'Землетрясения',
  'Active Fires': 'Активные пожары',
  'Severe Weather': 'Опасная погода',
  'THREAT': 'УГРОЗЫ',
  'THREATS & INTEL': 'УГРОЗЫ И РАЗВЕДКА',
  'Nuclear Facilities': 'Ядерные объекты',
  'Global Incidents': 'Глобальные инциденты',
  'GPS Jamming': 'Глушение GPS',
  'NETWORK': 'СЕТЬ',
  'NETWORK INTEL': 'СЕТЕВАЯ РАЗВЕДКА',
  'Live Malware': 'Активный малварь',
  'DISPLAY': 'ОТОБРАЖЕНИЕ',
  'Day / Night Cycle': 'Цикл день/ночь',
  '3D Terrain & Buildings': '3D-рельеф и здания',
  'Ghost Protocol': 'Протокол «Призрак»',

  // ── IntelFeed ──
  'SIGINT FEED': 'ЛЕНТА SIGINT',
  'ALERTS': 'ТРЕВОГИ',
  'CRITICAL': 'КРИТИЧЕСКИЙ',
  'HIGH': 'ВЫСОКИЙ',
  'ELEVATED': 'ПОВЫШЕННЫЙ',
  'MODERATE': 'УМЕРЕННЫЙ',
  'LOW': 'НИЗКИЙ',
  'AWAITING INTELLIGENCE...': 'ОЖИДАНИЕ РАЗВЕДАННЫХ...',
  'OPEN SOURCE': 'ИСТОЧНИК',

  // ── MarketsPanel ──
  'INDICES': 'ИНДЕКСЫ',
  'DEFENSE': 'ОБОРОНА',
  'ENERGY': 'ЭНЕРГЕТИКА',
  'COMMODITIES': 'СЫРЬЁ',
  'CRYPTO': 'КРИПТО',
  'Restore': 'Восстановить',
  'Maximize': 'Развернуть',
  'SPACE WEATHER': 'КОСМИЧЕСКАЯ ПОГОДА',
  'Latest flare:': 'Последняя вспышка:',
  'Loading': 'Загрузка',

  // ── AiOverview ──
  'AI OVERVIEW': 'ИИ-ОБЗОР',
  'ANALYZING…': 'АНАЛИЗ…',
  'Reading the feed…': 'Чтение ленты…',
  'Failed to generate overview': 'Не удалось сгенерировать обзор',
  'Regenerate': 'Обновить',
  'Close': 'Закрыть',
  'HEURISTIC ANALYST': 'ЭВРИСТИЧЕСКИЙ АНАЛИТИК',

  // ── ScmPanel ──
  'SCM RISK COMMAND': 'КООРДИНАЦИЯ РИСКОВ ЦП',
  'MARKET IMPACT ALERTS': 'ТРЕВОГИ О ВЛИЯНИИ НА РЫНКИ',
  'CRITICAL SUPPLIERS': 'КРИТИЧЕСКИЕ ПОСТАВЩИКИ',
  '✓ All monitored Tier 1/2 nodes operational.': '✓ Все отслеживаемые узлы уровня 1/2 в рабочем состоянии.',
  'CONGESTED NODES': 'ЗАТРУЖЕННЫЕ УЗЛЫ',
  '✓ Global maritime flow optimal.': '✓ Глобальный морской поток оптимален.',
  'DWELL:': 'ОЖИДАНИЕ:',

  // ── ViewPresets ──
  'REGION PRESETS': 'ПРЕСЕТЫ РЕГИОНОВ',
  'GLOBAL': 'МИР',
  'EUROPE': 'ЕВРОПА',
  'MIDDLE EAST': 'БЛИЖНИЙ ВОСТОК',
  'EAST ASIA': 'ВОСТОЧНАЯ АЗИЯ',
  'AMERICAS': 'АМЕРИКИ',
  'UKRAINE': 'УКРАИНА',
  'AFRICA': 'АФРИКА',
  'S.E. ASIA': 'Ю.-В. АЗИЯ',
  'ARCTIC': 'АРКТИКА',
  'INDIA': 'ИНДИЯ',
  'AUSTRALIA': 'АВСТРАЛИЯ',
  'SUDAN': 'СУДАН',

  // ── KeyboardShortcuts ──
  'Toggle fullscreen': 'Полноэкранный режим',
  'Share current view': 'Поделиться текущим видом',
  'Toggle layer panel': 'Панель слоёв',
  'Toggle markets panel': 'Панель рынков',
  'Toggle intel feed': 'Разведывательная лента',
  'Reset to global view': 'Сброс к глобальному виду',
  'Show this help': 'Показать справку',
  'Close panels / popups': 'Закрыть панели / окна',
  'PRESS [?] OR [ESC] TO CLOSE': 'НАЖМИТЕ [?] ИЛИ [ESC] ДЛЯ ЗАКРЫТИЯ',

  // ── SearchBar ──
  'CMD: LOCATE': 'КОМАНДА: ЛОКАЦИЯ',
  'SEARCH ADDRESS, CITY, OR COORDINATES...': 'ПОИСК АДРЕСА, ГОРОДА ИЛИ КООРДИНАТ...',
  'COORDS': 'КООРД',

  // ── SharePanel ──
  'Share view (S)': 'Поделиться видом (S)',
  'SHARE VIEW': 'ПОДЕЛИТЬСЯ ВИДОМ',
  'CURRENT VIEW': 'ТЕКУЩИЙ ВИД',
  'SHAREABLE LINK': 'ССЫЛКА ДЛЯ ОБМЕНА',
  'layers active': 'активных слоёв',
  'PRESS [S] TO TOGGLE · SHAREABLE LINKS PRESERVE VIEW STATE':
    '[S] — ОТКРЫТЬ/ЗАКРЫТЬ · ССЫЛКИ СОХРАНЯЮТ СОСТОЯНИЕ ВИДА',

  // ── GlobalStatusBar ──
  'Magnitude': 'Магнитуда',
  'Depth:': 'Глубина:',
  'Time:': 'Время:',

  // ── CameraViewer ──
  'SECURE UPLINK': 'ЗАЩИЩЁННЫЙ КАНАЛ',
  'SOURCE:': 'ИСТОЧНИК:',
  'Refresh feed': 'Обновить ленту',
  'Fly to location': 'Перелететь к локации',
  'Toggle fullscreen': 'Полноэкранный режим',
  'DECRYPTING FEED...': 'РАСШИФРОВКА ЛЕНТЫ...',
  'SECURE FEED ENCRYPTED': 'ЗАЩИЩЁННАЯ ЛЕНТА ЗАШИФРОВАНА',
  'This feed requires external clearance': 'Эта лента требует внешнего допуска',
  'ACCESS TERMINAL': 'ТЕРМИНАЛ ДОСТУПА',
  'FEED UNAVAILABLE': 'ЛЕНТА НЕДОСТУПНА',
  'Camera may be offline or restricted': 'Камера может быть отключена или ограничена',
  'RETRY': 'ПОВТОРИТЬ',
  'LIVE SAT-LINK': 'СПУТНИКОВЫЙ КАНАЛ',
  'LIVE FEED': 'ПРЯМАЯ ТРАНСЛЯЦИЯ',
  'LIVE': 'LIVE',
  'FEED TYPE': 'ТИП ЛЕНТЫ',
  'STATUS': 'СОСТОЯНИЕ',
  'ACTIVE / RECORDING': 'АКТИВНО / ЗАПИСЬ',
  'RAW FEED': 'ИСХОДНИК',
  'MAP TARGET': 'ЦЕЛЬ НА КАРТЕ',

  // ── EntityGraphPanel ──
  'ENTITY GRAPH': 'ГРАФ СУБЪЕКТОВ',
  'Building entity graph...': 'Построение графа субъектов...',
  'No connections found for this entity.': 'Связи для этого субъекта не найдены.',
  'Related Entities': 'Связанные субъекты',
  'Properties': 'Свойства',
  'Expand': 'Развернуть',
  'Entity Graph': 'Граф субъектов',
  'Center on map': 'Центрировать на карте',

  // ── OsintPanel ──
  'OSINT RECON': 'OSINT-РЕКОРНО',
  'Tools': 'Инструменты',
  'IP Lookup': 'Поиск IP',
  'DNS Records': 'DNS-записи',
  'WHOIS': 'WHOIS',
  'Port Scan': 'Сканирование портов',
  'Certificate Search': 'Поиск сертификатов',
  'CVE Search': 'Поиск CVE',
  'Threat Intel': 'Разведка угроз',
  'Sanctions Check': 'Проверка санкций',
  'MAC Vendor': 'Производитель MAC',
  'BGP / ASN': 'BGP / ASN',
  'Phone Lookup': 'Поиск по номеру',
  'Leak Search': 'Поиск утечек',
  'Target Sweep': 'Обход цели',
  'GitHub Recon': 'Рекогносцировка GitHub',
  'Run': 'Запустить',
  'Scan': 'Сканировать',
  'Lookup': 'Проверить',
  'Search': 'Найти',
  'Enter target...': 'Введите цель...',
  'Querying...': 'Запрос...',
  'No results': 'Нет результатов',
  'Copy': 'Копировать',
  'Copied!': 'Скопировано!',
  'Clear': 'Очистить',
  'History': 'История',
  'Add to Map': 'Добавить на карту',
  'Open Graph': 'Открыть граф',

  // ── TokenPanel ──
  '$OSIRIS LIVE CHART': 'ЖИВОЙ ГРАФИК $OSIRIS',

  // ── AiAnalyst ──
  'Open AI Intelligence Analyst': 'Открыть ИИ-аналитика разведки',
  'OSIRIS ANALYST': 'АНАЛИТИК OSIRIS',
  'GEMINI 2.0 FLASH • ONLINE': 'GEMINI 2.0 FLASH • В СЕТИ',
  'Clear conversation': 'Очистить беседу',
  'Settings': 'Настройки',
  'GEMINI API KEY (OPTIONAL)': 'API-КЛЮЧ GEMINI (НЕОБЯЗАТЕЛЬНО)',
  'SAVE': 'СОХРАНИТЬ',
  'Your key is stored locally and sent only to the OSIRIS server. Get a free key at':
    'Ваш ключ хранится локально и отправляется только на сервер OSIRIS. Бесплатный ключ можно получить на',
  'INTELLIGENCE ANALYST READY': 'АНАЛИТИК ГОТОВ К РАБОТЕ',
  'I correlate live seismic, OSINT, threat, and cyber data to deliver actionable intelligence assessments.':
    'Я сопоставляю данные о сейсмической активности, OSINT, угрозах и кибербезопасности для подготовки практически применимых разведывательных оценок.',
  'SUGGESTED QUERIES': 'РЕКОМЕНДУЕМЫЕ ЗАПРОСЫ',
  'What are the top 3 threats right now?': 'Какие три главные угрозы прямо сейчас?',
  'Are there seismic patterns correlating with conflicts?': 'Есть ли сейсмические закономерности, коррелирующие с конфликтами?',
  'Assess cyber risks to critical infrastructure': 'Оцените киберриски для критической инфраструктуры',
  'OPERATOR': 'ОПЕРАТОР',
  'Analyzing intelligence': 'Анализ разведданных',
  'GENERATE BRIEFING': 'СФОРМИРОВАТЬ СВОДКУ',
  'SHIFT+ENTER FOR NEWLINE': 'SHIFT+ENTER — НОВАЯ СТРОКА',
  'Query the intelligence analyst...': 'Задайте вопрос аналитику разведки...',
  '🔑 CUSTOM KEY': '🔑 СВОЙ КЛЮЧ',
  '🔧 SERVER KEY': '🔧 СЕРВЕРНЫЙ КЛЮЧ',
  'QUERIES': 'ЗАПРОСОВ',
  'ITEMS': 'ОБЪЕКТОВ',
  '⚠ INTELLIGENCE ANALYSIS ERROR': '⚠ ОШИБКА РАЗВЕДЫВАТЕЛЬНОГО АНАЛИЗА',
  '⚠ BRIEFING GENERATION ERROR': '⚠ ОШИБКА ФОРМИРОВАНИЯ СВОДКИ',
  'Analysis failed': 'Анализ не выполнен',
  'Briefing generation failed': 'Не удалось сформировать сводку',
  '📋 Generate full intelligence briefing from current operational data':
    '📋 Сформировать полную разведывательную сводку по текущим оперативным данным',

  // ── ErrorBoundary ──
  'COMPONENT': 'КОМПОНЕНТ',

  // ── Popups карты (OsirisMap) ──
  'MODEL': 'МОДЕЛЬ',
  'SPEED': 'СКОРОСТЬ',
  'DEPTH': 'ГЛУБИНА',
  'MISSION': 'МИССИЯ',
  'BRIGHTNESS': 'ЯРКОСТЬ',
  'TARGET IP': 'ЦЕЛЕВОЙ IP',
  'SEVERITY': 'СЕРЬЁЗНОСТЬ',
  'FROM': 'ОТКУДА',
  'DOMAIN': 'ДОМЕН',
  'SOURCE': 'ИСТОЧНИК',
  'TYPE': 'ТИП',
  'SCM RISK LEVEL': 'УРОВЕНЬ РИСКА ЦП',
  'PORTS': 'ПОРТЫ',
  'RISK': 'РИСК',
  'ALTITUDE': 'ВЫСОТА',
  'VERT RATE': 'ВЕРТ. СКОРОСТЬ',
  'TEMP': 'ТЕМП.',
  'READING': 'ПОКАЗАНИЕ',
  'NETWORK': 'СЕТЬ',
  'HEADING': 'КУРС',
  'LATITUDE': 'ШИРОТА',
  'LONGITUDE': 'ДОЛГОТА',
  'CITY': 'ГОРОД',
  'REACTORS': 'РЕАКТОРЫ',
  'CAPACITY': 'МОЩНОСТЬ',
  'OWNER': 'ВЛАДЕЛЕЦ',
  'SATELLITE VIEW': 'СПУТНИКОВЫЙ СНИМОК',
  'DEEP DIVE ANALYTICS': 'ГЛУБОКИЙ АНАЛИЗ',
  'Origin': 'Источник',
  'UNKNOWN': 'НЕИЗВЕСТНО',
};


  // ── LiveAlerts ──
  'LIVE ALERTS': 'ТРЕВОГИ В РЕАЛЬНОМ ВРЕМЕНИ',
  'all': 'ВСЕ', 'news': 'НОВОСТИ', 'quakes': 'ЗЕМЛЕТРЯСЕНИЯ', 'feeds': 'ЛЕНТЫ',

  // ── OsintPanel ──
  'PORT SCAN': 'СКАН ПОРТОВ', 'VULN SWEEP': 'ПРОВЕРКА УЯЗВИМОСТЕЙ',
  'IP or hostname': 'IP или имя хоста', 'Domain name': 'Доменное имя',
  'IP, domain, or hash': 'IP, домен или хеш', 'URL to inspect': 'URL для проверки',
  'Domain to enumerate': 'Домен для перечисления', 'URL to fingerprint': 'URL для определения стека',
  'IP address': 'IP-адрес', 'IP or ASN': 'IP или ASN', 'MAC address': 'MAC-адрес',
  'Phone number (e.g. +1...)': 'Номер телефона (напр. +7...)', 'Email address': 'Адрес электронной почты',
  'GitHub username': 'Имя пользователя GitHub', 'Enter IP address (e.g. 8.8.8.8)': 'Введите IP-адрес (напр. 8.8.8.8)',
  'HOST INFO': 'СВЕДЕНИЯ О ХОСТЕ', 'VULNERABILITY ASSESSMENT': 'ОЦЕНКА УЯЗВИМОСТЕЙ',
  'EXPLOIT': 'ЭКСПЛОИТ', 'DNS RECORDS': 'DNS-ЗАПИСИ', 'WHOIS INTELLIGENCE': 'ДАННЫЕ WHOIS',
  'SHODAN IOT INTELLIGENCE': 'ДАННЫЕ SHODAN IOT', 'BGP ROUTING INTELLIGENCE': 'ДАННЫЕ МАРШРУТИЗАЦИИ BGP',
  'MAC VENDOR LOOKUP': 'ПРОИЗВОДИТЕЛЬ MAC', 'PHONE INTELLIGENCE': 'РАЗВЕДКА ПО НОМЕРУ',
  'GITHUB RECON': 'РЕКОН GITHUB', 'RECENT REPOS': 'ПОСЛЕДНИЕ РЕПОЗИТОРИИ',
  'DATA LEAK SWEEP': 'ПРОВЕРКА УТЕЧЕК ДАННЫХ', 'EXPOSED DATA POINTS': 'ОБНАРУЖЕННЫЕ ДАННЫЕ',
  'CERTIFICATE TRANSPARENCY': 'ПРОЗРАЧНОСТЬ СЕРТИФИКАТОВ', 'THREAT INTELLIGENCE': 'РАЗВЕДКА УГРОЗ',
  'SSL/TLS ANALYSIS': 'АНАЛИЗ SSL/TLS', 'GLOBAL SWEEP': 'ГЛОБАЛЬНЫЙ ОБХОД',
  'QUICK SCAN': 'БЫСТРОЕ СКАНИРОВАНИЕ', 'DEEP SCAN': 'ГЛУБОКОЕ СКАНИРОВАНИЕ',
  'TOP 1000 PORTS': 'ТОП-1000 ПОРТОВ', 'SWEEPING SUBNET...': 'Сканирование подсети...',
  'DEVICES FOUND': 'НАЙДЕНО УСТРОЙСТВ', 'Identified Vulnerabilities': 'Выявленные уязвимости',
  'Open Ports': 'Открытые порты', 'Hostnames': 'Имена хостов', 'No reverse DNS': 'Обратная DNS отсутствует',
  'Fetching vulnerability intelligence...': 'Получение данных об уязвимостях...',
  'RECENT SCANS': 'ПОСЛЕДНИЕ СКАНИРОВАНИЯ', 'OSIRIS RECON TOOLKIT': 'НАБОР РЕКОН-ИНСТРУМЕНТОВ OSIRIS',
  'EXPANDED VIEW': 'РАЗВЁРНУТЫЙ ВИД', 'MODULES': 'МОДУЛЕЙ', 'RECON TOOLKIT': 'НАБОР РЕКОН-ИНСТРУМЕНТОВ',
  'TOOLS': 'ИНСТРУМЕНТОВ', 'Full Screen': 'Полноэкранный режим', 'SOURCE': 'ИСТОЧНИК',
  'HEADERS': 'ЗАГОЛОВКИ', 'SUBDOMAINS': 'ПОДДОМЕНЫ', 'TECH DETECT': 'ОПРЕДЕЛЕНИЕ ТЕХНОЛОГИЙ',
  'SHODAN IOT': 'SHODAN IOT', 'BGP ROUTE': 'МАРШРУТ BGP', 'MAC ADDR': 'MAC-АДРЕС',
  'PHONE INTEL': 'РАЗВЕДКА ПО НОМЕРУ', 'DATA LEAKS': 'УТЕЧКИ ДАННЫХ', 'IP SWEEP': 'ОБХОД IP',
  'CERTS': 'СЕРТИФИКАТЫ', 'THREATS': 'УГРОЗЫ', 'DNS': 'DNS', 'SSL/TLS': 'SSL/TLS',

  // ── EntityGraphPanel ──
  'NODES': 'УЗЛОВ', 'LINKS': 'СВЯЗЕЙ', '[ AWAITING TARGET LOCK ]': '[ ОЖИДАНИЕ ЗАХВАТА ЦЕЛИ ]',
  'No graph data yet': 'Нет данных графа', 'Expansion failed': 'Не удалось расширить граф',
  'YES': 'ДА', 'NO': 'НЕТ',

  
  // ── Попапы карты (OsirisMap) ──
  'MODEL': 'МОДЕЛЬ', 'ALT': 'ВЫСОТА', 'SPEED': 'СКОРОСТЬ', 'HDG': 'КУРС',
  'REG': 'РЕГ. НОМЕР', 'POS': 'КООРД.', 'DEPTH': 'ГЛУБИНА', 'COORDS': 'КООРДИНАТЫ',
  'MISSION': 'МИССИЯ', 'BRIGHTNESS': 'ЯРКОСТЬ', 'TARGET IP': 'IP ЦЕЛИ',
  'STATUS': 'СТАТУС', 'SEVERITY': 'СЕРЬЁЗНОСТЬ', 'MAGNITUDE': 'МАГНИТУДА',
  'EARTHQUAKE': 'ЗЕМЛЕТРЯСЕНИЕ', 'ACTIVE FIRE DETECTED': 'ОБНАРУЖЕН АКТИВНЫЙ ОГОНЬ',
  'CONFLICT EVENT': 'КОНФЛИКТНОЕ СОБЫТИЕ', 'UNKNOWN': 'НЕИЗВЕСТНО',
  'ONLINE': 'АКТИВЕН', 'OFFLINE': 'ОФЛАЙН',
  'TRACK ON N2YO': 'ОТСЛЕДИТЬ НА N2YO', 'USGS DETAILS': 'ДЕТАЛИ USGS',
  'THREAT INTEL': 'ИНФОРМАЦИЯ ОБ УГРОЗЕ', 'DEEP DIVE INTEL': '[ ГЛУБОКИЙ АНАЛИЗ ]',
  'DEEP DIVE ANALYTICS': 'ДЕТАЛЬНАЯ АНАЛИТИКА', 'OPEN SOURCE': 'ИСТОЧНИК',
  'WARNING EVENT': 'ПРЕДУПРЕЖДЕНИЕ', 'UNCLASSIFIED INCIDENT': 'НЕИДЕНТИФИЦИРОВАННЫЙ ИНЦИДЕНТ',
  'CUSTOM MAP': 'МОЯ КАРТА',

  // ── Панель «Моя карта» ──
  'MY MAP': 'МОЯ КАРТА',
  'MY MAP HINT': 'Вставьте ссылку на Яндекс.Карты (вид «Спутник») или прямой тайловый URL вида https://.../{z}/{x}/{y}. Ваша карта наложится под все разведывательные слои OSIRIS.',
  'PASTE YANDEX LINK': 'https://yandex.ru/maps/?l=sat&ll=...&z=...',
  'LOAD MAP': 'ЗАГРУЗИТЬ КАРТУ',
  'MAP APPLIED': 'Карта применена. Все слои OSIRIS остаются активными поверх неё.',
  'MY MAP ACTIVE NOTE': 'Разведывательные слои (самолёты, спутники, камеры, тревоги) отображаются поверх вашей карты.',
  'REMOVE': 'УБРАТЬ',
  'EMPTY': 'Вставьте ссылку',
  'YANDEX_BLOCKED': 'Не удалось получить тайлы Яндекса напрямую. Включите прокси в настройках или вставьте прямой тайловый URL с {z}/{x}/{y}.',

  // ── Граф сущностей ──
  '[ OSIRIS // ENTITY INTEL ]': '[ OSIRIS // РАЗВЕДКА СУЩНОСТЕЙ ]',
  '[ AWAITING TARGET LOCK ]': '[ ОЖИДАНИЕ ЗАХВАТА ЦЕЛИ ]',
  'No graph data yet': 'Данные графа отсутствуют',
  '[ ACQUIRE TARGET DATA ]': '[ ЗАГРУЗИТЬ ДАННЫЕ ЦЕЛИ ]',
  'NODES': 'УЗЛЫ', 'LINKS': 'СВЯЗИ',
  'YES': 'ДА', 'NO': 'НЕТ',
  'aircraft': 'САМОЛЁТ', 'vessel': 'СУДО', 'company': 'КОМПАНИЯ',
  'person': 'ПЕРСОНА', 'country': 'СТРАНА', 'event': 'СОБЫТИЕ',
  'sanction': 'САНКЦИЯ', 'ip': 'IP',

  // ── OsintPanel — остаток ──
  'PORT SCAN': 'СКАН ПОРТОВ', 'IP or hostname': 'IP или имя хоста',
  'POSSIBLE EXPLOITS': 'ВОЗМОЖНЫЕ УЯЗВИМОСТИ', 'Source:': 'Источник:',
  'SCAN': 'СКАН', 'RESULTS': 'РЕЗУЛЬТАТЫ', 'IP or hostname': 'IP или имя хоста',

// ── Прочее ──
  'REGISTRY': 'РЕЕСТР', 'SDK STATUS': 'СОСТОЯНИЕ SDK',

export function translate(key: string, locale: Locale): string {
  if (locale === 'en') return key;
  return RU[key] ?? key;
}

export function useLocale(): Locale {
  // Полностью русская сборка: константная локаль.
  return 'ru';
}

export function useT() {
  const locale = useLocale();
  return useMemo(() => (key: string) => translate(key, locale), [locale]);
}
