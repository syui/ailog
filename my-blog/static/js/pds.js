// AT Protocol API functions
const AT_PROTOCOL_CONFIG = {
    primary: {
        pds: 'https://syu.is',
        plc: 'https://plc.syu.is',
        bsky: 'https://bsky.syu.is',
        web: 'https://web.syu.is'
    },
    fallback: {
        pds: 'https://bsky.social',
        plc: 'https://plc.directory',
        bsky: 'https://public.api.bsky.app',
        web: 'https://bsky.app'
    }
};

// Search user function
async function searchUser() {
    const handleInput = document.getElementById('handleInput');
    const userInfo = document.getElementById('userInfo');
    const collectionsList = document.getElementById('collectionsList');
    const recordsList = document.getElementById('recordsList');
    const searchButton = document.getElementById('searchButton');
    
    const input = handleInput.value.trim();
    if (!input) {
        alert('Handle nameまたはAT URIを入力してください');
        return;
    }
    
    searchButton.disabled = true;
    searchButton.innerHTML = '@';
    //searchButton.innerHTML = '<i class="fab fa-bluesky"></i>';
    
    try {
        // Clear previous results
        document.getElementById('userDidSection').style.display = 'none';
        document.getElementById('collectionsSection').style.display = 'none';
        document.getElementById('recordsSection').style.display = 'none';
        collectionsList.innerHTML = '';
        recordsList.innerHTML = '';
        
        // Check if input is AT URI
        if (input.startsWith('at://')) {
            // Parse AT URI to check if it's a full record or just a handle/collection
            const uriParts = input.replace('at://', '').split('/').filter(part => part.length > 0);
            
            if (uriParts.length >= 3) {
                // Full AT URI with rkey - show in modal
                showAtUriModal(input);
                return;
            } else if (uriParts.length === 1) {
                // Just handle in AT URI format (at://handle) - treat as regular handle
                const handle = uriParts[0];
                const userProfile = await resolveUserProfile(handle);
                
                if (userProfile.success) {
                    displayUserDid(userProfile.data);
                    await loadUserCollections(handle, userProfile.data.did);
                } else {
                    alert('ユーザーが見つかりません: ' + userProfile.error);
                }
                return;
            } else if (uriParts.length === 2) {
                // Collection level AT URI - load collection records
                const [repo, collection] = uriParts;
                
                try {
                    // First resolve the repo to get handle if it's a DID
                    let handle = repo;
                    if (repo.startsWith('did:')) {
                        // Try to resolve DID to handle - for now just use the DID
                        handle = repo;
                    }
                    
                    loadCollectionRecords(handle, collection, repo);
                } catch (error) {
                    alert('コレクションの読み込みに失敗しました: ' + error.message);
                }
                return;
            }
        }
        
        // Handle regular handle search
        const userProfile = await resolveUserProfile(input);
        
        if (userProfile.success) {
            displayUserDid(userProfile.data);
            await loadUserCollections(input, userProfile.data.did);
        } else {
            alert('ユーザーが見つかりません: ' + userProfile.error);
        }
    } catch (error) {
        alert('エラーが発生しました: ' + error.message);
    } finally {
        searchButton.disabled = false;
        searchButton.innerHTML = '@';
        //searchButton.innerHTML = '<i class="fab fa-bluesky"></i>';
    }
}

// Resolve user profile
async function resolveUserProfile(handle) {
    try {
        let response = null;
        
        // Try syu.is first
        try {
            response = await fetch(`${AT_PROTOCOL_CONFIG.primary.pds}/xrpc/com.atproto.repo.describeRepo?repo=${handle}`);
        } catch (error) {
            console.log('Failed to resolve from syu.is:', error);
        }
        
        // If syu.is fails, try bsky.social
        if (!response || !response.ok) {
            response = await fetch(`${AT_PROTOCOL_CONFIG.fallback.pds}/xrpc/com.atproto.repo.describeRepo?repo=${handle}`);
        }
        
        if (!response.ok) {
            throw new Error('Failed to resolve handle');
        }
        
        const repoData = await response.json();
        
        // Get profile data
        const profileResponse = await fetch(`${AT_PROTOCOL_CONFIG.fallback.bsky}/xrpc/app.bsky.actor.getProfile?actor=${repoData.did}`);
        const profileData = await profileResponse.json();
        
        return {
            success: true,
            data: {
                did: repoData.did,
                handle: profileData.handle,
                displayName: profileData.displayName,
                avatar: profileData.avatar,
                description: profileData.description,
                pds: repoData.didDoc.service.find(s => s.type === 'AtprotoPersonalDataServer')?.serviceEndpoint
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Display user DID
function displayUserDid(profile) {
    document.getElementById('userPdsText').textContent = profile.pds || 'Unknown';
    document.getElementById('userHandleText').textContent = profile.handle;
    document.getElementById('userDidText').textContent = profile.did;
    document.getElementById('userDidSection').style.display = 'block';
}

// Load user collections
async function loadUserCollections(handle, did) {
    const collectionsList = document.getElementById('collectionsList');
    
    collectionsList.innerHTML = '<div class="loading">コレクションを読み込み中...</div>';
    
    try {
        // Try to get collections from describeRepo
        let response = await fetch(`${AT_PROTOCOL_CONFIG.primary.pds}/xrpc/com.atproto.repo.describeRepo?repo=${handle}`);
        let usedPds = AT_PROTOCOL_CONFIG.primary.pds;
        
        // If syu.is fails, try bsky.social
        if (!response.ok) {
            response = await fetch(`${AT_PROTOCOL_CONFIG.fallback.pds}/xrpc/com.atproto.repo.describeRepo?repo=${handle}`);
            usedPds = AT_PROTOCOL_CONFIG.fallback.pds;
        }
        
        if (!response.ok) {
            throw new Error('Failed to describe repository');
        }
        
        const data = await response.json();
        const collections = data.collections || [];
        
        // Display collections as AT URI links
        collectionsList.innerHTML = '';
        if (collections.length === 0) {
            collectionsList.innerHTML = '<div class="error">コレクションが見つかりませんでした</div>';
        } else {
            
            collections.forEach(collection => {
                const atUri = `at://${did}/${collection}/`;
                const collectionElement = document.createElement('a');
                collectionElement.className = 'at-uri-link';
                collectionElement.href = '#';
                collectionElement.textContent = atUri;
                collectionElement.onclick = (e) => {
                    e.preventDefault();
                    loadCollectionRecords(handle, collection, did);
                    // Close collections and update toggle
                    document.getElementById('collectionsList').style.display = 'none';
                    document.getElementById('collectionsToggle').textContent = '[-] Collections';
                };
                collectionsList.appendChild(collectionElement);
            });
            
            document.getElementById('collectionsSection').style.display = 'block';
        }
        
    } catch (error) {
        collectionsList.innerHTML = '<div class="error">コレクションの読み込みに失敗しました: ' + error.message + '</div>';
        document.getElementById('collectionsSection').style.display = 'block';
    }
}

// Load collection records
async function loadCollectionRecords(handle, collection, did) {
    const recordsList = document.getElementById('recordsList');
    
    recordsList.innerHTML = '<div class="loading">レコードを読み込み中...</div>';
    
    try {
        // Try with syu.is first
        let response = await fetch(`${AT_PROTOCOL_CONFIG.primary.pds}/xrpc/com.atproto.repo.listRecords?repo=${handle}&collection=${collection}`);
        let usedPds = AT_PROTOCOL_CONFIG.primary.pds;
        
        // If that fails, try with bsky.social
        if (!response.ok) {
            response = await fetch(`${AT_PROTOCOL_CONFIG.fallback.pds}/xrpc/com.atproto.repo.listRecords?repo=${handle}&collection=${collection}`);
            usedPds = AT_PROTOCOL_CONFIG.fallback.pds;
        }
        
        if (!response.ok) {
            throw new Error('Failed to load records');
        }
        
        const data = await response.json();
        
        // Display records as AT URI links
        recordsList.innerHTML = '';
        
        // Add collection info for records
        const collectionInfo = document.createElement('div');
        collectionInfo.className = 'collection-info';
        collectionInfo.innerHTML = `<strong>${collection}</strong>`;
        recordsList.appendChild(collectionInfo);
        
        data.records.forEach(record => {
            const atUri = record.uri;
            const recordElement = document.createElement('a');
            recordElement.className = 'at-uri-link';
            recordElement.href = '#';
            recordElement.textContent = atUri;
            recordElement.onclick = (e) => {
                e.preventDefault();
                showAtUriModal(atUri);
            };
            recordsList.appendChild(recordElement);
        });
        
        document.getElementById('recordsSection').style.display = 'block';
        
    } catch (error) {
        recordsList.innerHTML = '<div class="error">レコードの読み込みに失敗しました: ' + error.message + '</div>';
        document.getElementById('recordsSection').style.display = 'block';
    }
}

// Show AT URI modal
function showAtUriModal(uri) {
    const modal = document.getElementById('atUriModal');
    const content = document.getElementById('atUriContent');
    
    content.innerHTML = '<div class="loading">レコードを読み込み中...</div>';
    modal.style.display = 'flex';
    
    // Load record data
    loadAtUriRecord(uri, content);
}

// Load AT URI record
async function loadAtUriRecord(uri, contentElement) {
    try {
        const parts = uri.replace('at://', '').split('/');
        const repo = parts[0];
        const collection = parts[1];
        const rkey = parts[2];
        
        // Try with syu.is first
        let response = await fetch(`${AT_PROTOCOL_CONFIG.primary.pds}/xrpc/com.atproto.repo.getRecord?repo=${repo}&collection=${collection}&rkey=${rkey}`);
        
        // If that fails, try with bsky.social
        if (!response.ok) {
            response = await fetch(`${AT_PROTOCOL_CONFIG.fallback.pds}/xrpc/com.atproto.repo.getRecord?repo=${repo}&collection=${collection}&rkey=${rkey}`);
        }
        
        if (!response.ok) {
            throw new Error('Failed to load record');
        }
        
        const data = await response.json();
        
        contentElement.innerHTML = `
            <div style="padding: 20px;">
                <h3>AT URI Record</h3>
                <div style="font-family: monospace; font-size: 14px; color: #666; margin-bottom: 20px; word-break: break-all;">
                    ${uri}
                </div>
                <div style="font-size: 12px; color: #999; margin-bottom: 20px;">
                    Repo: ${repo} | Collection: ${collection} | RKey: ${rkey}
                </div>
                <h4>Record Data</h4>
                <pre style="background: #f5f5f5; padding: 15px; border-radius: 4px; overflow: auto;">${JSON.stringify(data, null, 2)}</pre>
            </div>
        `;
    } catch (error) {
        contentElement.innerHTML = `
            <div style="padding: 20px; color: red;">
                <strong>Error:</strong> ${error.message}
                <div style="margin-top: 10px; font-size: 12px;">
                    <strong>URI:</strong> ${uri}
                </div>
            </div>
        `;
    }
}

// Close AT URI modal
function closeAtUriModal(event) {
    const modal = document.getElementById('atUriModal');
    if (event && event.target !== modal) {
        return;
    }
    modal.style.display = 'none';
}

// Initialize AT URI click handlers
document.addEventListener('DOMContentLoaded', function() {
    // Add click handlers to existing AT URIs
    document.querySelectorAll('.at-uri').forEach(element => {
        element.addEventListener('click', function() {
            const uri = this.getAttribute('data-at-uri');
            showAtUriModal(uri);
        });
    });
    
    // ESC key to close modal
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeAtUriModal();
        }
    });
    
    // Enter key to search
    document.getElementById('handleInput').addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            searchUser();
        }
    });
    
});

// Toggle collections visibility
function toggleCollections() {
    const collectionsList = document.getElementById('collectionsList');
    const toggleButton = document.getElementById('collectionsToggle');
    
    if (collectionsList.style.display === 'none') {
        collectionsList.style.display = 'block';
        toggleButton.textContent = '[-] Collections';
    } else {
        collectionsList.style.display = 'none';
        toggleButton.textContent = '[+] Collections';
    }
}
