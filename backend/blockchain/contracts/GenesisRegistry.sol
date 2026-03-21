// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// This is the main contract for the Digital Content Verification Platform
contract GenesisRegistry {
    
    // A struct to hold the authenticity data for each file
    struct ContentRecord {
        string sha256Hash;
        string pHash;
        string ipfsCid;
        address creator; // The wallet address that registered this content
        uint256 timestamp; // The time it was registered
    }

    // We will store all records in a mapping.
    // We'll use the SHA-256 hash (which is unique) as the key.
    mapping(string => ContentRecord) public records;

    // This event will be emitted every time a new record is created.
    // Our Node.js backend can listen for this.
    event RecordCreated(
        string indexed sha256Hash,
        string pHash,
        string ipfsCid,
        address indexed creator,
        uint256 timestamp
    );

    /**
     * @notice Registers a new piece of content on the blockchain.
     * @param _sha256Hash The SHA-256 hash of the watermarked file.
     * @param _pHash The perceptual hash of the watermarked file.
     * @param _ipfsCid The IPFS CID where the watermarked file is stored.
     */
    function createRecord(
        string memory _sha256Hash,
        string memory _pHash,
        string memory _ipfsCid
    ) public {
        // Check if a record with this SHA-256 hash already exists.
        // We use bytes(..).length > 0 to check if the string is empty
        // because the 'creator' field of a non-existent struct will be 0x0.
        require(
            records[_sha256Hash].creator == address(0),
            "Record with this SHA-256 hash already exists."
        );

        // Create the new record in memory
        ContentRecord memory newRecord = ContentRecord({
            sha256Hash: _sha256Hash,
            pHash: _pHash,
            ipfsCid: _ipfsCid,
            creator: msg.sender, // 'msg.sender' is the wallet calling this function
            timestamp: block.timestamp // 'block.timestamp' is the current blockchain time
        });

        // Save the new record to storage
        records[_sha256Hash] = newRecord;

        // Emit the event to log this action
        emit RecordCreated(
            _sha256Hash,
            _pHash,
            _ipfsCid,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Retrieves a content record using its SHA-256 hash.
     * @param _sha256Hash The SHA-256 hash to look up.
     * @return The stored ContentRecord.
     */
    function getRecord(string memory _sha256Hash) 
        public 
        view 
        returns (ContentRecord memory) 
    {
        return records[_sha256Hash];
    }
}
