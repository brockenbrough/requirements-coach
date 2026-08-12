export type PixelCrop = { x: number; y: number; width: number; height: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', reject);
    image.src = src;
  });
}

/**
 * Longest edge of the exported avatar. Without it the export kept the crop's native resolution, so
 * a 6000×6000 selection produced a multi-megabyte JPEG — over MAX_AVATAR_BYTES, and far more than
 * a 96px avatar circle ever displays (GitHub #278).
 */
const MAX_AVATAR_EDGE_PX = 512;

/**
 * Draws the selected crop region of `imageSrc` onto a canvas sized to that
 * region (downscaled to MAX_AVATAR_EDGE_PX) and exports it as a JPEG blob. The
 * crop circle in ImageCropModal is only a framing guide — react-easy-crop
 * reports its square bounding box in `pixelCrop`, which is what actually gets
 * extracted here. Circular display is handled by the existing `rounded-full`
 * wrapper around the avatar `<img>`.
 */
export async function getCroppedImageBlob(imageSrc: string, pixelCrop: PixelCrop): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const scale = Math.min(1, MAX_AVATAR_EDGE_PX / Math.max(pixelCrop.width, pixelCrop.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(pixelCrop.width * scale);
  canvas.height = Math.round(pixelCrop.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to export cropped image.'))),
      'image/jpeg',
      0.92
    );
  });
}
