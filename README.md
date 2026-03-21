# Digital Content Verification Platform

**A platform to verify, trace, and authenticate digital content in the age of AI.**

Digital Content Verification Platform provides a transparent and secure system to verify, trace, and authenticate original digital content. By combining (test) watermarking, decentralized storage (IPFS), and blockchain immutability, it empowers creators to prove originality and helps audiences trust digital media.

## 💡 The Problem

With the exponential rise of AI-generated images and videos on social media, it has become increasingly difficult to verify the authenticity of digital content. Users often encounter deepfakes, manipulated visuals, or untraceable AI-generated media that erodes trust and accountability. There is a critical need for a transparent and secure system to verify, trace, and authenticate original digital content.

## ✨ Core Features

* **Simple Upload:** Upload photos via a simple React interface.
* **Watermarking:** Applies a (currently visible) watermark using a Python/OpenCV backend script.
* **Unique Hashing:** Generates unique content hashes (SHA-256 for integrity, Perceptual Hash for similarity).
* **Blockchain Registration:** Registers a timestamped proof of authenticity on a secure blockchain (Hardhat local node).
* **Decentralized Storage:** Stores the watermarked content on IPFS (via Pinata).
* **Instant Verification:** A "Verify" tab to check a file's authenticity against the blockchain record.

## 💻 Tech Stack

| Area | Technology |
| :--- | :--- |
| **Frontend** | React (Vite) |
| **Backend** | Node.js, Express.js, `ethers.js` |
| **File Uploads** | Multer |
| **Image Processing** | Python, OpenCV (called from Node.js) |
| **Blockchain** | Hardhat, Solidity, Ethers.js |
| **Decentralized Storage** | IPFS (Pinata) |
| **Hashing** | `jimp` (pHash), Node.js `crypto` (SHA-256) |

## 🚀 Getting Started (Local Development)

This project now has three parts that must be running at the same time: the local blockchain, the backend API, and the frontend UI.

### 1. Run the Local Blockchain

In your first terminal, start the Hardhat local node:

```bash
# Navigate to the blockchain project
cd backend/blockchain

# Run the local node
npx hardhat node
```
This will start a local blockchain at http://127.0.0.1:8545/

### 2. Deploy the Contract (One-Time Setup)

The first time you run the project, you must deploy your contract to the local node.

In a second terminal:

```bash
# Navigate to the blockchain project
cd backend/blockchain

# Deploy the contract
npx hardhat ignition deploy ignition/modules/DeployRegistry.ts --network localhost
```

This prints a contract address (e.g., `0x5FbDB2315678afecb367f032d93F642f64180aa3`). Use that value in `backend/.env` as `CONTRACT_ADDRESS`.

### 3. Run the Backend API

In the same second terminal (or a new one), start the main API server:

```bash
# Navigate to the main backend
cd backend

# Create your local env file once
cp .env.example .env

# Run the server
npm run dev
```

This will start your API server on http://localhost:3001 and connect to your local blockchain.

### 4. Run the Frontend

```bash
# Navigate to the frontend
cd frontend

# Create your local env file once
cp .env.example .env

# Run the app
npm run dev
```

This will open your React app (usually on http://localhost:5173) in your browser, fully connected to your backend.

## 🌐 Deployment (Vercel + Render)

### Frontend (Vercel)

1. Push your code to GitHub.
2. In Vercel, import the repo and set:
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Add this environment variable in Vercel:
   - `VITE_API_BASE_URL=https://<your-render-service>.onrender.com`
4. Deploy.

### Backend (Render)

1. In Render, create a new **Web Service** from your GitHub repo.
2. Set:
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Add backend environment variables:
   - `PORT=5000` (or leave unset and let Render inject it)
   - `CORS_ORIGIN=https://<your-vercel-project>.vercel.app`
   - `RPC_URL=<your-chain-rpc-url>`
   - `CONTRACT_ADDRESS=<deployed-contract-address>`
   - `PRIVATE_KEY=<wallet-private-key-for-writes>`
   - `PINATA_JWT_TOKEN=<pinata-jwt-token>`
   - `WATERMARK_STRICT=false` (recommended on Render unless Python/OpenCV is installed)
     - or use `PINATA_API_KEY` and `PINATA_API_SECRET`
4. Deploy and verify health route:
   - `https://<your-render-service>.onrender.com/api`
   - `https://<your-render-service>.onrender.com/api/health`

### Get `CONTRACT_ADDRESS` for Render (Sepolia)

1. Create blockchain deploy env:
   - `backend/blockchain/.env` from `backend/blockchain/.env.example`
2. Set:
   - `RPC_URL=<your-sepolia-rpc-url>`
   - `PRIVATE_KEY=<deployer-wallet-private-key>`
3. Deploy contract:
   - `cd backend/blockchain`
   - `npx hardhat run scripts/deploy.js --network sepolia`
4. Copy printed address (`Contract deployed to: 0x...`) into Render:
   - `CONTRACT_ADDRESS=0x...`
   - `RPC_URL=<same-sepolia-rpc-url>`
   - `PRIVATE_KEY=<same-or-another-funded-wallet-private-key>`

### Final Architecture

Frontend (Vercel) -> Backend API (Render) -> Blockchain + IPFS (Pinata)

### 🗺️ MVP Development Roadmap
This project is in active development. Here is the planned roadmap:

[x] Phase 1: Build basic UI and upload/metadata pipeline.

[x] Phase 2: Implement hashing (SHA-256, pHash) and verification endpoint.

[x] Phase 3: Add watermark embedding (visible test).

[x] Phase 4: Integrate IPFS pinning and backend storage.

[x] Phase 5: Deploy blockchain contract and connect API (local).

[ ] Phase 6: Extend to video, optimize watermark robustness (Post-MVP).

[ ] Post-MVP: Implement invisible watermarking (DCT/LSB).

[ ] Post-MVP: Deploy to a public testnet (Amoy).

### 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
