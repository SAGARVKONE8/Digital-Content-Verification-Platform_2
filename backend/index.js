import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import { execa } from 'execa';
import pinataSDK from '@pinata/sdk';
import { calculateSHA256, calculatePHash } from './src/hashUtils.js';

// --- ETHERS IMPORTS ---
import { ethers } from 'ethers';
import abi from './src/GenesisRegistry.json' with { type: 'json' };

// --- Pinata Setup ---
const pinataJwtToken = process.env.PINATA_JWT_TOKEN;
const pinataApiKey = process.env.PINATA_API_KEY;
const pinataApiSecret = process.env.PINATA_API_SECRET;

let pinata;
if (pinataJwtToken) {
  pinata = new pinataSDK({ pinataJWTKey: pinataJwtToken });
} else if (pinataApiKey && pinataApiSecret) {
  pinata = new pinataSDK(pinataApiKey, pinataApiSecret);
} else {
  throw new Error(
    'Missing Pinata credentials. Set PINATA_JWT_TOKEN or both PINATA_API_KEY and PINATA_API_SECRET in backend/.env.'
  );
}

// --- ETHERS CONTRACT SETUP ---
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545/';
const rawPrivateKey = (process.env.PRIVATE_KEY || '').trim();
const PRIVATE_KEY = rawPrivateKey
  ? (rawPrivateKey.startsWith('0x') ? rawPrivateKey : `0x${rawPrivateKey}`)
  : '';

const provider = new ethers.JsonRpcProvider(RPC_URL);
const isLocalRpc = /127\.0\.0\.1|localhost/.test(RPC_URL);

let signer;
if (PRIVATE_KEY) {
  signer = new ethers.Wallet(PRIVATE_KEY, provider);
} else if (isLocalRpc) {
  signer = await provider.getSigner(0);
} else {
  throw new Error('Missing PRIVATE_KEY for non-local RPC_URL. Set PRIVATE_KEY in backend environment variables.');
}

const genesisContract = new ethers.Contract(CONTRACT_ADDRESS, abi.abi, signer);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
console.log(`✅ Connected to blockchain RPC ${RPC_URL}. Contract loaded at ${CONTRACT_ADDRESS}`);

// --- Ensure uploads directory exists ---
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log(`📁 Created uploads directory at: ${UPLOAD_DIR}`);
}

// --- Middleware ---
const app = express();
const PORT = process.env.PORT || 3001;
const corsOrigin = process.env.CORS_ORIGIN;
if (corsOrigin) {
  const allowedOrigins = corsOrigin.split(',').map((origin) => origin.trim()).filter(Boolean);
  app.use(cors({ origin: allowedOrigins }));
} else {
  app.use(cors());
}
app.use(express.json());

// --- Multer Configuration ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']);
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.csv', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']);
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

const detectFileCategory = (file) => {
  const mimetype = (file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (mimetype.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (mimetype.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (mimetype.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'file';
  return 'file';
};

const isAllowedFile = (file) => {
  const mimetype = (file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (mimetype.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return true;
  if (mimetype.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) return true;
  if (mimetype.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) return true;
  if (DOCUMENT_EXTENSIONS.has(ext)) return true;
  return false;
};

const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!isAllowedFile(file)) {
      return cb(new Error('Unsupported file type. Allowed: images, MP4/video, MP3/audio, PDF, CSV, TXT, DOC/DOCX, XLS/XLSX, PPT/PPTX.'));
    }
    cb(null, true);
  },
});

const getPinnedFilenameByCid = async (cid) => {
  const result = await pinata.pinList({ hashContains: cid, status: 'pinned', pageLimit: 10 });
  const exactMatch = (result.rows || []).find((row) => row.ipfs_pin_hash === cid);
  return exactMatch?.metadata?.name || null;
};

// --- API Endpoints ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const filePath = req.file.path;
  const originalFilename = req.file.originalname;
  const fileCategory = detectFileCategory(req.file);
  const imageFile = fileCategory === 'image';
  
  try {
    // 1. Calculate SHA-256 on the ORIGINAL file bytes (before watermarking)
    const sha256Hash = await calculateSHA256(filePath);
    console.log(`Original file hash (SHA-256): ${sha256Hash}`);

    // Prevent duplicate on-chain registration before doing expensive work.
    const existingRecord = await genesisContract.getRecord(sha256Hash);
    if (existingRecord.creator !== ZERO_ADDRESS) {
      const existingFilename = await getPinnedFilenameByCid(existingRecord.ipfsCid);
      const sameFilename =
        typeof existingFilename === 'string' &&
        existingFilename.trim().toLowerCase() === originalFilename.trim().toLowerCase();

      if (sameFilename) {
        return res.json({
          message: 'File already registered (same SHA-256 and filename). Returning existing record.',
          alreadyRegistered: true,
          filename: originalFilename,
          isImage: fileCategory === 'image',
          fileCategory: fileCategory,
          mimetype: req.file.mimetype || 'application/octet-stream',
          sha256: existingRecord.sha256Hash,
          pHash: existingRecord.pHash,
          ipfsCid: existingRecord.ipfsCid,
          record: {
            creator: existingRecord.creator,
            timestamp: existingRecord.timestamp.toString(),
          },
        });
      }

      return res.status(409).json({
        error: 'SHA-256 already registered with a different filename. Duplicate content cannot be re-registered.',
        isDuplicate: true,
        existingFilename,
        incomingFilename: originalFilename,
        record: {
          sha256: existingRecord.sha256Hash,
          pHash: existingRecord.pHash,
          ipfsCid: existingRecord.ipfsCid,
          creator: existingRecord.creator,
          timestamp: existingRecord.timestamp.toString(),
        },
      });
    }

    let pHash = 'not_applicable';

    if (imageFile) {
      // 2. Apply watermark in-place only for images
      const watermarkText = `Content Verification - ${new Date().toISOString()}`;
      await execa('python', ['src/watermark.py', filePath, watermarkText]); 
      console.log(`Watermarking complete for ${originalFilename}`);
      
      // 3. Compute pHash on the final, watermarked image
      pHash = await calculatePHash(filePath);
      console.log(`Hashes complete: SHA-256 (original): ${sha256Hash}, pHash (watermarked): ${pHash}`);
    } else {
      console.log(`Non-image file detected (${originalFilename}). Skipping watermark/pHash.`);
    }

    console.log('Pinning to IPFS...');
    const stream = fs.createReadStream(filePath);
    const options = {
      pinataMetadata: { name: originalFilename, keyvalues: { sha256: sha256Hash, pHash: pHash } },
    };
    const ipfsResult = await pinata.pinFileToIPFS(stream, options);
    const ipfsCid = ipfsResult.IpfsHash;
    console.log(`IPFS Pin complete! CID: ${ipfsCid}`);

    console.log("Registering record on blockchain...");
    const tx = await genesisContract.createRecord(sha256Hash, pHash, ipfsCid);
    const receipt = await tx.wait();
    console.log(`✅ Record created! Transaction hash: ${receipt.hash}`);

    res.json({
      message: imageFile
        ? 'Image watermarked, processed, pinned to IPFS, and registered on-chain.'
        : 'File processed, pinned to IPFS, and registered on-chain.',
      filename: originalFilename,
      isImage: imageFile,
      fileCategory: fileCategory,
      mimetype: req.file.mimetype || 'application/octet-stream',
      sha256: sha256Hash,
      pHash: pHash,
      ipfsCid: ipfsCid,
      timestamp: ipfsResult.Timestamp
    });

  } catch (error) {
    console.error('Error processing file:', error.message);
    if (error.code === 'CALL_EXCEPTION') {
      return res.status(409).json({
        error: 'File already registered on-chain.',
        isDuplicate: true,
      });
    }
    res.status(500).json({ error: 'Error processing file.' });
  } finally {
    fs.unlink(filePath, (err) => {
      if (err) console.error("Error deleting temp file:", err);
    });
  }
});

// --- UPDATED VERIFICATION ENDPOINT ---
app.post('/api/verify', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded for verification.' });
  }
  
  const filePath = req.file.path;
  
  try {
    // 1. Calculate the SHA-256 hash of the uploaded file
    const sha256Hash = await calculateSHA256(filePath);
    console.log(`Verification check for SHA-256: ${sha256Hash}`);

    // 2. Call the 'getRecord' function from our smart contract
    // This is a 'read' operation and doesn't cost any gas
    const record = await genesisContract.getRecord(sha256Hash);

    // 3. Check if the record exists
    // The 'creator' field will be a non-zero address if it exists
    const isAuthentic = record.creator !== ZERO_ADDRESS;

    if (isAuthentic) {
      console.log("✅ VERIFIED: Record found on-chain.");
      res.json({
        message: 'File is authentic and verified on-chain.',
        isAuthentic: true,
        record: {
          sha256: record.sha256Hash,
          pHash: record.pHash,
          ipfsCid: record.ipfsCid,
          creator: record.creator,
          // Convert BigInt to string for JSON serialization
          timestamp: record.timestamp.toString(), 
        }
      });
    } else {
      console.log("❌ NOT VERIFIED: No record found for this hash.");
      res.json({
        message: 'File not found. This content has not been registered.',
        isAuthentic: false,
        sha256: sha256Hash,
      });
    }

  } catch (error) {
    console.error('Error processing verification file:', error);
    res.status(500).json({ error: 'Error processing verification file.' });
  } finally {
    fs.unlink(filePath, (err) => {
      if (err) console.error("Error deleting temp file:", err);
    });
  }
});

// Simple health check route
app.get('/api', (req, res) => {
  res.json({ message: 'Digital Content Verification API is running!' });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum allowed size is 100 MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }

  if (err && err.message && err.message.includes('Unsupported file type')) {
    return res.status(400).json({ error: err.message });
  }

  return next(err);
});

// --- Server Startup ---
app.listen(PORT, () => {
  console.log(`🚀 Digital Content Verification server listening on port ${PORT}`);
});
