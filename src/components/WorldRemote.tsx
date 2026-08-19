'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Bluetooth, BluetoothSearching, Tv, Speaker, X,
  Gamepad2, Lightbulb, Watch, Headphones, Mouse, Keyboard, Smartphone,
  BatteryMedium, Fan, Eye, Send, Bell, BellOff, ChevronRight, Copy, Check,
  AlertTriangle, Scan, Zap, Unplug, Layers, ChevronDown, ChevronUp,
  Maximize2, Minimize2, Trash2, Pause, Play, Cpu, Printer,
  ScanLine, Plug, Radio, Clock, Server, Terminal,
  MapPin, Download, Database, Crosshair, Navigation,
  Wifi, Globe, Target, Activity, Shield
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   M A R A U D E R   V 8
   Browser-based BLE Recon Engine
   ═══════════════════════════════════════════════════════════════ */

/* ── UUID DATABASE ── */
const SVC_NAMES:Record<number,string>={0x1800:'Generic Access',0x1801:'Generic Attribute',0x1802:'Immediate Alert',0x1803:'Link Loss',0x1804:'TX Power',0x1805:'Current Time',0x1806:'Reference Time Update',0x1807:'Next DST Change',0x1808:'Glucose',0x1809:'Health Thermometer',0x180A:'Device Information',0x180B:'Network Availability',0x180D:'Heart Rate',0x180E:'Phone Alert Status',0x180F:'Battery Service',0x1810:'Blood Pressure',0x1811:'Alert Notification',0x1812:'Human Interface Device',0x1813:'Scan Parameters',0x1814:'Running Speed',0x1815:'Automation IO',0x1816:'Cycling Speed',0x1818:'Cycling Power',0x1819:'Location & Navigation',0x181A:'Environmental Sensing',0x181B:'Body Composition',0x181C:'User Data',0x181D:'Weight Scale',0x181E:'Bond Management',0x181F:'Continuous Glucose',0x1820:'IP Support',0x1821:'Indoor Positioning',0x1822:'Pulse Oximeter',0x1823:'HTTP Proxy',0x1824:'Transport Discovery',0x1825:'Object Transfer',0x1826:'Fitness Machine',0x1827:'Mesh Provisioning',0x1828:'Mesh Proxy',0x1843:'Audio Input Control',0x1844:'Volume Control',0x1848:'Media Control',0x184D:'Microphone Control',0x184E:'Audio Stream Control',0x1854:'Hearing Access',0xFE95:'Xiaomi',0xFEB3:'Tile',0xFE9F:'Google',0xFD6F:'Exposure Notification',0xFEAA:'Eddystone'};
const CHAR_NAMES:Record<number,string>={0x2A00:'Device Name',0x2A01:'Appearance',0x2A04:'Preferred Conn Params',0x2A05:'Service Changed',0x2A06:'Alert Level',0x2A07:'TX Power Level',0x2A19:'Battery Level',0x2A23:'System ID',0x2A24:'Model Number',0x2A25:'Serial Number',0x2A26:'Firmware Rev',0x2A27:'Hardware Rev',0x2A28:'Software Rev',0x2A29:'Manufacturer Name',0x2A2A:'IEEE 11073-20601',0x2A37:'Heart Rate Measurement',0x2A38:'Body Sensor Location',0x2A4D:'Report',0x2A50:'PnP ID',0x2A6E:'Temperature',0x2A6F:'Humidity',0x2A6D:'Pressure'};
const ALL_N={...SVC_NAMES,...CHAR_NAMES};
const PROBE_SVCS=[0x1800,0x180A,0x180F,0x180D,0x1810,0x1809,0x1812,0x1814,0x1816,0x1818,0x181A,0x181B,0x181C,0x181D,0x180E,0x1848,0x1815,0x1802,0x1803,0x1804,0x1805,0x1808,0x1811,0x1819,0x1820,0x1822,0x1826,0x1843,0x1844,0x184D,0x184E,0x1854];
const ALL_OPT=[...new Set([...Object.keys(SVC_NAMES).map(Number),...PROBE_SVCS])];

/* ── APPEARANCE TABLE ── */
const APP_L:Record<number,string>={0:'Unknown',64:'Phone',128:'Computer',192:'Watch',193:'Sports Watch',256:'Clock',320:'Display',384:'Remote',448:'Glasses',512:'Tag',576:'Keyring',640:'Media Player',768:'Thermometer',832:'Heart Rate Sensor',896:'Blood Pressure',960:'Generic HID',961:'Keyboard',962:'Mouse',963:'Joystick',964:'Gamepad',965:'Digitizer',966:'Card Reader',968:'Barcode Scanner',969:'Touchpad',970:'Presenter',1024:'Glucose Meter',1088:'Running Sensor',1152:'Cycling Sensor',1216:'Control Device',1217:'Switch',1218:'Multi-Switch',1280:'Network Device',1281:'Access Point',1344:'Sensor',1345:'Motion Sensor',1346:'Air Quality',1347:'Temperature Sensor',1348:'Humidity Sensor',1408:'Light Fixture',1472:'Fan',1536:'HVAC',1537:'Thermostat',1600:'Air Conditioning',1792:'Access Control',1793:'Access Door',1856:'Motorized Device',1920:'Power Device',1921:'Power Outlet',1984:'Light Source',2048:'Window Covering',2112:'Audio Sink',2113:'Standalone Speaker',2114:'Soundbar',2176:'Audio Source',2177:'Microphone'};

/* ── CLASSIFICATION ── */
function classify(name:string,appearance?:number,mfr?:string,svcs?:number[]):{type:string;icon:typeof Bluetooth;color:string;by:string}{
  if(appearance!=null){const c=(appearance>>6)&0x3FF;const s=appearance&0x3F;if(c===1)return{type:'Phone',icon:Smartphone,color:'#FFB74D',by:'appearance'};if(c===2)return{type:'Computer',icon:Cpu,color:'#80DEEA',by:'appearance'};if(c===3)return{type:'Watch',icon:Watch,color:'#FF6BCD',by:'appearance'};if(c===5)return{type:'Display',icon:Tv,color:'#00E6FF',by:'appearance'};if(c===6)return{type:'Remote',icon:Radio,color:'#90A4AE',by:'appearance'};if(c===10)return{type:'Media Player',icon:Tv,color:'#00E6FF',by:'appearance'};if(c===15){if(s===1)return{type:'Keyboard',icon:Keyboard,color:'#64FFDA',by:'appearance'};if(s===2)return{type:'Mouse',icon:Mouse,color:'#80DEEA',by:'appearance'};if(s===4)return{type:'Gamepad',icon:Gamepad2,color:'#FF6B6B',by:'appearance'};return{type:'HID',icon:Keyboard,color:'#64FFDA',by:'appearance'};}if(c===33)return{type:'Speaker',icon:Speaker,color:'#FFB800',by:'appearance'};if(appearance>=0x0841&&appearance<=0x087F)return{type:'Headphones',icon:Headphones,color:'#B388FF',by:'appearance'};if(appearance===0x0840)return{type:'Speaker',icon:Speaker,color:'#FFB800',by:'appearance'};}
  if(svcs&&svcs.length>0){if(svcs.includes(0x1848)||svcs.includes(0x1844))return{type:'Audio',icon:Speaker,color:'#FFB800',by:'service'};if(svcs.includes(0x1812))return{type:'HID',icon:Keyboard,color:'#64FFDA',by:'service'};if(svcs.includes(0x180D))return{type:'Heart Rate',icon:Watch,color:'#FF6BCD',by:'service'};if(svcs.includes(0x181A))return{type:'Env Sensor',icon:Fan,color:'#00FF88',by:'service'};}
  if(mfr){if(/bose|jbl|sonos|harman|marshall|yamaha|denon|b&o/i.test(mfr))return{type:'Speaker',icon:Speaker,color:'#FFB800',by:'manufacturer'};if(/logitech|corsair|razer|steelseries/i.test(mfr))return{type:'Peripheral',icon:Mouse,color:'#80DEEA',by:'manufacturer'};if(/fitbit|garmin|polar|suunto|coros/i.test(mfr))return{type:'Wearable',icon:Watch,color:'#FF6BCD',by:'manufacturer'};}
  const l=name.toLowerCase();if(/\btv\b|bravia|roku|chromecast|fire.?stick|apple.?tv/i.test(l))return{type:'Television',icon:Tv,color:'#00E6FF',by:'name'};if(/speaker|soundbar|bose|jbl|sonos|echo|homepod/i.test(l))return{type:'Speaker',icon:Speaker,color:'#FFB800',by:'name'};if(/headphone|airpod|buds|earbud|wh-1000|wf-1000|qc|jabra|galaxy.?buds/i.test(l))return{type:'Headphones',icon:Headphones,color:'#B388FF',by:'name'};if(/watch|band|fitbit|garmin|amazfit|polar|mi.?band/i.test(l))return{type:'Wearable',icon:Watch,color:'#FF6BCD',by:'name'};if(/gamepad|controller|xbox|playstation|dualsense|joy.?con/i.test(l))return{type:'Controller',icon:Gamepad2,color:'#FF6B6B',by:'name'};if(/keyboard|keychron/i.test(l))return{type:'Keyboard',icon:Keyboard,color:'#64FFDA',by:'name'};if(/mouse|mx.?master|trackpad/i.test(l))return{type:'Mouse',icon:Mouse,color:'#80DEEA',by:'name'};if(/phone|iphone|galaxy.?[saz]|pixel/i.test(l))return{type:'Phone',icon:Smartphone,color:'#FFB74D',by:'name'};if(/bulb|light|hue|lifx|nanoleaf|govee/i.test(l))return{type:'Light',icon:Lightbulb,color:'#FFD700',by:'name'};if(/printer|epson|canon|brother/i.test(l))return{type:'Printer',icon:Printer,color:'#90A4AE',by:'name'};if(/tile|chipolo|tracker|airtag|smarttag/i.test(l))return{type:'Tracker',icon:Radio,color:'#90A4AE',by:'name'};if(/lock|schlage|august|yale/i.test(l))return{type:'Smart Lock',icon:Plug,color:'#FF6B6B',by:'name'};if(/scale|withings|renpho/i.test(l))return{type:'Scale',icon:Watch,color:'#FF6BCD',by:'name'};
  return{type:'Unknown',icon:Bluetooth,color:'#90A4AE',by:'—'};
}

/* ── HELPERS ── */
function nameUUID(u:string):string{const m=u.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i);if(m)return ALL_N[parseInt(m[1],16)]||`0x${m[1].toUpperCase()}`;return u.length>8?u.slice(0,8)+'…':u;}
async function readStr(s:BluetoothRemoteGATTService,u:number){try{const c=await s.getCharacteristic(u);const v=await c.readValue();return new TextDecoder().decode(v.buffer).replace(/\0+$/g,'')||undefined;}catch{return undefined;}}
function decode(dv:DataView){const b=new Uint8Array(dv.buffer);const hex=Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join(' ');try{const t=new TextDecoder().decode(dv.buffer);if(/^[\x20-\x7E\n\r\t]+$/.test(t))return{text:t,hex};}catch{}return{text:hex,hex};}
function validHex(s:string){const h=s.replace(/[\s,:-]/g,'');return h.length>0&&h.length%2===0&&/^[0-9a-fA-F]+$/.test(h);}
function parseHex(s:string){const h=s.replace(/[\s,:-]/g,'');return new Uint8Array((h.match(/.{1,2}/g)||[]).map(b=>parseInt(b,16)));}
async function writeSafe(ch:BluetoothRemoteGATTCharacteristic,d:Uint8Array,resp:boolean){if(resp&&typeof ch.writeValueWithResponse==='function')await ch.writeValueWithResponse(d);else if(!resp&&typeof ch.writeValueWithoutResponse==='function')await ch.writeValueWithoutResponse(d);else await(ch as any).writeValue(d);}
function fts(t:number){const d=new Date(t);return d.toLocaleTimeString('en-US',{hour12:false})+'.'+d.getMilliseconds().toString().padStart(3,'0');}
function toHex(s:string){return Array.from(new TextEncoder().encode(s)).map(x=>x.toString(16).padStart(2,'0')).join(' ');}

/* ═══════════════════════════════════════════════════════════════
   IndexedDB VAULT — persists captures across reloads
   ═══════════════════════════════════════════════════════════════ */
const DB_NAME='marauder_v8'; const DB_VER=1; const STORE='captures';
function openDB():Promise<IDBDatabase>{return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VER);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function vaultSave(dev:any){const db=await openDB();return new Promise<void>((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(dev);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function vaultLoadAll():Promise<any[]>{const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).getAll();req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});}
async function vaultClear(){const db=await openDB();return new Promise<void>((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function vaultDelete(id:string){const db=await openDB();return new Promise<void>((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}

/* ═══════════════════════════════════════════════════════════════
   GPS MODULE
   ═══════════════════════════════════════════════════════════════ */
interface GeoFix { lat:number; lng:number; acc:number; alt?:number; speed?:number; heading?:number; ts:number; }
function getGPS():Promise<GeoFix|null>{return new Promise(res=>{if(!navigator.geolocation){res(null);return;}navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy,alt:p.coords.altitude??undefined,speed:p.coords.speed??undefined,heading:p.coords.heading??undefined,ts:p.timestamp}),()=>res(null),{enableHighAccuracy:true,timeout:8000,maximumAge:5000});});}

/* ═══════════════════════════════════════════════════════════════
   NETWORK RECON — WebRTC + connection + port probe
   ═══════════════════════════════════════════════════════════════ */
interface NetIntel { localIPs:string[]; type?:string; downlink?:number; rtt?:number; saveData?:boolean; openPorts:{port:number;service:string;ms:number}[]; ts:number; }
async function probeNetwork():Promise<NetIntel>{
  const intel:NetIntel={localIPs:[],openPorts:[],ts:Date.now()};
  // Connection API
  const conn=(navigator as any).connection;
  if(conn){intel.type=conn.effectiveType;intel.downlink=conn.downlink;intel.rtt=conn.rtt;intel.saveData=conn.saveData;}
  // WebRTC local IPs
  try{const ips=await new Promise<string[]>((resolve)=>{const found:string[]=[];const pc=new RTCPeerConnection({iceServers:[]});pc.createDataChannel('');pc.createOffer().then(o=>pc.setLocalDescription(o)).catch(()=>{});const to=setTimeout(()=>{pc.close();resolve(found);},3000);pc.onicecandidate=e=>{if(!e.candidate)return;const m=e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);if(m&&!found.includes(m[1]))found.push(m[1]);const m6=e.candidate.candidate.match(/([0-9a-f]{1,4}(:[0-9a-f]{1,4}){7})/i);if(m6&&!found.includes(m6[1]))found.push(m6[1]);};setTimeout(()=>{clearTimeout(to);pc.close();resolve(found);},2500);});intel.localIPs=ips;}catch{}
  // Port probe — detect local services via fetch timing
  const ports=[{port:80,svc:'HTTP'},{port:443,svc:'HTTPS'},{port:8080,svc:'Alt HTTP'},{port:3000,svc:'Dev Server'},{port:5000,svc:'Flask'},{port:8443,svc:'Alt HTTPS'},{port:8888,svc:'Jupyter'},{port:9090,svc:'Prometheus'},{port:3001,svc:'Next.js'},{port:4200,svc:'Angular'},{port:5173,svc:'Vite'},{port:1883,svc:'MQTT'},{port:8883,svc:'MQTT/TLS'},{port:5353,svc:'mDNS'},{port:631,svc:'IPP/Printer'}];
  for(const{port,svc}of ports){
    const t0=performance.now();
    try{const ctrl=new AbortController();const to=setTimeout(()=>ctrl.abort(),400);await fetch(`http://127.0.0.1:${port}/`,{mode:'no-cors',signal:ctrl.signal});clearTimeout(to);const ms=Math.round(performance.now()-t0);intel.openPorts.push({port,service:svc,ms});}
    catch(e:any){const ms=Math.round(performance.now()-t0);if(ms<350&&e.name!=='AbortError')intel.openPorts.push({port,service:svc,ms});}
  }
  return intel;
}

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */
type PktOp='SCAN'|'PROBE'|'READ'|'WRITE'|'NOTIFY'|'CONNECT'|'DISCONNECT'|'ENUM'|'ERROR'|'SUB'|'INFO'|'GPS'|'NET'|'RSSI';
interface Pkt{id:number;ts:number;op:PktOp;src:string;msg:string;hex?:string;len?:number;}
interface BLEDev{
  id:string;name:string;type:string;icon:typeof Bluetooth;color:string;classBy:string;
  connected:boolean;probing:boolean;probeMs?:number;battery?:number;
  manufacturer?:string;model?:string;serial?:string;firmware?:string;hardware?:string;software?:string;
  appearance?:number;appearanceLabel?:string;txPower?:number;
  services:string[];serviceCount:number;charCount:number;totalBytes:number;
  gattDump:{svc:string;char:string;value:string;hex:string;props:string}[];
  geo?:GeoFix;rssiHistory:{ts:number;rssi:number}[];lastRSSI?:number;
  capturedAt:number;bt?:BluetoothDevice;srv?:BluetoothRemoteGATTServer;
}
interface Svc{uuid:string;name:string;chars:Chr[];}
interface Chr{uuid:string;name:string;value?:string;hex?:string;notifying?:boolean;char?:BluetoothRemoteGATTCharacteristic;p:{r:boolean;w:boolean;wn:boolean;n:boolean;i:boolean};}

const OP_CLR:Record<string,string>={SCAN:'#00E6FF',PROBE:'#B388FF',READ:'#64FFDA',WRITE:'#FFB800',NOTIFY:'#00FF88',CONNECT:'#00E6FF',DISCONNECT:'#FF6B6B',ENUM:'#80DEEA',ERROR:'#FF3D3D',SUB:'#FF6BCD',INFO:'#90A4AE',GPS:'#FFB74D',NET:'#80DEEA',RSSI:'#FF6BCD'};

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function WorldRemote({onClose,onPlaceOnMap}:{onClose?:()=>void,onPlaceOnMap?:(devs:{id:string,name:string,lat:number,lng:number,type:string,color:string}[])=>void}){
  const [devices,setDevices]=useState<BLEDev[]>([]);
  const [scanning,setScanning]=useState(false);
  const [btOk,setBtOk]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [connecting,setConnecting]=useState<string|null>(null);
  const [gattTarget,setGattTarget]=useState<string|null>(null);
  const [gattSvcs,setGattSvcs]=useState<Svc[]>([]);
  const [gattLoading,setGattLoading]=useState(false);
  const [exSvc,setExSvc]=useState<string|null>(null);
  const [wIn,setWIn]=useState<Record<string,string>>({});
  const [copied,setCopied]=useState<string|null>(null);
  const [pkts,setPkts]=useState<Pkt[]>([]);
  const [bytes,setBytes]=useState(0);
  const [view,setView]=useState<'scan'|'intel'|'log'>('scan');
  const [autoScr,setAutoScr]=useState(true);
  const [exDev,setExDev]=useState<string|null>(null);
  const [full,setFull]=useState(false);
  const [paused,setPaused]=useState(false);
  const [expanded,setExpanded]=useState(true);
  const [netIntel,setNetIntel]=useState<NetIntel|null>(null);
  const [netLoading,setNetLoading]=useState(false);
  const [vaultCount,setVaultCount]=useState(0);
  const [vaultLoaded,setVaultLoaded]=useState(false);

  const mtd=useRef(true);const errT=useRef<ReturnType<typeof setTimeout>|null>(null);
  const nL=useRef<Map<string,(e:Event)=>void>>(new Map());const pid=useRef(0);
  const logEl=useRef<HTMLDivElement>(null);const t0=useRef(Date.now());const[tick,setTick]=useState(0);


  // Boot
  useEffect(()=>{if(typeof navigator!=='undefined'&&!navigator.bluetooth)setBtOk(false);mtd.current=true;t0.current=Date.now();
    const iv=setInterval(()=>{if(mtd.current)setTick(t=>t+1);},1000);
    // Load vault
    vaultLoadAll().then(saved=>{if(saved.length>0&&mtd.current){
      const restored=saved.map((d:any)=>({...d,connected:false,probing:false,srv:undefined,bt:undefined,rssiHistory:d.rssiHistory||[],gattDump:d.gattDump||[]}));
      setDevices(restored);setVaultCount(saved.length);setVaultLoaded(true);
    }else{setVaultLoaded(true);}}).catch(()=>setVaultLoaded(true));
    return()=>{mtd.current=false;clearInterval(iv);if(errT.current)clearTimeout(errT.current);nL.current.clear();};
  },[]);
  useEffect(()=>{if(autoScr&&logEl.current)logEl.current.scrollTop=logEl.current.scrollHeight;},[pkts,autoScr]);
  useEffect(()=>{if(full)document.body.style.overflow='hidden';else document.body.style.overflow='';return()=>{document.body.style.overflow='';};},[full]);


  const setErr=useCallback((m:string|null)=>{if(!mtd.current)return;setError(m);if(errT.current)clearTimeout(errT.current);if(m)errT.current=setTimeout(()=>{if(mtd.current)setError(null);},6000);},[]);
  const log=useCallback((op:PktOp,src:string,msg:string,hex?:string,len?:number)=>{if(!mtd.current||paused)return;const p:Pkt={id:++pid.current,ts:Date.now(),op,src,msg,hex,len};setPkts(prev=>{const next=[...prev,p];return next.length>3000?next.slice(-3000):next;});if(len)setBytes(b=>b+len);},[paused]);
  const onDC=useCallback((e:Event)=>{if(!mtd.current)return;const d=e.target as BluetoothDevice;setDevices(p=>p.map(x=>x.bt===d?{...x,connected:false,srv:undefined}:x));log('DISCONNECT',d.name||'?','GATT disconnected');},[log]);

  /* ═══ PERSIST TO VAULT ═══ */
  const saveToVault=useCallback(async(dev:BLEDev)=>{
    const safe={...dev,bt:undefined,srv:undefined};// strip non-serializable
    try{await vaultSave(safe);setVaultCount(c=>c+1);log('INFO','VAULT',`Saved "${dev.name}" to local database`);}catch(e:any){log('ERROR','VAULT',e.message);}
  },[log]);

  /* ═══ VIEW ON WORLD MAP ═══ */
  const placeOnWorldMap=useCallback(()=>{
    if(!onPlaceOnMap)return;
    const geo=devices.filter(d=>d.geo).map(d=>({id:d.id,name:d.name,lat:d.geo!.lat,lng:d.geo!.lng,type:d.type,color:d.color}));
    if(geo.length>0)onPlaceOnMap(geo);
  },[devices,onPlaceOnMap]);
  const placeSingleOnMap=useCallback((dev:BLEDev)=>{
    if(!onPlaceOnMap||!dev.geo)return;
    onPlaceOnMap([{id:dev.id,name:dev.name,lat:dev.geo.lat,lng:dev.geo.lng,type:dev.type,color:dev.color}]);
  },[onPlaceOnMap]);

  /* ═══ DEEP PROBE + AUTO-VACUUM ═══ */
  const deepProbe=useCallback(async(dev:BLEDev):Promise<BLEDev>=>{
    if(!dev.bt?.gatt)return{...dev,probing:false,...classify(dev.name)};
    const p0=performance.now();
    let name=dev.name,mfr:string|undefined,model:string|undefined,serial:string|undefined,fw:string|undefined,hw:string|undefined,sw:string|undefined,appearance:number|undefined,appLbl:string|undefined,battery:number|undefined,txPower:number|undefined;
    const services:string[]=[];const foundSvcs:number[]=[];let charCount=0,totalBytes=0;
    const gattDump:{svc:string;char:string;value:string;hex:string;props:string}[]=[];

    // GPS tag
    log('GPS','SCANNER','Acquiring GPS fix...');
    const geo=await getGPS();
    if(geo)log('GPS','SCANNER',`Fix: ${geo.lat.toFixed(6)}, ${geo.lng.toFixed(6)} (±${Math.round(geo.acc)}m)${geo.alt!=null?` alt:${Math.round(geo.alt)}m`:''}${geo.speed!=null?` ${(geo.speed*3.6).toFixed(1)}km/h`:''}`);
    else log('GPS','SCANNER','No GPS available');

    log('PROBE',dev.name,'══ DEEP PROBE + AUTO-VACUUM ══');
    try{
      const s=await dev.bt.gatt.connect();
      log('CONNECT',dev.name,'GATT connected — vacuuming all data');

      // Generic Access
      try{const ga=await s.getPrimaryService(0x1800);services.push('Generic Access');
        try{const c=await ga.getCharacteristic(0x2A00);const v=await c.readValue();const n=new TextDecoder().decode(v.buffer).replace(/\0+$/g,'');if(n){name=n;totalBytes+=v.byteLength;gattDump.push({svc:'Generic Access',char:'Device Name',value:n,hex:toHex(n),props:'R'});log('READ',dev.name,`Device Name → "${n}"`,toHex(n),v.byteLength);}}catch{}
        try{const c=await ga.getCharacteristic(0x2A01);const v=await c.readValue();appearance=v.getUint16(0,true);appLbl=APP_L[appearance]||`0x${appearance.toString(16)}`;totalBytes+=v.byteLength;const hx=Array.from(new Uint8Array(v.buffer)).map(x=>x.toString(16).padStart(2,'0')).join(' ');gattDump.push({svc:'Generic Access',char:'Appearance',value:appLbl,hex:hx,props:'R'});log('READ',name,`Appearance → ${appLbl}`,hx,v.byteLength);}catch{}
        try{const c=await ga.getCharacteristic(0x2A04);const v=await c.readValue();const min=v.getUint16(0,true)*1.25;const max=v.getUint16(2,true)*1.25;const lat=v.getUint16(4,true);const to=v.getUint16(6,true)*10;totalBytes+=v.byteLength;gattDump.push({svc:'Generic Access',char:'Conn Params',value:`min:${min}ms max:${max}ms lat:${lat} to:${to}ms`,hex:'',props:'R'});log('READ',name,`Conn Params → min:${min}ms max:${max}ms lat:${lat} timeout:${to}ms`);}catch{}
        charCount+=3;
      }catch{}

      // Device Information
      try{const di=await s.getPrimaryService(0x180A);services.push('Device Information');
        const fields:[string,number][]=[['Manufacturer',0x2A29],['Model',0x2A24],['Serial',0x2A25],['Hardware Rev',0x2A27],['Firmware Rev',0x2A26],['Software Rev',0x2A28]];
        for(const[lbl,uuid]of fields){const val=await readStr(di,uuid);if(val){if(uuid===0x2A29)mfr=val;if(uuid===0x2A24)model=val;if(uuid===0x2A25)serial=val;if(uuid===0x2A27)hw=val;if(uuid===0x2A26)fw=val;if(uuid===0x2A28)sw=val;totalBytes+=val.length;gattDump.push({svc:'Device Info',char:lbl,value:val,hex:toHex(val),props:'R'});log('READ',name,`${lbl} → "${val}"`,toHex(val),val.length);}charCount++;}
        try{const c=await di.getCharacteristic(0x2A23);const v=await c.readValue();const hx=Array.from(new Uint8Array(v.buffer)).map(x=>x.toString(16).padStart(2,'0')).join(' ');totalBytes+=v.byteLength;gattDump.push({svc:'Device Info',char:'System ID',value:hx,hex:hx,props:'R'});log('READ',name,`System ID → ${hx}`,hx,v.byteLength);charCount++;}catch{}
        try{const c=await di.getCharacteristic(0x2A50);const v=await c.readValue();const src=v.getUint8(0);const vid=v.getUint16(1,true);const pid2=v.getUint16(3,true);const ver=v.getUint16(5,true);const val=`src:${src} vendor:0x${vid.toString(16)} product:0x${pid2.toString(16)} ver:${ver}`;totalBytes+=v.byteLength;gattDump.push({svc:'Device Info',char:'PnP ID',value:val,hex:'',props:'R'});log('READ',name,`PnP ID → ${val}`);charCount++;}catch{}
      }catch{}

      // Battery
      try{const bs=await s.getPrimaryService(0x180F);services.push('Battery');foundSvcs.push(0x180F);const bc=await bs.getCharacteristic(0x2A19);const bv=await bc.readValue();battery=bv.getUint8(0);totalBytes+=bv.byteLength;gattDump.push({svc:'Battery',char:'Battery Level',value:`${battery}%`,hex:battery.toString(16),props:'R'});log('READ',name,`Battery → ${battery}%`);charCount++;}catch{}

      // TX Power
      try{const tx=await s.getPrimaryService(0x1804);services.push('TX Power');foundSvcs.push(0x1804);const tc=await tx.getCharacteristic(0x2A07);const tv=await tc.readValue();txPower=tv.getInt8(0);totalBytes+=tv.byteLength;gattDump.push({svc:'TX Power',char:'TX Power Level',value:`${txPower} dBm`,hex:'',props:'R'});log('READ',name,`TX Power → ${txPower} dBm`);charCount++;}catch{}

      // AUTO-VACUUM: discover ALL services and read EVERY readable characteristic
      log('PROBE',name,'Auto-vacuum: reading all accessible data...');
      try{
        const allSvcs=await s.getPrimaryServices();
        for(const sv of allSvcs){const sn=nameUUID(sv.uuid);if(!services.includes(sn))services.push(sn);
          try{const chs=await sv.getCharacteristics();charCount+=chs.length;
            for(const ch of chs){const cn=nameUUID(ch.uuid);const fl=[ch.properties.read&&'R',ch.properties.write&&'W',ch.properties.writeWithoutResponse&&'Wn',ch.properties.notify&&'N',ch.properties.indicate&&'I'].filter(Boolean).join('·');
              if(ch.properties.read){
                try{const v=await ch.readValue();const d=decode(v);totalBytes+=v.byteLength;
                  gattDump.push({svc:sn,char:cn,value:d.text,hex:d.hex,props:fl});
                  log('READ',name,`${sn}/${cn} → ${d.text.slice(0,60)}`,d.hex,v.byteLength);
                }catch{}
              }else{gattDump.push({svc:sn,char:cn,value:'(not readable)',hex:'',props:fl});}
            }
          }catch{}
        }
      }catch{}

      // Scan known service UUIDs for discovery
      for(const svc of PROBE_SVCS){try{await s.getPrimaryService(svc);foundSvcs.push(svc);const sn=SVC_NAMES[svc]||`0x${svc.toString(16)}`;if(!services.includes(sn)){services.push(sn);log('ENUM',name,`Service: ${sn}`);};}catch{}}

      try{s.disconnect();}catch{}
    }catch(e:any){log('ERROR',dev.name,`Probe error: ${e.message}`);}

    const cls=classify(name,appearance,mfr,foundSvcs);
    const ms=Math.round(performance.now()-p0);
    log('INFO',name,`✓ VACUUM COMPLETE — ${cls.type} via ${cls.by} — ${services.length} svcs, ${charCount} chars, ${gattDump.length} values, ${totalBytes}B in ${ms}ms`);

    return{...dev,name,probing:false,probeMs:ms,battery,txPower,...cls,classBy:cls.by,
      manufacturer:mfr,model,serial,firmware:fw,hardware:hw,software:sw,
      appearance,appearanceLabel:appLbl,services,serviceCount:services.length,
      charCount,totalBytes,gattDump,geo:geo||undefined,capturedAt:Date.now()};
  },[log]);

  /* ═══ SCAN ═══ */
  const scan=useCallback(async()=>{
    if(!navigator.bluetooth||scanning)return;setScanning(true);setErr(null);
    log('SCAN','SCANNER','══ MARAUDER SCAN INITIATED ══');
    try{
      const d=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:ALL_OPT});
      if(!d){setScanning(false);return;}
      if(devices.find(x=>x.id===d.id)){log('INFO','SCANNER','Already captured');setScanning(false);return;}
      d.addEventListener('gattserverdisconnected',onDC);
      log('SCAN','SCANNER',`Target acquired: "${d.name||d.id}"`);
      const raw:BLEDev={id:d.id,name:d.name||`Device-${d.id.slice(0,6)}`,type:'Unknown',icon:Bluetooth,color:'#90A4AE',classBy:'—',connected:false,probing:true,services:[],serviceCount:0,charCount:0,totalBytes:0,gattDump:[],rssiHistory:[],capturedAt:Date.now(),bt:d};
      setDevices(p=>[...p,raw]);
      const probed=await deepProbe(raw);
      if(mtd.current){setDevices(p=>p.map(x=>x.id===d.id?probed:x));await saveToVault(probed);}
    }catch(e:any){if(e.name!=='NotFoundError'){setErr(e.message);log('ERROR','SCANNER',e.message);}else log('INFO','SCANNER','Picker dismissed');}
    finally{if(mtd.current)setScanning(false);}
  },[devices,scanning,deepProbe,onDC,setErr,log,saveToVault]);

  /* ═══ CONNECT / DISCONNECT ═══ */
  const connect=useCallback(async(dev:BLEDev)=>{if(!dev.bt?.gatt||connecting)return;setConnecting(dev.id);log('CONNECT',dev.name,'Connecting...');
    try{const s=await dev.bt.gatt.connect();let b=dev.battery;try{const bs=await s.getPrimaryService(0x180F);const bc=await bs.getCharacteristic(0x2A19);b=(await bc.readValue()).getUint8(0);}catch{}
      setDevices(p=>p.map(d=>d.id===dev.id?{...d,connected:true,srv:s,battery:b}:d));log('CONNECT',dev.name,'✓ Connected');
    }catch(e:any){setErr(e.message);log('ERROR',dev.name,e.message);}finally{if(mtd.current)setConnecting(null);}
  },[connecting,setErr,log]);
  const disconnect=useCallback((dev:BLEDev)=>{try{dev.bt?.gatt?.connected&&dev.bt.gatt.disconnect();}catch{}setDevices(p=>p.map(d=>d.id===dev.id?{...d,connected:false,srv:undefined}:d));if(gattTarget===dev.id){setGattTarget(null);setGattSvcs([]);}log('DISCONNECT',dev.name,'Dropped');},[gattTarget,log]);

  /* ═══ GATT EXPLORER ═══ */
  const explore=useCallback(async(dev:BLEDev)=>{if(!dev.bt?.gatt)return;if(!dev.bt.gatt.connected){try{await dev.bt.gatt.connect();}catch{return;}}
    setGattTarget(dev.id);setGattLoading(true);setGattSvcs([]);setExSvc(null);log('ENUM',dev.name,'Full GATT enumeration...');
    try{const svcs=await dev.bt.gatt.getPrimaryServices();const result:Svc[]=[];
      for(const s of svcs){const sn=nameUUID(s.uuid);const chars:Chr[]=[];
        try{for(const ch of await s.getCharacteristics()){let value:string|undefined,hex:string|undefined;
          if(ch.properties.read){try{const v=await ch.readValue();const d=decode(v);value=d.text;hex=d.hex;log('READ',dev.name,`${nameUUID(ch.uuid)}: ${d.text.slice(0,60)}`,d.hex,v.byteLength);}catch{}}
          chars.push({uuid:ch.uuid,name:nameUUID(ch.uuid),p:{r:ch.properties.read,w:ch.properties.write,wn:ch.properties.writeWithoutResponse,n:ch.properties.notify,i:ch.properties.indicate},value,hex,char:ch});
        }}catch{}result.push({uuid:s.uuid,name:sn,chars});}
      if(mtd.current){setGattSvcs(result);if(result.length>0)setExSvc(result[0].uuid);}
      log('INFO',dev.name,`✓ ${result.length} services, ${result.reduce((a,s)=>a+s.chars.length,0)} characteristics`);
    }catch(e:any){log('ERROR',dev.name,e.message);}finally{if(mtd.current)setGattLoading(false);}
  },[log]);
  const toggleN=useCallback(async(su:string,ch:Chr,dn:string)=>{if(!ch.char)return;const key=`${su}/${ch.uuid}`;try{if(ch.notifying){await ch.char.stopNotifications();const l=nL.current.get(key);if(l){ch.char.removeEventListener('characteristicvaluechanged',l);nL.current.delete(key);}setGattSvcs(p=>p.map(s=>s.uuid===su?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,notifying:false}:c)}:s));log('SUB',dn,`✗ ${ch.name}`);}else{await ch.char.startNotifications();const listener=(e:Event)=>{if(!mtd.current)return;const t=(e.target as BluetoothRemoteGATTCharacteristic).value;if(!t)return;const d=decode(t);setGattSvcs(p=>p.map(s=>s.uuid===su?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,value:d.text,hex:d.hex}:c)}:s));log('NOTIFY',dn,`${ch.name}: ${d.text.slice(0,50)}`,d.hex,t.byteLength);};ch.char.addEventListener('characteristicvaluechanged',listener);nL.current.set(key,listener);setGattSvcs(p=>p.map(s=>s.uuid===su?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,notifying:true}:c)}:s));log('SUB',dn,`✓ ${ch.name}`);}}catch(e:any){log('ERROR',dn,(e.message||'').slice(0,40));}
  },[log]);

  /* ═══ NETWORK RECON ═══ */
  const runNetRecon=useCallback(async()=>{if(netLoading)return;setNetLoading(true);log('NET','RECON','══ NETWORK RECON ══');
    const intel=await probeNetwork();
    intel.localIPs.forEach(ip=>log('NET','RECON',`Local IP: ${ip}`));
    if(intel.type)log('NET','RECON',`Connection: ${intel.type} ↓${intel.downlink}Mbps RTT:${intel.rtt}ms`);
    intel.openPorts.forEach(p=>log('NET','RECON',`Port ${p.port} OPEN → ${p.service} (${p.ms}ms)`));
    log('INFO','RECON',`Network scan complete — ${intel.localIPs.length} IPs, ${intel.openPorts.length} open ports`);
    if(mtd.current){setNetIntel(intel);setNetLoading(false);}
  },[netLoading,log]);

  /* ═══ EXPORT ═══ */
  const exportJSON=useCallback(()=>{
    const payload={version:'marauder_v8',exported:new Date().toISOString(),devices:devices.map(d=>({...d,bt:undefined,srv:undefined})),network:netIntel,packetCount:pkts.length,totalBytes:bytes};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`marauder_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();URL.revokeObjectURL(url);
    log('INFO','EXPORT',`Exported ${devices.length} devices to JSON`);
  },[devices,netIntel,pkts.length,bytes,log]);
  const exportCSV=useCallback(()=>{
    const rows=[['Name','Type','Manufacturer','Model','Serial','Battery','TX Power','Services','Chars','Bytes','Lat','Lng','GPS Acc','Captured'].join(',')];
    devices.forEach(d=>rows.push([d.name,d.type,d.manufacturer||'',d.model||'',d.serial||'',d.battery!=null?String(d.battery):'',d.txPower!=null?String(d.txPower):'',String(d.serviceCount),String(d.charCount),String(d.totalBytes),d.geo?d.geo.lat.toFixed(6):'',d.geo?d.geo.lng.toFixed(6):'',d.geo?String(Math.round(d.geo.acc)):'',new Date(d.capturedAt).toISOString()].map(v=>`"${v}"`).join(',')));
    const blob=new Blob([rows.join('\n')],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`marauder_${new Date().toISOString().replace(/[:.]/g,'-')}.csv`;a.click();URL.revokeObjectURL(url);
    log('INFO','EXPORT',`Exported ${devices.length} devices to CSV`);
  },[devices,log]);

  // Derived
  const upSec=Math.floor((Date.now()-t0.current)/1000);const upStr=`${Math.floor(upSec/60).toString().padStart(2,'0')}:${(upSec%60).toString().padStart(2,'0')}`;
  const liveCount=devices.filter(d=>d.connected).length;
  const geoCount=devices.filter(d=>d.geo).length;

  /* ═══════════════════════════════════════════════════════════════
     R E N D E R
     ═══════════════════════════════════════════════════════════════ */
  const inner=(
    <div className={`glass-panel flex flex-col overflow-hidden pointer-events-auto shrink-0 ${full?'w-full h-full':'h-[500px] max-h-[80vh] resize-y'}`}>

      {/* ─── HEADER ─── */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(0,0,0,0.3)] hover:bg-[var(--hover-accent)] transition-colors">
        <button onClick={()=>setExpanded(!expanded)} className="flex items-center gap-2 flex-1">
          <Crosshair className="w-3.5 h-3.5 text-[var(--cyan-primary)]"/>
          <span className="hud-text text-[12px] text-[var(--text-primary)]">MARAUDER</span>
          <span className="gotham-tag gotham-tag--info" style={{fontSize:'10px',padding:'1px 5px'}}>{devices.length} DEVS</span>
          {scanning&&<span className="gotham-tag" style={{fontSize:'10px',padding:'1px 5px',background:'rgba(0,230,255,0.1)',color:'var(--cyan-primary)'}}>SCANNING</span>}
        </button>
        <div className="flex items-center gap-2">
          <motion.button whileTap={{scale:0.95}} onClick={scan} disabled={scanning||!btOk}
            className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold tracking-wider flex items-center gap-1.5 disabled:opacity-30"
            style={{background:scanning?'rgba(0,230,255,0.08)':'rgba(0,230,255,0.12)',color:'var(--cyan-primary)',border:'1px solid rgba(0,230,255,0.12)'}}>
            {scanning?<BluetoothSearching className="w-3 h-3 animate-pulse"/>:<Bluetooth className="w-3 h-3"/>}{scanning?'...':'SCAN'}
          </motion.button>
          {geoCount>0&&<motion.button whileTap={{scale:0.95}} onClick={placeOnWorldMap}
            className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold tracking-wider flex items-center gap-1.5"
            style={{background:'rgba(255,183,77,0.08)',color:'#FFB74D',border:'1px solid rgba(255,183,77,0.1)'}}>
            <MapPin className="w-3 h-3"/>VIEW ON MAP
          </motion.button>}
          <button onClick={()=>setFull(!full)} className="p-1.5 -m-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors" title="Full Screen">
            {full?<Minimize2 className="w-3.5 h-3.5"/>:<Maximize2 className="w-3.5 h-3.5"/>}
          </button>
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--cyan-primary)] animate-osiris-pulse"/>
          <button onClick={()=>setExpanded(!expanded)}>
            {expanded?<ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]"/>:<ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]"/>}
          </button>
        </div>
      </div>

      {/* ─── COLLAPSIBLE BODY ─── */}
      <AnimatePresence>{expanded&&(
        <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.2}} className="flex-1 flex flex-col overflow-hidden min-h-0">

          {/* Tab Bar */}
          <div className="flex items-center px-2 py-1.5 shrink-0 gap-0.5 border-b border-[rgba(255,255,255,0.04)]" style={{background:'rgba(0,0,0,0.2)'}}>
            {([['scan','DEVICES',Scan],['intel','INTEL',Globe],['log','LOG',Terminal]] as const).map(([id,label,Icon])=>(
              <button key={id} onClick={()=>setView(id as any)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-mono font-bold tracking-[0.12em] transition-all flex-1 justify-center"
                style={{color:view===id?'var(--cyan-primary)':'var(--text-muted)',background:view===id?'rgba(0,230,255,0.06)':'transparent'}}>
                <Icon className="w-3 h-3"/>{label}
              </button>
            ))}
          </div>

          {/* Error */}
          <AnimatePresence>{error&&<motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden shrink-0"><div className="mx-2 mt-1.5 px-2.5 py-1.5 rounded-lg flex items-center gap-2" style={{background:'rgba(255,61,61,0.04)',border:'1px solid rgba(255,61,61,0.1)'}}><AlertTriangle className="w-3 h-3 text-[#FF3D3D] shrink-0"/><span className="text-[10px] font-mono text-[#FF3D3D] flex-1 truncate">{error}</span><button onClick={()=>setError(null)}><X className="w-2.5 h-2.5 text-[#FF3D3D]/50"/></button></div></motion.div>}</AnimatePresence>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex min-h-0">

            {/* ═══ DEVICES TAB ═══ */}
            {view==='scan'&&(
              <div className="flex-1 overflow-y-auto styled-scrollbar px-2.5 py-2.5 space-y-2">
                {devices.length===0&&!scanning&&btOk&&(
                  <div className="flex flex-col items-center justify-center py-8 opacity-40">
                    <Crosshair className="w-8 h-8 text-[var(--cyan-primary)] mb-2"/>
                    <p className="text-[11px] font-mono text-[var(--text-muted)] text-center tracking-wider">
                      Hit <span className="text-[var(--cyan-primary)]">SCAN</span> to acquire targets<br/>
                      <span className="text-[10px] opacity-50">Auto-vacuum · GPS-tagged · Vault</span>
                    </p>
                  </div>
                )}
                {!btOk&&<div className="p-2 rounded-lg" style={{background:'rgba(255,61,61,0.04)',border:'1px solid rgba(255,61,61,0.08)'}}><span className="text-[10px] font-mono text-[#FF3D3D]">Web Bluetooth unavailable — use Chrome/Edge on localhost</span></div>}

                {devices.map(dev=>{const isE=exDev===dev.id;const isG=gattTarget===dev.id;const isC=connecting===dev.id;
                  return(<motion.div key={dev.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} layout>
                    <div className="rounded-xl overflow-hidden transition-all" style={{background:dev.connected?`linear-gradient(135deg,${dev.color}06,${dev.color}02)`:'rgba(255,255,255,0.015)',border:`1px solid ${dev.connected?dev.color+'15':'rgba(255,255,255,0.04)'}`,boxShadow:dev.connected?`0 0 16px ${dev.color}08`:'none'}}>

                      {/* Card header */}
                      <button className="w-full px-3 py-2.5 flex items-center gap-2.5 text-left" onClick={()=>setExDev(isE?null:dev.id)}>
                        <motion.div animate={dev.probing?{rotate:[0,360]}:{}} transition={{duration:2,repeat:Infinity,ease:'linear'}} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 relative" style={{background:`linear-gradient(135deg,${dev.color}12,${dev.color}05)`,border:`1px solid ${dev.color}18`}}>
                          {dev.probing||isC?<div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{borderColor:dev.color,borderTopColor:'transparent'}}/>:<dev.icon className="w-4 h-4" style={{color:dev.color}}/>}
                          {dev.connected&&<div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--alert-green)] border animate-pulse" style={{borderColor:'#0D0D0C'}}/>}
                        </motion.div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[12px] font-mono font-bold text-[var(--text-primary)] truncate">{dev.name}</span>
                            {dev.connected&&<span className="text-[10px] font-mono px-1 py-0.5 rounded bg-[var(--alert-green)]/10 text-[var(--alert-green)] tracking-widest font-bold">LIVE</span>}
                          </div>
                          {dev.probing?(
                            <div className="flex items-center gap-2"><motion.div className="h-1 rounded-full flex-1" style={{background:`${dev.color}10`}}><motion.div className="h-full rounded-full" style={{background:dev.color}} animate={{width:['0%','60%','100%']}} transition={{duration:3}}/></motion.div><span className="text-[10px] font-mono animate-pulse" style={{color:dev.color}}>VACUUMING</span></div>
                          ):(
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded tracking-wider font-bold" style={{background:`${dev.color}10`,color:dev.color}}>{dev.type.toUpperCase()}</span>
                              {dev.battery!=null&&<span className="text-[10px] font-mono flex items-center gap-0.5" style={{color:dev.battery>50?'var(--alert-green)':dev.battery>20?'#FFB800':'#FF3D3D'}}><BatteryMedium className="w-2.5 h-2.5"/>{dev.battery}%</span>}
                              {dev.geo&&<span className="text-[10px] font-mono text-[#FFB74D] flex items-center gap-0.5"><MapPin className="w-2 h-2"/></span>}
                              <span className="text-[10px] font-mono text-[var(--text-muted)]">{dev.serviceCount}svcs · {dev.probeMs}ms</span>
                            </div>
                          )}
                        </div>
                        <ChevronDown className={`w-3 h-3 text-[var(--text-muted)] transition-transform shrink-0 ${isE?'rotate-180':''}`}/>
                      </button>

                      {/* Expanded */}
                      <AnimatePresence>{isE&&!dev.probing&&(<motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden"><div className="px-3 pb-3" style={{borderTop:'1px solid rgba(255,255,255,0.03)'}}>

                        {/* Device Info */}
                        <div className="mt-2 mb-2.5 rounded-lg p-2.5" style={{background:'rgba(0,0,0,0.25)',border:'1px solid rgba(255,255,255,0.03)'}}>
                          <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-[0.2em] mb-1.5 font-bold">DEVICE INTEL</div>
                          <div className="space-y-1">
                            {[{k:'Manufacturer',v:dev.manufacturer},{k:'Model',v:dev.model},{k:'Serial',v:dev.serial},{k:'Firmware',v:dev.firmware},{k:'TX Power',v:dev.txPower!=null?`${dev.txPower} dBm`:undefined}].filter(x=>x.v).map(x=>(
                              <div key={x.k} className="flex gap-2"><span className="text-[10px] font-mono text-[var(--text-muted)] w-[65px] shrink-0 tracking-wider">{x.k}</span><span className="text-[10px] font-mono text-[var(--text-primary)] truncate">{x.v}</span></div>
                            ))}
                            {dev.geo&&<div className="flex gap-2"><span className="text-[10px] font-mono text-[var(--text-muted)] w-[65px] shrink-0 tracking-wider">GPS</span><span className="text-[10px] font-mono text-[#FFB74D]">{dev.geo.lat.toFixed(5)}, {dev.geo.lng.toFixed(5)} ±{Math.round(dev.geo.acc)}m</span></div>}
                            <div className="flex gap-2"><span className="text-[10px] font-mono text-[var(--text-muted)] w-[65px] shrink-0 tracking-wider">Extracted</span><span className="text-[10px] font-mono text-[var(--text-muted)]">{dev.serviceCount}svcs · {dev.charCount}chars · {dev.gattDump.length}vals · {dev.totalBytes}B</span></div>
                          </div>
                        </div>

                        {/* Services */}
                        {dev.services.length>0&&<div className="flex flex-wrap gap-1 mb-2.5">{dev.services.map((s,i)=><span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded tracking-wider" style={{background:`${dev.color}06`,color:`${dev.color}70`}}>{s}</span>)}</div>}

                        {/* GATT Dump */}
                        {dev.gattDump.length>0&&<div className="mb-2.5"><div className="text-[10px] font-mono text-[var(--text-muted)] tracking-[0.15em] mb-1 font-bold">VACUUM DUMP ({dev.gattDump.length})</div><div className="max-h-[120px] overflow-y-auto styled-scrollbar rounded-lg" style={{background:'rgba(0,0,0,0.3)'}}>
                          {dev.gattDump.map((g,i)=><div key={i} className="px-2 py-1 flex items-start gap-1.5 hover:bg-white/[0.02]" style={{borderBottom:'1px solid rgba(255,255,255,0.02)'}}><span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0 w-[50px] truncate">{g.svc}</span><span className="text-[10px] font-mono shrink-0 w-[50px] truncate" style={{color:dev.color}}>{g.char}</span><span className="text-[10px] font-mono text-[var(--text-primary)] flex-1 truncate">{g.value}</span></div>)}
                        </div></div>}

                        <div className="text-[10px] font-mono text-[var(--text-muted)] mb-2.5 opacity-20 tracking-wider">{dev.id}</div>

                        {/* Actions */}
                        <div className="flex gap-1.5 flex-wrap">
                          {dev.bt&&(dev.connected?(<>
                            <motion.button whileTap={{scale:0.95}} onClick={()=>explore(dev)} className="flex-1 py-1.5 rounded-lg text-[10px] font-mono font-bold tracking-wider flex items-center justify-center gap-1.5" style={{background:`${dev.color}08`,color:dev.color,border:`1px solid ${dev.color}10`}}><Layers className="w-3 h-3"/>GATT</motion.button>
                            <motion.button whileTap={{scale:0.95}} onClick={()=>disconnect(dev)} className="py-1.5 px-2.5 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1" style={{background:'rgba(255,61,61,0.05)',color:'#FF6B6B',border:'1px solid rgba(255,61,61,0.06)'}}><Unplug className="w-3 h-3"/>DROP</motion.button>
                          </>):(<>
                            <motion.button whileTap={{scale:0.95}} onClick={()=>connect(dev)} disabled={!!connecting} className="flex-1 py-2 rounded-lg text-[10px] font-mono font-bold tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-30" style={{background:`${dev.color}08`,color:dev.color,border:`1px solid ${dev.color}10`}}><Zap className="w-3 h-3"/>{isC?'PAIRING...':'CONNECT'}</motion.button>
                          </>))}
                          {dev.geo&&<motion.button whileTap={{scale:0.95}} onClick={()=>placeSingleOnMap(dev)} className="py-1.5 px-2.5 rounded-lg text-[10px] font-mono font-bold tracking-wider flex items-center gap-1" style={{background:'rgba(255,183,77,0.06)',color:'#FFB74D',border:'1px solid rgba(255,183,77,0.08)'}}><MapPin className="w-3 h-3"/>VIEW ON MAP</motion.button>}
                        </div>

                        {/* GATT Explorer */}
                        <AnimatePresence>{isG&&(<motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden"><div className="mt-2.5 pt-2.5" style={{borderTop:`1px solid ${dev.color}08`}}>
                          <div className="flex items-center justify-between mb-2"><span className="text-[10px] font-mono font-bold tracking-[0.12em]" style={{color:dev.color}}>GATT TREE</span><button onClick={()=>{setGattTarget(null);setGattSvcs([]);}}><X className="w-2.5 h-2.5 text-[var(--text-muted)]"/></button></div>
                          {gattLoading?<div className="flex items-center justify-center py-3 gap-1.5"><div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{borderColor:dev.color,borderTopColor:'transparent'}}/><span className="text-[10px] font-mono animate-pulse" style={{color:dev.color}}>Enumerating...</span></div>
                          :gattSvcs.map(svc=>(<div key={svc.uuid} className="mb-0.5">
                            <button onClick={()=>setExSvc(exSvc===svc.uuid?null:svc.uuid)} className="w-full px-2 py-1.5 rounded-lg flex items-center gap-1.5 text-left hover:bg-white/[0.02]">
                              <Bluetooth className="w-2.5 h-2.5 shrink-0" style={{color:dev.color}}/><span className="text-[10px] font-mono font-bold text-[var(--text-primary)] truncate flex-1">{svc.name}</span><span className="text-[10px] font-mono" style={{color:`${dev.color}80`}}>{svc.chars.length}</span><ChevronRight className={`w-2.5 h-2.5 text-[var(--text-muted)] transition-transform ${exSvc===svc.uuid?'rotate-90':''}`}/>
                            </button>
                            <AnimatePresence>{exSvc===svc.uuid&&(<motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden"><div className="pl-3 pr-1 py-1 space-y-1">{svc.chars.map(ch=>{const ck=`${svc.uuid}/${ch.uuid}`;const fl=[ch.p.r&&'R',ch.p.w&&'W',ch.p.wn&&'Wn',ch.p.n&&'N',ch.p.i&&'I'].filter(Boolean).join('·');const wV=wIn[ck]||'';const wOk=!wV||validHex(wV);return(
                              <div key={ch.uuid} className="p-2 rounded-lg" style={{background:'rgba(0,0,0,0.25)',borderLeft:`2px solid ${dev.color}12`}}>
                                <div className="flex items-center gap-1 mb-1"><span className="text-[10px] font-mono font-bold text-[var(--text-primary)] truncate flex-1">{ch.name}</span><span className="text-[10px] font-mono px-1 py-0.5 rounded" style={{background:`${dev.color}06`,color:`${dev.color}80`}}>{fl}</span></div>
                                {ch.value&&<div className="flex items-center gap-1 mb-1"><div className="flex-1 rounded px-1.5 py-1 min-w-0" style={{background:'rgba(0,0,0,0.3)'}}><div className={`text-[10px] font-mono truncate ${ch.notifying?'text-[#00FF88]':'text-[var(--alert-green)]'}`}>{ch.value}</div>{ch.hex&&ch.hex!==ch.value&&<div className="text-[10px] font-mono text-[var(--text-muted)] truncate mt-0.5 opacity-40">{ch.hex}</div>}</div><button onClick={()=>{navigator.clipboard?.writeText(ch.value||'');setCopied(ck);setTimeout(()=>setCopied(null),1500);}} className="p-0.5 rounded hover:bg-white/5 shrink-0">{copied===ck?<Check className="w-2 h-2 text-[var(--alert-green)]"/>:<Copy className="w-2 h-2 text-[var(--text-muted)]"/>}</button></div>}
                                <div className="flex items-center gap-1 flex-wrap">
                                  {ch.p.r&&<button onClick={async()=>{if(!ch.char)return;try{const v=await ch.char.readValue();const d=decode(v);setGattSvcs(sv=>sv.map(s=>s.uuid===svc.uuid?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,value:d.text,hex:d.hex}:c)}:s));log('READ',dev.name,`${ch.name}: ${d.text.slice(0,50)}`,d.hex,v.byteLength);}catch{log('ERROR',dev.name,`Read: ${ch.name}`);}}} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono" style={{background:`${dev.color}06`,color:dev.color}}><Eye className="w-2 h-2"/>READ</button>}
                                  {ch.p.n&&<button onClick={()=>toggleN(svc.uuid,ch,dev.name)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono" style={{background:ch.notifying?'rgba(0,255,136,0.06)':'rgba(255,255,255,0.02)',color:ch.notifying?'#00FF88':'var(--text-muted)'}}>{ch.notifying?<Bell className="w-2 h-2"/>:<BellOff className="w-2 h-2"/>}{ch.notifying?'LIVE':'SUB'}</button>}
                                  {(ch.p.w||ch.p.wn)&&<div className="flex items-center gap-0.5 flex-1"><input type="text" placeholder="FF 01" value={wV} onChange={e=>setWIn(iv=>({...iv,[ck]:e.target.value}))} className="flex-1 rounded px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-primary)] outline-none min-w-0" style={{background:'rgba(0,0,0,0.3)',border:`1px solid ${wOk?'transparent':'rgba(255,61,61,0.3)'}`}}/><button onClick={async()=>{if(!ch.char||!wV||!validHex(wV))return;try{await writeSafe(ch.char,parseHex(wV),ch.p.w);log('WRITE',dev.name,`${ch.name} ← ${wV}`);setWIn(iv=>({...iv,[ck]:''}));}catch{log('ERROR',dev.name,`Write: ${ch.name}`);}}} disabled={!wV||!wOk} className="p-0.5 rounded shrink-0 disabled:opacity-30" style={{color:'#FFB800'}}><Send className="w-2 h-2"/></button></div>}
                                </div>
                              </div>);})}</div></motion.div>)}</AnimatePresence>
                          </div>))}
                        </div></motion.div>)}</AnimatePresence>
                      </div></motion.div>)}</AnimatePresence>
                    </div>
                  </motion.div>);
                })}
              </div>
            )}

            {/* ═══ INTEL TAB ═══ */}
            {view==='intel'&&(
              <div className="flex-1 overflow-y-auto styled-scrollbar p-2.5 space-y-2.5">
                {/* Network Recon */}
                <div className="rounded-xl overflow-hidden" style={{background:'rgba(255,255,255,0.015)',border:'1px solid rgba(255,255,255,0.04)'}}>
                  <div className="px-3 py-2 flex items-center justify-between" style={{borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                    <div className="flex items-center gap-1.5"><Globe className="w-3 h-3 text-[#80DEEA]"/><span className="text-[10px] font-mono font-bold tracking-[0.12em] text-[var(--text-primary)]">NETWORK RECON</span></div>
                    <motion.button whileTap={{scale:0.95}} onClick={runNetRecon} disabled={netLoading} className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider disabled:opacity-30" style={{background:'rgba(128,222,234,0.06)',color:'#80DEEA',border:'1px solid rgba(128,222,234,0.08)'}}>{netLoading?'...':'PROBE'}</motion.button>
                  </div>
                  {!netIntel&&<div className="px-3 py-4 text-center"><span className="text-[10px] font-mono text-[var(--text-muted)] opacity-30">Tap PROBE to scan local network</span></div>}
                  {netIntel&&<div className="p-2.5 space-y-2">
                    {netIntel.localIPs.length>0&&<div><div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wider mb-1 font-bold">LOCAL IPs</div>{netIntel.localIPs.map((ip,i)=><div key={i} className="text-[11px] font-mono text-[#80DEEA] pl-2">{ip}</div>)}</div>}
                    {netIntel.type&&<div className="flex gap-3">{[{l:'TYPE',v:netIntel.type},{l:'DOWN',v:netIntel.downlink!=null?`${netIntel.downlink}Mbps`:undefined},{l:'RTT',v:netIntel.rtt!=null?`${netIntel.rtt}ms`:undefined}].filter(x=>x.v).map(x=><div key={x.l}><div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wider">{x.l}</div><div className="text-[11px] font-mono text-[var(--text-primary)] font-bold">{x.v}</div></div>)}</div>}
                    {netIntel.openPorts.length>0&&<div><div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wider mb-1 font-bold">OPEN PORTS</div>{netIntel.openPorts.map((p,i)=><div key={i} className="flex items-center gap-2 pl-2 py-0.5"><span className="text-[10px] font-mono font-bold text-[var(--alert-green)]">:{p.port}</span><span className="text-[10px] font-mono text-[var(--text-muted)]">{p.service}</span></div>)}</div>}
                  </div>}
                </div>
                {/* Export */}
                <div className="rounded-xl overflow-hidden" style={{background:'rgba(255,255,255,0.015)',border:'1px solid rgba(255,255,255,0.04)'}}>
                  <div className="px-3 py-2 flex items-center gap-1.5" style={{borderBottom:'1px solid rgba(255,255,255,0.03)'}}><Database className="w-3 h-3 text-[#FFB800]"/><span className="text-[10px] font-mono font-bold tracking-[0.12em] text-[var(--text-primary)]">VAULT & EXPORT</span></div>
                  <div className="p-2.5 space-y-1.5">
                    <div className="text-[10px] font-mono text-[var(--text-muted)]">{vaultCount} device{vaultCount!==1?'s':''} · {bytes>1024?`${(bytes/1024).toFixed(1)}KB`:`${bytes}B`}</div>
                    <div className="flex gap-1.5">
                      <motion.button whileTap={{scale:0.95}} onClick={exportJSON} disabled={devices.length===0} className="flex-1 py-1.5 rounded-lg text-[10px] font-mono font-bold tracking-wider flex items-center justify-center gap-1 disabled:opacity-30" style={{background:'rgba(255,184,0,0.06)',color:'#FFB800',border:'1px solid rgba(255,184,0,0.08)'}}><Download className="w-2.5 h-2.5"/>JSON</motion.button>
                      <motion.button whileTap={{scale:0.95}} onClick={exportCSV} disabled={devices.length===0} className="flex-1 py-1.5 rounded-lg text-[10px] font-mono font-bold tracking-wider flex items-center justify-center gap-1 disabled:opacity-30" style={{background:'rgba(0,255,136,0.06)',color:'#00FF88',border:'1px solid rgba(0,255,136,0.08)'}}><Download className="w-2.5 h-2.5"/>CSV</motion.button>
                      <motion.button whileTap={{scale:0.95}} onClick={async()=>{await vaultClear();setVaultCount(0);log('INFO','VAULT','Vault cleared');}} className="py-1.5 px-2.5 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1" style={{background:'rgba(255,61,61,0.04)',color:'#FF6B6B',border:'1px solid rgba(255,61,61,0.06)'}}><Trash2 className="w-2.5 h-2.5"/>WIPE</motion.button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ LOG TAB ═══ */}
            {view==='log'&&(
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1 shrink-0" style={{background:'rgba(0,0,0,0.3)',borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                  <span className="text-[10px] font-mono text-[var(--text-muted)] tracking-wider">{pkts.length} pkts · {bytes>1024?`${(bytes/1024).toFixed(1)}KB`:`${bytes}B`}</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={()=>setPaused(!paused)} className={`text-[10px] font-mono tracking-wider px-1 py-0.5 rounded flex items-center gap-0.5 ${paused?'text-[#FFB800]':'text-[var(--text-muted)]'}`}>{paused?<><Pause className="w-2 h-2"/>PAUSE</>:<><Play className="w-2 h-2"/>LIVE</>}</button>
                    <button onClick={()=>{setPkts([]);setBytes(0);pid.current=0;}} className="text-[10px] font-mono text-[var(--text-muted)] tracking-wider px-1 py-0.5 rounded hover:bg-white/5 flex items-center gap-0.5"><Trash2 className="w-2 h-2"/>CLR</button>
                  </div>
                </div>
                <div ref={logEl} className="flex-1 overflow-y-auto styled-scrollbar font-mono" style={{background:'#020406'}}>
                  {pkts.length===0?<div className="flex items-center justify-center h-full opacity-15"><span className="text-[10px] font-mono text-[var(--text-muted)] tracking-wider">Scan to see packets...</span></div>
                  :<div className="py-0.5">{pkts.map(p=>{const oc=OP_CLR[p.op]||'#90A4AE';return(<div key={p.id} className="px-2 py-[2px] flex items-start hover:bg-white/[0.015] border-b border-white/[0.01] group" style={{fontSize:10,lineHeight:'16px'}}><span className="text-white/8 shrink-0 w-[24px] tabular-nums text-right pr-1.5">{p.id}</span><span className="text-[var(--text-muted)]/30 shrink-0 w-[58px] tabular-nums">{fts(p.ts)}</span><span className="shrink-0 font-bold tracking-wider w-[44px]" style={{color:oc}}>{p.op}</span><span className="text-[var(--cyan-primary)]/40 shrink-0 truncate w-[55px]">{p.src}</span><span className="text-[var(--text-secondary)] flex-1 truncate">{p.msg}</span>{p.len!=null&&<span className="text-[var(--text-muted)]/12 ml-1 shrink-0 tabular-nums">{p.len}B</span>}</div>);})}</div>}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-1.5 shrink-0" style={{borderTop:'1px solid rgba(255,255,255,0.03)',background:'rgba(0,0,0,0.2)'}}>
            <div className="flex items-center gap-1.5"><div className={`w-1.5 h-1.5 rounded-full ${btOk?'bg-[var(--alert-green)]':'bg-[#FF3D3D]'} ${scanning?'animate-pulse':''}`}/><span className="text-[10px] font-mono text-[var(--text-muted)] tracking-wider">{scanning?'SCANNING':liveCount>0?`${liveCount} LIVE`:'STANDBY'} · {upStr}</span></div>
            <span className="text-[10px] font-mono text-[var(--text-muted)]/15 tracking-[0.2em]">MARAUDER V8</span>
          </div>
        </motion.div>
      )}</AnimatePresence>
    </div>
  );

  if(full)return createPortal(<motion.div initial={{opacity:0}} animate={{opacity:1}} className="fixed inset-0 z-[9999] flex" style={{background:'rgba(0,0,0,0.95)',backdropFilter:'blur(12px)'}}><div className="w-full h-full p-4 flex">{inner}</div></motion.div>,document.body);
  return inner;
}
