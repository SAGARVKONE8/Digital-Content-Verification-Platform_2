import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const ACCEPTED_FILE_TYPES = "image/*,video/*,audio/*,.pdf,.csv,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx";
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff',
  'mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v',
  'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac',
  'pdf', 'csv', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
]);

function App() {
  // ... (All your existing useState hooks are correct)
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadResult, setUploadResult] = useState(null); 
  const [isUploading, setIsUploading] = useState(false);  

  const [verifyFile, setVerifyFile] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null); 
  const [isVerifying, setIsVerifying] = useState(false);

  const validateSelectedFile = (file) => {
    if (!file) return { valid: false, message: 'Please select a file.' };

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return { valid: false, message: 'File too large. Maximum allowed size is 100 MB.' };
    }

    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    const type = (file.type || '').toLowerCase();
    const isAllowedByMime = type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/');
    const isAllowedByExt = ALLOWED_EXTENSIONS.has(ext);

    if (!isAllowedByMime && !isAllowedByExt) {
      return {
        valid: false,
        message: 'Unsupported file type. Allowed: images, MP4/video, MP3/audio, PDF, CSV, TXT, DOC/DOCX, XLS/XLSX, PPT/PPTX.',
      };
    }

    return { valid: true };
  };

  // --- (onUploadFileChange, onFileUpload, onVerifyFileChange, onFileVerify, formatTimestamp functions are all correct) ---
  const onUploadFileChange = (event) => {
    const selectedFile = event.target.files[0];
    const validation = validateSelectedFile(selectedFile);
    if (!validation.valid) {
      setUploadFile(null);
      setUploadResult({ message: validation.message, isError: true });
      event.target.value = null;
      return;
    }
    setUploadFile(selectedFile);
    setUploadResult(null); 
  };

  const onFileUpload = async () => {
    if (!uploadFile) {
      setUploadResult({ message: 'Please select a file to register.', isError: true });
      return;
    }
    setIsUploading(true);
    setUploadResult(null);
    const formData = new FormData();
    formData.append('file', uploadFile);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      console.log('Upload response:', response.data);
      setUploadResult({ ...response.data, isError: false });
      setUploadFile(null);
      document.getElementById('upload-input').value = null; 
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadResult({ message: error.response?.data?.error || 'Could not connect to server.', isError: true });
    } finally {
      setIsUploading(false);
    }
  };

  const onVerifyFileChange = (event) => {
    const selectedFile = event.target.files[0];
    const validation = validateSelectedFile(selectedFile);
    if (!validation.valid) {
      setVerifyFile(null);
      setVerifyResult({ message: validation.message, isAuthentic: null });
      event.target.value = null;
      return;
    }
    setVerifyFile(selectedFile);
    setVerifyResult(null); 
  };

  const onFileVerify = async () => {
    if (!verifyFile) {
      setVerifyResult({ message: 'Please select a file to verify.' });
      return;
    }
    setIsVerifying(true);
    setVerifyResult(null);
    const formData = new FormData();
    formData.append('file', verifyFile);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/verify`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      console.log('Verify response:', response.data);
      setVerifyResult(response.data); 
    } catch (error) {
      console.error('Error verifying file:', error);
      setVerifyResult({ message: error.response?.data?.error || 'Could not connect to server.' });
    } finally {
      setIsVerifying(false);
      setVerifyFile(null); 
      document.getElementById('verify-input').value = null; 
    }
  };

  const formatTimestamp = (bigIntString) => {
    if (!bigIntString) return 'N/A';
    const timestampInMs = parseInt(bigIntString) * 1000;
    return new Date(timestampInMs).toLocaleString();
  };

  // --- NEW DOWNLOAD HANDLER ---
  const handleDownload = async (cid, filename) => {
    try {
      // 1. Fetch the file from the cross-origin URL
      const response = await fetch(IPFS_GATEWAY + cid);
      const blob = await response.blob();
      
      // 2. Create a temporary local URL (same-origin)
      const blobUrl = URL.createObjectURL(blob);

      // 3. Create a temporary link to click
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename || `genesis-download-${cid.substring(0, 6)}`; // Set a default filename
      
      // 4. Programmatically click the link
      document.body.appendChild(link);
      link.click();
      
      // 5. Clean up
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

    } catch (error) {
      console.error("Error downloading file:", error);
    }
  };

  const renderUploadPreview = () => {
    if (!uploadResult || uploadResult.isError) return null;

    if (uploadResult.fileCategory === 'image' || uploadResult.isImage) {
      return (
        <img
          src={IPFS_GATEWAY + uploadResult.ipfsCid}
          alt="Registered Content Preview"
          className="preview-image"
        />
      );
    }

    if (uploadResult.fileCategory === 'video') {
      return (
        <video controls className="preview-media">
          <source src={IPFS_GATEWAY + uploadResult.ipfsCid} type={uploadResult.mimetype} />
          Your browser does not support video preview.
        </video>
      );
    }

    if (uploadResult.fileCategory === 'audio') {
      return (
        <audio controls className="preview-audio">
          <source src={IPFS_GATEWAY + uploadResult.ipfsCid} type={uploadResult.mimetype} />
          Your browser does not support audio preview.
        </audio>
      );
    }

    return (
      <p className="inline-note">Preview is available for image/video/audio files. Use download for this file.</p>
    );
  };

  return (
    <div className="app-shell">
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />
      <div className="bg-grid" />

      <header className="hero">
        <p className="eyebrow">Digital Content Verification Suite</p>
        <h1>Secure Provenance For Modern Digital Assets</h1>
        <p className="hero-copy">
          Register and verify images, video, audio, and documents with SHA-256 fingerprints, IPFS permanence, and on-chain proof.
        </p>
        <div className="hero-chips">
          <span>Blockchain Registry</span>
          <span>IPFS Pinning</span>
          <span>File Verify</span>
        </div>
      </header>

      <main className="panel-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Register Asset</h2>
            <p>Upload once. Register forever.</p>
          </div>

          <div className="input-group">
            <label htmlFor="upload-input">Select file</label>
            <input id="upload-input" type="file" accept={ACCEPTED_FILE_TYPES} onChange={onUploadFileChange} />
            <button onClick={onFileUpload} disabled={isUploading} className="primary-btn">
              {isUploading ? 'Registering...' : 'Register File'}
            </button>
          </div>

          {uploadResult && (
            <div className="result-card">
              <p className={uploadResult.isError ? 'message-error' : 'message-success'}>
                {uploadResult.message}
              </p>

              {!uploadResult.isError && (
                <div className="record-details">
                  <h3 className="status-authentic">Registered</h3>
                  {renderUploadPreview()}
                  <pre>
                    <strong>SHA-256:</strong> {uploadResult.sha256}<br />
                    <strong>IPFS CID:</strong> {uploadResult.ipfsCid}
                  </pre>
                  <button
                    onClick={() => handleDownload(uploadResult.ipfsCid, uploadResult.filename)}
                    className="download-button"
                  >
                    Download Registered File
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Verify Authenticity</h2>
            <p>Verify by file hash against on-chain records.</p>
          </div>

          <div className="input-group">
            <label htmlFor="verify-input">Verify by file</label>
            <input id="verify-input" type="file" accept={ACCEPTED_FILE_TYPES} onChange={onVerifyFileChange} />
            <button onClick={onFileVerify} disabled={isVerifying} className="primary-btn">
              {isVerifying ? 'Verifying...' : 'Verify File'}
            </button>
          </div>

          {verifyResult && (
            <div className="result-card">
              <p className={verifyResult.isAuthentic ? 'message-success' : 'message-error'}>
                {verifyResult.message}
              </p>
              {verifyResult.isAuthentic === true && (
                <div className="record-details">
                  <h3 className="status-authentic">Authentic</h3>
                  <pre>
                    <strong>Creator:</strong> {verifyResult.record.creator}<br />
                    <strong>Timestamp:</strong> {formatTimestamp(verifyResult.record.timestamp)}<br />
                    <strong>IPFS CID:</strong> {verifyResult.record.ipfsCid}<br />
                    <strong>SHA-256:</strong> {verifyResult.record.sha256}
                  </pre>
                </div>
              )}
              {verifyResult.isAuthentic === false && (
                <div className="record-details">
                  <h3 className="status-not-found">Not Found</h3>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
