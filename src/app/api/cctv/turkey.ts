import { fetchTurkeyBoxCameras } from './opencctv';

/**
 * Turkey's cameras are mostly its cities' own streams: Balıkesir, Konya,
 * Ankara and Istanbul's districts, played through tvkur and player.im. They
 * come through the OpenCCTV directory, which republishes them. The cities' own
 * camera sites (İBB, Kocaeli'yi Seyret) refuse connections from outside Turkey.
 */
export const fetchTurkeyCameras = fetchTurkeyBoxCameras;
