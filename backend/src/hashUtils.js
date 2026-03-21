import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Jimp, loadFont, measureText, measureTextHeight } from 'jimp';

const WATERMARK_FONT_PATHS = [
  path.join(process.cwd(), 'node_modules', '@jimp', 'plugin-print', 'fonts', 'open-sans', 'open-sans-32-white', 'open-sans-32-white.fnt'),
  path.join(process.cwd(), 'node_modules', '@jimp', 'plugin-print', 'fonts', 'open-sans', 'open-sans-16-white', 'open-sans-16-white.fnt'),
  path.join(process.cwd(), 'node_modules', '@jimp', 'plugin-print', 'fonts', 'open-sans', 'open-sans-8-white', 'open-sans-8-white.fnt'),
];

const fontPromiseCache = new Map();

const getLoadedFont = async (fontPath) => {
  if (!fontPromiseCache.has(fontPath)) {
    fontPromiseCache.set(fontPath, loadFont(fontPath));
  }

  return fontPromiseCache.get(fontPath);
};

const getBestFitFont = async (text, imageWidth, margin) => {
  const maxTextWidth = Math.max(120, imageWidth - (margin * 2));

  for (const fontPath of WATERMARK_FONT_PATHS) {
    try {
      const font = await getLoadedFont(fontPath);
      const width = measureText(font, text);
      if (width <= maxTextWidth) {
        return font;
      }
    } catch (error) {
      // Try the next font path if this one isn't available.
      continue;
    }
  }

  for (const fontPath of WATERMARK_FONT_PATHS) {
    try {
      return await getLoadedFont(fontPath);
    } catch (error) {
      continue;
    }
  }

  throw new Error('No Jimp watermark font could be loaded.');
};

/**
 * Calculates the SHA-256 hash of a file.
 * (This function is correct, no changes needed)
 */
export const calculateSHA256 = (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => {
      hash.update(data);
    });
    
    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
    
    stream.on('error', (err) => {
      reject(err);
    });
  });
};

/**
 * Calculates the perceptual hash (pHash) of an image.
 */
export const calculatePHash = async (filePath) => {
  try {
    // THE FIX IS HERE:
    // We must access the 'default' export of the module
    const image = await Jimp.read(filePath);
    
    // .hash() returns the 64-bit pHash by default
    return image.hash(); 
  } catch (err) {
    console.error("pHash Error:", err.message);
    if (err.message.includes('Could not find MIME for Buffer')) {
      return 'not_an_image';
    }
    throw err;
  }
};

/**
 * Adds a visible watermark directly in Node (no Python/OpenCV dependency).
 */
export const applyVisibleWatermark = async (filePath, watermarkText) => {
  const image = await Jimp.read(filePath);
  const safeText = String(watermarkText || '').trim().slice(0, 220) || 'Content Verification';

  const margin = Math.max(10, Math.floor(Math.min(image.bitmap.width, image.bitmap.height) * 0.03));
  const maxTextWidth = Math.max(120, image.bitmap.width - (margin * 2));
  const font = await getBestFitFont(safeText, image.bitmap.width, margin);

  const textHeight = measureTextHeight(font, safeText, maxTextWidth);
  const y = Math.max(margin, image.bitmap.height - textHeight - margin);

  image.print({
    font,
    x: margin,
    y,
    text: safeText,
    maxWidth: maxTextWidth,
  });

  await image.write(filePath);
};
