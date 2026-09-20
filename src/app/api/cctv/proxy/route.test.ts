import { describe, it, expect } from 'vitest';
import { imageType } from './route';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const png = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(8)]);

describe('imageType', () => {
  it('reads the type off the bytes when the source will not say', () => {
    // Every Singapore LTA frame arrives like this, with nosniff alongside.
    expect(imageType(jpeg, 'application/octet-stream')).toBe('image/jpeg');
    expect(imageType(png, 'application/octet-stream')).toBe('image/png');
    expect(imageType(jpeg, '')).toBe('image/jpeg');
  });

  it('takes a declared image type at its word', () => {
    expect(imageType(jpeg, 'image/png')).toBe('image/png');
    expect(imageType(Buffer.alloc(0), 'image/jpeg')).toBe('image/jpeg');
  });

  it('leaves anything it does not recognise alone', () => {
    expect(imageType(Buffer.from('not an image'), 'text/html')).toBe('text/html');
    expect(imageType(Buffer.alloc(2), 'application/octet-stream')).toBe('application/octet-stream');
  });
});
