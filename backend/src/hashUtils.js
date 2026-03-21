import crypto from 'crypto';
import fs from 'fs';
import { Jimp } from 'jimp'; // This import is correct

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