/**
 * OSIRIS vision: a camera's frame, for a model to look at.
 *
 * The camera tool counts a frame in the reader's browser and reports the counts.
 * A model that reads pictures gets the frame as well, fetched again here by the
 * camera's id (moments later, so the same scene) and shrunk to 768 pixels on its
 * long side: plenty to read a road, a crowd or the weather, at a fraction of the
 * tokens of a full frame. A live stream has no still to fetch, so a model gets
 * the counts alone for those.
 */
import sharp from 'sharp';
import { catalogue, frameOf } from './frames';

export interface ModelFrame { name: string; at: string; image: { mime: string; data: string } }

export async function frameForModel(cameraId: string): Promise<ModelFrame | null> {
  try {
    const camera = (await catalogue())?.cameras.get(cameraId);
    if (!camera?.still) return null;
    const frame = await frameOf(camera);
    const jpeg = await sharp(frame.bytes).resize(768, 768, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    return { name: camera.name, at: frame.at, image: { mime: 'image/jpeg', data: jpeg.toString('base64') } };
  } catch {
    return null; // the counts still go to the model; the picture is a bonus
  }
}
