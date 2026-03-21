import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import pinataSDK from '@pinata/sdk';
import { applyVisibleWatermark, calculateSHA256, calculatePHash } from './src/hashUtils.js';

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
const corsOrigin = (process.env.CORS_ORIGIN || '').trim();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeOrigin = (value) => value.replace(/\/$/, '');

const parseAllowedOrigins = (originCsv) => {
  const entries = originCsv.split(',').map((entry) => normalizeOrigin(entry.trim())).filter(Boolean);
  const exact = new Set();
  const patterns = [];

  for (const entry of entries) {
    if (entry.includes('*')) {
      const regex = new RegExp(`^${escapeRegex(entry).replace(/\\\*/g, '.*')}$`);
      patterns.push(regex);
    } else {
      exact.add(entry);
    }
  }

  return { exact, patterns };
};

const configuredCors = corsOrigin ? parseAllowedOrigins(corsOrigin) : null;

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (!configuredCors) return true;

  const normalized = normalizeOrigin(origin);
  if (configuredCors.exact.has(normalized)) return true;
  return configuredCors.patterns.some((pattern) => pattern.test(normalized));
};

app.use(cors({
  origin: (origin, cb) => {
    if (isOriginAllowed(origin)) {
      return cb(null, true);
    }

    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  optionsSuccessStatus: 200,
}));
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
const WATERMARK_STRICT = process.env.WATERMARK_STRICT === 'true';

const extractErrorMessage = (error) => {
  const candidates = [
    typeof error?.shortMessage === 'string' ? error.shortMessage : '',
    typeof error?.stderr === 'string' ? error.stderr : '',
    typeof error?.reason === 'string' ? error.reason : '',
    typeof error?.message === 'string' ? error.message : '',
  ];

  return candidates.map((value) => value.trim()).find(Boolean) || 'Unknown error';
};

const classifyProcessingError = (error) => {
  const rawMessage = extractErrorMessage(error);
  const causeMessage = extractErrorMessage(error?.cause || {});
  const combinedMessage = `${rawMessage} ${causeMessage}`.toLowerCase();

  if (error?.code === 'CALL_EXCEPTION') {
    return {
      status: 409,
      error: 'File already registered on-chain.',
      hint: 'Try Verify for this file instead of Register.',
      isDuplicate: true,
    };
  }

  if (combinedMessage.includes('insufficient funds')) {
    return {
      status: 500,
      error: 'Blockchain transaction failed due to insufficient gas funds.',
      hint: 'Fund the PRIVATE_KEY wallet on your selected network and retry.',
    };
  }

  if (
    combinedMessage.includes('failed to detect network') ||
    combinedMessage.includes('econnrefused') ||
    combinedMessage.includes('enotfound') ||
    combinedMessage.includes('network error')
  ) {
    return {
      status: 500,
      error: 'Could not connect to blockchain RPC.',
      hint: 'Check RPC_URL and network status in Render environment variables.',
    };
  }

  if (
    combinedMessage.includes('could not decode result data') ||
    combinedMessage.includes('missing revert data') ||
    combinedMessage.includes('bad data')
  ) {
    return {
      status: 500,
      error: 'Contract call failed.',
      hint: 'Check CONTRACT_ADDRESS and ABI/network match.',
    };
  }

  if (combinedMessage.includes('pinata')) {
    return {
      status: 500,
      error: 'IPFS pinning failed.',
      hint: 'Check PINATA_JWT_TOKEN or PINATA_API_KEY/PINATA_API_SECRET in Render.',
    };
  }

  if (
    combinedMessage.includes('watermark') ||
    combinedMessage.includes('jimp') ||
    combinedMessage.includes('font')
  ) {
    return {
      status: 500,
      error: 'Server watermark dependency failed.',
      hint: 'Set WATERMARK_STRICT=false to skip watermarking, or verify Jimp font assets are available.',
    };
  }

  return {
    status: 500,
    error: 'Error processing file.',
    hint: rawMessage,
  };
};

const getRuntimeHealth = async () => {
  const runtime = {
    rpcReachable: false,
    contractCodePresent: false,
    contractReadOk: false,
    chainId: null,
    blockNumber: null,
  };

  try {
    const network = await provider.getNetwork();
    runtime.chainId = network?.chainId?.toString?.() || null;
    runtime.blockNumber = await provider.getBlockNumber();
    runtime.rpcReachable = true;

    const contractCode = await provider.getCode(CONTRACT_ADDRESS);
    runtime.contractCodePresent = Boolean(contractCode && contractCode !== '0x');

    if (runtime.contractCodePresent) {
      try {
        await genesisContract.getRecord('__health_probe__');
        runtime.contractReadOk = true;
      } catch (readError) {
        runtime.contractReadOk = false;
        runtime.contractReadError = extractErrorMessage(readError);
      }
    } else {
      runtime.contractReadError = 'No contract bytecode at CONTRACT_ADDRESS for the configured RPC network.';
    }
  } catch (error) {
    runtime.rpcError = extractErrorMessage(error);
  }

  return runtime;
};

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
    let watermarkApplied = false;
    let watermarkWarning = null;
    let pHashWarning = null;

    if (imageFile) {
      // 2. Apply watermark in-place only for images
      const watermarkText = `Content Verification - ${new Date().toISOString()}`;
      try {
        await applyVisibleWatermark(filePath, watermarkText);
        watermarkApplied = true;
        console.log(`Watermarking complete for ${originalFilename} using Node/Jimp`);
      } catch (watermarkError) {
        if (WATERMARK_STRICT) {
          throw watermarkError;
        }

        watermarkWarning = 'Watermark skipped due to a server watermark processing issue.';
        console.warn(`Skipping watermark for ${originalFilename}: ${extractErrorMessage(watermarkError)}`);
      }
      
      // 3. Compute pHash on the final, watermarked image
      try {
        pHash = await calculatePHash(filePath);
      } catch (pHashError) {
        if (WATERMARK_STRICT) {
          throw pHashError;
        }

        pHash = 'not_available';
        pHashWarning = 'Perceptual hash skipped due to an image processing issue.';
        console.warn(`Skipping pHash for ${originalFilename}: ${extractErrorMessage(pHashError)}`);
      }
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
        ? (watermarkApplied
          ? 'Image watermarked, processed, pinned to IPFS, and registered on-chain.'
          : 'Image processed, pinned to IPFS, and registered on-chain (watermark skipped).')
        : 'File processed, pinned to IPFS, and registered on-chain.',
      filename: originalFilename,
      isImage: imageFile,
      watermarkApplied: imageFile ? watermarkApplied : false,
      ...(watermarkWarning ? { watermarkWarning } : {}),
      ...(pHashWarning ? { pHashWarning } : {}),
      fileCategory: fileCategory,
      mimetype: req.file.mimetype || 'application/octet-stream',
      sha256: sha256Hash,
      pHash: pHash,
      ipfsCid: ipfsCid,
      timestamp: ipfsResult.Timestamp
    });

  } catch (error) {
    const classified = classifyProcessingError(error);
    console.error('Error processing file:', extractErrorMessage(error));
    return res.status(classified.status).json({
      error: classified.error,
      ...(classified.hint ? { hint: classified.hint } : {}),
      ...(classified.isDuplicate ? { isDuplicate: true } : {}),
    });
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
    const classified = classifyProcessingError(error);
    console.error('Error processing verification file:', extractErrorMessage(error));
    res.status(classified.status).json({
      error: 'Error processing verification file.',
      ...(classified.hint ? { hint: classified.hint } : {}),
    });
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
app.get('/api/health', async (req, res) => {
  const runtime = await getRuntimeHealth();
  const status = runtime.rpcReachable && runtime.contractCodePresent && runtime.contractReadOk
    ? 'ok'
    : 'degraded';

  res.status(status === 'ok' ? 200 : 503).json({
    status,
    config: {
      rpcUrlConfigured: Boolean(RPC_URL),
      contractAddressConfigured: Boolean(CONTRACT_ADDRESS),
      privateKeyConfigured: Boolean(PRIVATE_KEY) || isLocalRpc,
      pinataConfigured: Boolean(pinataJwtToken || (pinataApiKey && pinataApiSecret)),
      corsConfigured: Boolean(corsOrigin),
      corsOrigin: corsOrigin || null,
      watermarkStrict: WATERMARK_STRICT,
      watermarkEngine: 'node-jimp',
    },
    runtime,
  });
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
  
  if (err && err.message && err.message.includes('CORS blocked for origin')) {
    return res.status(403).json({
      error: 'CORS blocked request origin.',
      hint: 'Add your Vercel domain to CORS_ORIGIN (supports comma-separated values and wildcard like https://*.vercel.app).',
    });
  }

  return next(err);
});

// --- Server Startup ---
app.listen(PORT, () => {
  console.log(`🚀 Digital Content Verification server listening on port ${PORT}`);
  void (async () => {
    const runtime = await getRuntimeHealth();
    if (runtime.rpcReachable && runtime.contractCodePresent && runtime.contractReadOk) {
      console.log(`✅ Runtime health check passed (chainId=${runtime.chainId}, block=${runtime.blockNumber}).`);
      return;
    }
    console.warn('⚠️ Runtime health check degraded:', runtime);
  })();
});
