// Global state
let currentTrack = null;
let isPlaying = false;
const backendUrl = 'https://your-backend-url.com';  // You'll update this with your actual backend URL later
const placeholderImage = 'path/to/placeholder.png';
let trackHistory = [];
let currentPlaylistUrl = null;
let currentPage = 1;
let isLoadingMore = false;
let hasMoreTracks = false;
let currentView = 'main';
let currentPlaylist = null;
let queue = [];
let recentlyAdded = [];
let currentVolume = 1;
let isMuted = false;
let previousVolume = 1;

// Add these variables at the top with other state variables
let isDraggingSeeker = false;
let updateInterval = null;
let serverSyncInterval = null;
let lastKnownDuration = 0;
let lastKnownPosition = 0;
let lastUpdateTime = 0;
let seekDebounceTimeout = null;
let isSeekInProgress = false;

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded - Checking backend connection...');
    
    const isBackendAvailable = await checkBackendConnection();
    console.log('Initial backend connection check:', isBackendAvailable);
    
    if (!isBackendAvailable) {
        showStatus('Warning: Backend server is not accessible', 5000);
    }
    
    initializeControls();
    initializeTabs();
    loadTrackHistory();
    initializeBottomPlayer();
    updateRecentlyAdded();
    document.getElementById('backBtn').addEventListener('click', showMainView);
    initializeBackgroundAnimation();

    // Add click handler for playlist cards using event delegation
    document.addEventListener('click', (e) => {
        const playlistCard = e.target.closest('.playlist-card');
        if (playlistCard) {
            const playlistData = JSON.parse(decodeURIComponent(playlistCard.dataset.playlist));
            showPlaylistPanel(playlistData);
        }
    });

    // Update overlay click handler
    const playlistOverlay = document.querySelector('.playlist-overlay');
    if (playlistOverlay) {
        playlistOverlay.addEventListener('click', (e) => {
            if (e.target === playlistOverlay) {
                hidePlaylistPanel();
            }
        });
    }

    // Add initialization to your startup code
    initializeProgressBar();
});

// Remove electron-specific window controls
function initializeControls() {
    // Search controls
    const searchInput = document.getElementById('url');
    const searchBtn = document.getElementById('searchBtn');

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch();
            }
        });
    }
    
    if (searchBtn) {
        searchBtn.addEventListener('click', handleSearch);
    }
}

// ... rest of your existing renderer.js code, removing electron-specific parts ...

// Replace electron-specific track info update
function updateTrackInfo(title) {
    document.title = title || 'YouTube Audio Player';
}

// Load track history from browser's localStorage
function loadTrackHistory() {
    const saved = localStorage.getItem('trackHistory');
    if (saved) {
        trackHistory = JSON.parse(saved);
        recentlyAdded = trackHistory.slice(0, MAX_RECENT_ITEMS);
        updateTabContent('all');
        updateRecentlyAdded();
    }
}

// Save track history to browser's localStorage
function saveTrackHistory() {
    localStorage.setItem('trackHistory', JSON.stringify(trackHistory));
}

async function checkBackendConnection() {
    try {
        const response = await fetch(`${backendUrl}/api/health`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
            mode: 'cors'
        });
        
        const data = await response.json();
        return response.ok && data.status === 'ok';
    } catch (error) {
        console.error('Backend connection error:', error);
        showStatus('Cannot connect to backend server. Is it running?', 5000);
        return false;
    }
}

function initializeTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const queueTab = document.getElementById('queueTab');

    // Add scroll listener to the queue tab
    queueTab?.addEventListener('scroll', handleTabScroll);

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const tabContent = document.getElementById(`${btn.dataset.tab}Tab`);
            tabContent.classList.add('active');
            
            // Fetch trending tracks when trending tab is selected
            if (btn.dataset.tab === 'trending' && trendingTracks.length === 0) {
                fetchTrendingTracks();
            } else {
                updateTabContent(btn.dataset.tab);
            }
        });
    });
}

function initializeBottomPlayer() {
    const bottomPlayer = document.getElementById('bottomPlayer');
    if (!bottomPlayer) return;

    // Initially hide bottom player if no track is playing
    bottomPlayer.style.display = currentTrack ? 'block' : 'none';

    // Initialize volume controls
    const volumeBtn = document.getElementById('volumeBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeControl = document.querySelector('.volume-control');
    const togglePlayBtn = document.getElementById('togglePlayBtn');

    // Set initial volume to 60%
    volumeSlider.value = 60;
    currentVolume = 0.6;
    setVolume(currentVolume);  // Send initial volume to backend
    updateVolumeSliderAppearance(volumeSlider.value);
    updateVolumeIcon();

    // Add toggle play button handler
    togglePlayBtn?.addEventListener('click', () => {
        if (!currentTrack) return;
        
        fetch(`${backendUrl}/api/${isPlaying ? 'pause' : 'resume'}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }).then(() => {
            isPlaying = !isPlaying;
            updatePlayerUI();
            
            // Update background animation
            const backgroundAnimation = document.querySelector('.background-animation');
            if (backgroundAnimation) {
                if (isPlaying) {
                    backgroundAnimation.classList.add('active');
                } else {
                    backgroundAnimation.classList.remove('active');
                }
            }
        }).catch(error => {
            console.error('Error toggling playback:', error);
            showStatus('Error toggling playback', 3000);
        });
    });

    // Add volume button handler
    volumeBtn?.addEventListener('click', () => {
        toggleMute();
        updateVolumeSliderAppearance(volumeSlider.value);
    });

    // Add volume slider handler with debounce
    let volumeTimeout;
    volumeSlider?.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        currentVolume = value / 100;
        
        // Update UI immediately
        updateVolumeSliderAppearance(value);
        updateVolumeIcon();
        
        // Debounce the API call
        clearTimeout(volumeTimeout);
        volumeTimeout = setTimeout(() => {
            setVolume(currentVolume);
        }, 100);
    });
}

function showStatus(message, duration = 3000) {
    let statusElement = document.getElementById('statusMessage');
    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.id = 'statusMessage';
        statusElement.className = 'status-message';
        document.body.appendChild(statusElement);
    }

    statusElement.textContent = message;
    statusElement.style.display = 'block';
    
    setTimeout(() => {
        statusElement.style.display = 'none';
    }, duration);
}

function updateRecentlyAdded() {
    const recentSection = document.getElementById('recentlyAddedSection');
    if (!recentSection) return;

    if (recentlyAdded.length === 0) {
        recentSection.innerHTML = '<p class="no-tracks">No recent items</p>';
        return;
    }

    recentSection.innerHTML = `
        <div class="track-scroll">
            ${recentlyAdded.map(item => createTrackHTML(item, item === currentTrack, true)).join('')}
        </div>
    `;
}

// Add these constants
const MAX_RECENT_ITEMS = 10;
let trendingTracks = [];

// Add these utility functions
function handleTabScroll(event) {
    const element = event.target;
    const reachedBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 100;

    if (reachedBottom && !isLoadingMore && hasMoreTracks) {
        loadMorePlaylistTracks();
    }
}

async function fetchTrendingTracks() {
    try {
        showLoadingIndicator();
        
        const response = await fetch(`${backendUrl}/api/trending`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        trendingTracks = data.tracks || [];
        updateTabContent('trending');
        
    } catch (error) {
        console.error('Error fetching trending tracks:', error);
        showStatus('Error loading trending tracks', 3000);
    } finally {
        hideLoadingIndicator();
    }
}

function showLoadingIndicator() {
    let indicator = document.getElementById('loadingIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'loadingIndicator';
        indicator.className = 'loading-indicator';
        indicator.innerHTML = '<div class="loading-spinner"></div>';
        document.getElementById('allTab').appendChild(indicator);
    }
    indicator.style.display = 'flex';
}

function hideLoadingIndicator() {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

async function handleSearch() {
    console.log('handleSearch called');
    const searchInput = document.getElementById('url');
    const url = searchInput.value.trim();
    
    console.log('Search URL:', url);
    
    if (!url) {
        showStatus('Please enter a URL', 3000);
        return;
    }

    try {
        showLoadingOverlay();
        
        // Check if URL is a playlist
        if (url.includes('playlist?list=') || url.includes('&list=')) {
            console.log('Playlist URL detected:', url);
            await handlePlaylist(url);
            searchInput.value = '';
            return;
        }

        // Check backend connection before making request
        const isConnected = await checkBackendConnection();
        console.log('Backend connection check result:', isConnected);
        
        if (!isConnected) {
            showStatus('Cannot connect to backend server. Please check if it is running.', 5000);
            return;
        }

        console.log('Fetching video details...');
        const response = await fetch(`${backendUrl}/api/get_video_details?url=${encodeURIComponent(url)}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            mode: 'cors'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Received data:', data);

        if (data.error) throw new Error(data.error);

        const track = {
            url: url,
            title: data.title,
            thumbnail_url: data.thumbnail_url,
            duration: data.duration
        };
        
        addToHistory(track);
        searchInput.value = '';
        showStatus(`Added to library: ${track.title}`, 3000);
    } catch (error) {
        console.error('Search error:', error);
        showStatus(`Error: ${error.message}`, 5000);
    } finally {
        hideLoadingOverlay();
    }
}

async function handlePlaylist(url) {
    try {
        console.log('Handling playlist URL:', url);
        const response = await fetch(`${backendUrl}/api/get_playlist_details?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (data.error) throw new Error(data.error);
        if (!data.tracks || data.tracks.length === 0) {
            throw new Error('No tracks found in playlist');
        }

        const tracksWithPlaylistId = data.tracks.map(track => ({
            ...track,
            playlistId: url
        }));

        const playlist = {
            title: data.playlist_title,
            tracks: tracksWithPlaylistId,
            thumbnail_urls: tracksWithPlaylistId.slice(0, 16).map(track => track.thumbnail_url),
            isPlaylist: true,
            url: url,
            trackCount: tracksWithPlaylistId.length
        };

        console.log('Created playlist object:', playlist);
        addToHistory(playlist);
        showStatus(`Added playlist to library: ${playlist.title}`, 3000);
        updateTabContent('all');

    } catch (error) {
        console.error('Playlist error:', error);
        showStatus(`Error loading playlist: ${error.message}`, 5000);
    }
}

function showLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'flex';
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

// Add this function for adding tracks to history
function addToHistory(track) {
    console.log('Adding track to history:', track);
    
    // Remove if track already exists in history
    trackHistory = trackHistory.filter(t => t.url !== track.url);
    
    // Add to beginning of array
    trackHistory.unshift(track);
    
    // Update recently added
    recentlyAdded = recentlyAdded.filter(t => t.url !== track.url);
    recentlyAdded.unshift(track);
    if (recentlyAdded.length > MAX_RECENT_ITEMS) {
        recentlyAdded.pop();
    }
    
    // Save to localStorage
    saveTrackHistory();
    
    // Update UI
    console.log('Updated track history:', trackHistory);
    updateTabContent('all');
    updateRecentlyAdded();
}

function showMainView() {
    currentView = 'main';
    document.getElementById('mainView').style.display = 'block';
    document.getElementById('playlistView').style.display = 'none';
    currentPlaylist = null;
    updateTabContent('all');
    updateTabContent('queue');
    updateControlStates();
}

function showPlaylistPanel(playlist) {
    console.log('showPlaylistPanel called with playlist:', playlist); // Debug log
    
    if (!playlist || !playlist.tracks) {
        console.error('Invalid playlist data:', playlist);
        return;
    }

    // Update panel content
    document.querySelector('.playlist-panel-title').textContent = playlist.title;
    
    // Update header with shuffle button
    document.querySelector('.playlist-panel-header').innerHTML = `
        <h2 class="playlist-panel-title">${playlist.title}</h2>
        <div class="playlist-panel-actions">
            <button class="playlist-shuffle-btn" title="Shuffle and play">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
                </svg>
            </button>
            <button class="playlist-panel-close">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
            </button>
        </div>
    `;
    
    // Store the playlist data for the shuffle button
    const shuffleBtn = document.querySelector('.playlist-shuffle-btn');
    shuffleBtn.addEventListener('click', () => shufflePlaylist(playlist));
    
    const thumbnailsContainer = document.querySelector('.playlist-panel .playlist-thumbnails-container');
    thumbnailsContainer.innerHTML = playlist.thumbnail_urls
        .slice(0, 4)  // Show only first 4 thumbnails
        .map(url => `
            <img src="${url || placeholderImage}" 
                 class="playlist-thumbnail" 
                 alt="${playlist.title}"
                 onerror="this.src='${placeholderImage}'">
        `).join('');
    
    // Update playlist info section with proper formatting
    const trackCount = playlist.tracks.length;
    const totalDuration = playlist.tracks.reduce((acc, track) => acc + (track.duration || 0), 0);
    const formattedDuration = formatDuration(totalDuration);

    const playlistInfo = document.querySelector('.playlist-panel .playlist-info');
    if (playlistInfo) {
        playlistInfo.innerHTML = `
            <div class="playlist-track-count">${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}</div>
            <div class="playlist-duration">${formattedDuration}</div>
        `;
    }
    
    // Update tracks list
    const tracksContainer = document.querySelector('.playlist-panel .playlist-tracks');
    tracksContainer.innerHTML = playlist.tracks
        .map((track, index) => createPlaylistTrackHTML(track, index))
        .join('');
    
    // Show overlay and panel
    document.querySelector('.playlist-overlay').classList.add('show');
    document.querySelector('.playlist-panel').classList.add('open');
    document.querySelector('.container').classList.add('panel-open');
    document.querySelector('.bottom-player')?.classList.add('panel-open');

    // Reattach close handler since we recreated the button
    document.querySelector('.playlist-panel-close').addEventListener('click', hidePlaylistPanel);
}

function hidePlaylistPanel() {
    document.querySelector('.playlist-overlay').classList.remove('show');
    document.querySelector('.playlist-panel').classList.remove('open');
    document.querySelector('.container').classList.remove('panel-open');
    document.querySelector('.bottom-player')?.classList.remove('panel-open');
}

// Update the back button handler
document.getElementById('backBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    hidePlaylistPanel();
});

function createPlaylistTrackHTML(track, index) {
    const isCurrentlyPlaying = currentTrack?.url === track.url;
    const duration = formatDuration(track.duration);
    const trackJson = JSON.stringify(track).replace(/"/g, '&quot;');
    const inQueue = isInQueue(track);
    const isSaved = isInHistory(track);
    
    return `
        <div class="track-item ${isCurrentlyPlaying ? 'playing' : ''}" 
             onclick='playTrack(JSON.parse("${trackJson}"))'>
            <div class="track-number">${(index + 1).toString().padStart(2, '0')}</div>
            <img src="${track.thumbnail_url || placeholderImage}" 
                 alt="" 
                 class="track-thumbnail"
                 onerror="this.src='${placeholderImage}'">
            <div class="track-info">
                <div class="track-title">${track.title}</div>
                <div class="duration">${duration}</div>
            </div>
            <div class="track-actions">
                <button class="action-btn play-btn" onclick="playTrack(JSON.parse('${trackJson}'))">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                </button>
                <button class="action-btn queue-btn ${inQueue ? 'queued' : ''}" 
                        onclick="toggleQueue(JSON.parse('${trackJson}'))">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        ${inQueue ? 
                            '<path d="M19 13H5v-2h14v2z"/>' :
                            '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>'
                        }
                    </svg>
                </button>
                <button class="action-btn save-btn ${isSaved ? 'saved' : ''}"
                        onclick="toggleSave(JSON.parse('${trackJson}'))">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        ${isSaved ?
                            '<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>' :
                            '<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>'
                        }
                    </svg>
                </button>
            </div>
        </div>
    `;
}

function formatDuration(seconds) {
    if (!seconds) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function isInQueue(track) {
    return queue.some(queuedTrack => queuedTrack.url === track.url);
}

function isInHistory(track) {
    return trackHistory.some(t => t.url === track.url);
}

function updateTabContent(tabName) {
    const tabContent = document.getElementById(`${tabName}Tab`);
    if (!tabContent) return;

    if (tabName === 'trending') {
        const trendingGrid = tabContent.querySelector('.trending-grid');
        if (trendingGrid) {
            trendingGrid.innerHTML = trendingTracks.length > 0 
                ? trendingTracks.map(track => createTrackHTML(track, track === currentTrack, true)).join('')
                : '<p class="no-tracks">No trending tracks available</p>';
        }
    } else if (tabName === 'queue') {
        // First, check if current track is in queue
        const currentTrackInQueue = currentTrack && queue.some(t => t.url === currentTrack.url);
        
        // Create display queue
        let displayQueue = [...queue];
        
        // If current track exists and is in queue, ensure it's first
        if (currentTrackInQueue) {
            // Remove current track from its position
            displayQueue = displayQueue.filter(t => t.url !== currentTrack.url);
            // Add it to the beginning
            displayQueue.unshift(currentTrack);
        }

        tabContent.innerHTML = displayQueue.length > 0
            ? displayQueue.map((track) => 
                createTrackHTML(track, track.url === currentTrack?.url, false)
              ).join('')
            : '<p class="no-tracks">Queue is empty</p>';

        updateQueueNumbers();
    } else if (tabName === 'all') {
        // Separate playlists and tracks
        const playlists = trackHistory.filter(item => item.isPlaylist);
        const tracks = trackHistory.filter(item => !item.isPlaylist);

        tabContent.innerHTML = `
            <div class="section">
                <h2 class="section-title">Saved Playlists</h2>
                <div class="track-grid">
                    ${playlists.length ? 
                        playlists.map(playlist => createTrackHTML(playlist, false, true)).join('') :
                        '<p class="no-tracks">No playlists saved</p>'
                    }
                </div>
            </div>
            <div class="section">
                <h2 class="section-title">Saved Tracks</h2>
                <div class="track-grid">
                    ${tracks.length ?
                        tracks.map(track => createTrackHTML(track, track === currentTrack, true)).join('') :
                        '<p class="no-tracks">No tracks saved</p>'
                    }
                </div>
            </div>`;
    }
}

function createTrackHTML(track, isPlaying, isCardView = false) {
    if (track.isPlaylist) {
        console.log('Creating playlist card for:', track.title);
        const totalDuration = formatDuration(track.tracks.reduce((acc, t) => acc + (t.duration || 0), 0));
        
        // Create a sanitized version of the track object
        const safeTrack = {
            ...track,
            title: track.title,
            tracks: track.tracks.map(t => ({
                ...t,
                title: t.title
            }))
        };
        
        // Use a safe encoding method for Unicode characters
        const playlistData = encodeURIComponent(JSON.stringify(safeTrack))
            .replace(/'/g, '%27')
            .replace(/"/g, '%22');
        
        return `
            <div class="track-card playlist-card ${isPlaying ? 'playing' : ''}" 
                 onclick="handlePlaylistClick(this)"
                 data-playlist="${playlistData}">
                <div class="card-thumbnail-wrapper">
                    <img class="card-thumbnail" 
                         src="${track.thumbnail_urls[0] || placeholderImage}" 
                         alt="" 
                         onerror="this.src='${placeholderImage}'">
                    <div class="card-overlay">
                        <div class="card-actions">
                            <button class="action-btn play-btn" onclick="event.stopPropagation(); playTrack(this.closest('.playlist-card').getAttribute('data-playlist'))">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="card-info">
                    <div class="card-title">${track.title}</div>
                    <div class="card-details">
                        <span>${track.trackCount} tracks</span>
                        <span class="duration">${totalDuration}</span>
                    </div>
                </div>
            </div>`;
    }

    const duration = formatDuration(track.duration);
    const trackJson = encodeURIComponent(JSON.stringify(track));
    const inQueue = isInQueue(track);
    const isSaved = isInHistory(track);
    
    if (isCardView) {
        return `
            <div class="track-card single-card ${isPlaying ? 'playing' : ''}" data-track='${trackJson}'>
                <div class="card-thumbnail-wrapper">
                    <img class="card-thumbnail" 
                         src="${track.thumbnail_url || placeholderImage}" 
                         alt="" 
                         onerror="this.src='${placeholderImage}'">
                    <div class="card-overlay">
                        <div class="card-actions">
                            <button class="action-btn play-btn" onclick="event.stopPropagation(); playTrack(JSON.parse(decodeURIComponent('${trackJson}')))">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                            </button>
                            <button class="action-btn queue-btn ${inQueue ? 'queued' : ''}" 
                                    onclick="event.stopPropagation(); toggleQueue(JSON.parse(decodeURIComponent('${trackJson}')))">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    ${inQueue ? 
                                        '<path d="M19 13H5v-2h14v2z"/>' :
                                        '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>'
                                    }
                                </svg>
                            </button>
                            <button class="action-btn save-btn ${isSaved ? 'saved' : ''}"
                                    onclick="event.stopPropagation(); toggleSave(JSON.parse(decodeURIComponent('${trackJson}')))">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    ${isSaved ?
                                        '<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>' :
                                        '<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>'
                                    }
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="card-info">
                    <div class="card-title">${track.title}</div>
                    <div class="card-details">
                        <span>Single track</span>
                        <span class="duration">${duration}</span>
                    </div>
                </div>
            </div>`;
    }

    // List view
    return `
        <div class="track-item ${isPlaying ? 'playing' : ''}" data-track='${trackJson}'>
            <div class="track-number">${track.number || ''}</div>
            <div class="track-thumbnail-wrapper">
                <img class="track-thumbnail" 
                     src="${track.thumbnail_url || placeholderImage}" 
                     alt="" 
                     onerror="this.src='${placeholderImage}'">
                <div class="track-thumbnail-overlay"></div>
            </div>
            <div class="track-info">
                <div class="track-title">${track.title}</div>
                <div class="duration">${duration}</div>
            </div>
            <div class="track-actions">
                <button class="action-btn play-btn" onclick="event.stopPropagation(); playTrack(JSON.parse(decodeURIComponent('${trackJson}')))">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                </button>
                <button class="action-btn queue-btn ${inQueue ? 'queued' : ''}" 
                        onclick="event.stopPropagation(); toggleQueue(JSON.parse(decodeURIComponent('${trackJson}')))">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        ${inQueue ? 
                            '<path d="M19 13H5v-2h14v2z"/>' :
                            '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>'
                        }
                    </svg>
                </button>
                <button class="action-btn save-btn ${isSaved ? 'saved' : ''}"
                        onclick="event.stopPropagation(); toggleSave(JSON.parse(decodeURIComponent('${trackJson}')))">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        ${isSaved ?
                            '<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>' :
                            '<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>'
                        }
                    </svg>
                </button>
            </div>
        </div>`;
}

function updateQueueNumbers() {
    const queueTracks = document.querySelectorAll('#queueTab .track-item');
    queueTracks.forEach((track, index) => {
        const numberSpan = track.querySelector('.track-number');
        if (numberSpan) {
            numberSpan.textContent = (index + 1).toString().padStart(2, '0');
        }
    });
}

// Add these playback control functions

function playTrack(track) {
    try {
        // Update UI state immediately
        const previousTrack = currentTrack;
        currentTrack = track;
        isPlaying = true;
        
        // Activate background animation
        const backgroundAnimation = document.querySelector('.background-animation');
        if (backgroundAnimation) {
            backgroundAnimation.classList.add('active');
        }
        
        // Ensure track is in queue
        if (!isInQueue(track)) {
            queue.push(track);
        }
        
        // Update UI
        updatePlayerUI();
        showBottomPlayer();
        updateTabContent('queue');
        updateTabContent('all');
        
        document.title = track.title;
        showStatus('Now playing: ' + track.title, 2000);

        // Send request to backend
        fetch(`${backendUrl}/api/play`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: track.url })
        }).catch(error => {
            console.error('Error playing track:', error);
            currentTrack = previousTrack;
            isPlaying = false;
            updatePlayerUI();
            showStatus(`Error playing track`, 3000);
        });

        // Reset progress tracking state
        lastKnownPosition = 0;
        lastKnownDuration = track.duration || 0;
        lastUpdateTime = Date.now();

        // Clear existing intervals if any
        if (updateInterval) {
            clearInterval(updateInterval);
        }
        if (serverSyncInterval) {
            clearInterval(serverSyncInterval);
        }

        // Start progress updates more frequently for smoother UI
        updateInterval = setInterval(() => {
            if (isPlaying) {
                updateProgress();
            }
        }, 100);  // Update every 100ms

        // Sync with server less frequently
        serverSyncInterval = setInterval(() => {
            if (isPlaying && !isDraggingSeeker) {
                fetch(`${backendUrl}/api/get_position`)
                    .then(response => response.json())
                    .then(data => {
                        if (data.error) throw new Error(data.error);
                        // Only update if the difference is significant
                        if (Math.abs(data.position - lastKnownPosition) > 0.5) {
                            lastKnownPosition = data.position;
                            lastKnownDuration = data.duration || currentTrack.duration;
                            lastUpdateTime = Date.now();
                            updateProgressUI(lastKnownPosition, lastKnownDuration);
                        }
                    })
                    .catch(error => {
                        console.error('Error syncing with server:', error);
                    });
            }
        }, 3000);  // Sync every 3 seconds

    } catch (error) {
        console.error('Error in playTrack:', error);
        isPlaying = false;
        updatePlayerUI();
    }
}

function toggleQueue(track) {
    if (isInQueue(track)) {
        // If it's the current track, don't allow removal
        if (currentTrack && currentTrack.url === track.url) {
            showStatus('Cannot remove currently playing track from queue', 3000);
            return;
        }
        // Remove from queue
        queue = queue.filter(t => t.url !== track.url);
        showStatus(`Removed from queue: ${track.title}`, 3000);
    } else {
        // Add to queue
        queue.push(track);
        showStatus(`Added to queue: ${track.title}`, 3000);
    }
    
    // Update UI
    updateTabContent('queue');
    updateTabContent('all');
    updatePlayerUI();
}

function toggleSave(track) {
    if (isInHistory(track)) {
        // Remove from history
        trackHistory = trackHistory.filter(t => t.url !== track.url);
        showStatus('Removed from saved tracks', 2000);
    } else {
        // Add to history
        addToHistory(track);
        showStatus('Added to saved tracks', 2000);
    }
    
    // Update UI
    updateTabContent('all');
    // If the track is in a different view (trending/queue), update that view too
    if (document.getElementById('trendingTab').classList.contains('active')) {
        updateTabContent('trending');
    }
    if (document.getElementById('queueTab').classList.contains('active')) {
        updateTabContent('queue');
    }
}

function toggleMute() {
    if (isMuted) {
        // Unmute
        isMuted = false;
        currentVolume = previousVolume;
        setVolume(previousVolume);
        document.getElementById('volumeSlider').value = previousVolume * 100;
    } else {
        // Mute
        isMuted = true;
        previousVolume = currentVolume;
        currentVolume = 0;
        setVolume(0);
        document.getElementById('volumeSlider').value = 0;
    }
    updateVolumeIcon();
}

function setVolume(value) {
    fetch(`${backendUrl}/api/volume`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ volume: value })
    }).catch(error => {
        console.error('Error setting volume:', error);
        showStatus('Error setting volume', 3000);
    });
}

function updateVolumeIcon() {
    const volumeIcon = document.getElementById('volumeIcon');
    if (!volumeIcon) return;

    // Update volume icon based on current volume
    if (currentVolume === 0 || isMuted) {
        volumeIcon.innerHTML = `
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
        `;
    } else if (currentVolume < 0.5) {
        volumeIcon.innerHTML = `
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
        `;
    } else {
        volumeIcon.innerHTML = `
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        `;
    }
}

function updateVolumeSliderAppearance(value) {
    const volumeSlider = document.getElementById('volumeSlider');
    if (!volumeSlider) return;

    volumeSlider.style.setProperty('--volume-percentage', `${value}%`);
    volumeSlider.style.background = `linear-gradient(to right, 
        var(--primary) 0%, 
        var(--primary) ${value}%, 
        rgba(255, 255, 255, 0.1) ${value}%, 
        rgba(255, 255, 255, 0.1) 100%)`;
}

function updatePlayerUI() {
    const toggleIcon = document.getElementById('toggleIcon');
    const togglePlayBtn = document.getElementById('togglePlayBtn');
    const bottomPlayer = document.getElementById('bottomPlayer');
    
    // Handle play/pause button and icon
    if (togglePlayBtn && toggleIcon) {
        if (!currentTrack) {
            // No track loaded
            togglePlayBtn.disabled = true;
            togglePlayBtn.classList.add('disabled');
            toggleIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
        } else {
            // Track loaded
            togglePlayBtn.disabled = false;
            togglePlayBtn.classList.remove('disabled');
            toggleIcon.innerHTML = isPlaying 
                ? '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>'  // Pause icon
                : '<polygon points="5 3 19 12 5 21 5 3"></polygon>';  // Play icon
        }
    }

    // Update track info display
    const currentTitle = document.getElementById('currentTitle');
    const currentThumbnail = document.getElementById('currentThumbnail');
    
    if (currentTrack) {
        currentTitle.textContent = currentTrack.title;
        currentThumbnail.src = currentTrack.thumbnail_url || placeholderImage;
        currentThumbnail.onerror = () => {
            currentThumbnail.src = placeholderImage;
        };
        bottomPlayer.style.display = 'block';
    } else {
        currentTitle.textContent = 'No track playing';
        currentThumbnail.src = placeholderImage;
        bottomPlayer.style.display = 'none';
    }
}

function showBottomPlayer() {
    const bottomPlayer = document.getElementById('bottomPlayer');
    if (bottomPlayer) {
        bottomPlayer.style.display = 'block';
    }
}

// Add the togglePlay function
function togglePlay() {
    if (!currentTrack) return;

    isPlaying = !isPlaying;
    updatePlayerUI();

    const backgroundAnimation = document.querySelector('.background-animation');
    if (backgroundAnimation) {
        if (isPlaying) {
            backgroundAnimation.classList.add('active');
        } else {
            backgroundAnimation.classList.remove('active');
        }
    }

    // Send request to backend
    const endpoint = isPlaying ? 'resume' : 'pause';
    fetch(`${backendUrl}/api/` + endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    }).catch(error => {
        console.error('Error toggling playback:', error);
        isPlaying = !isPlaying;  // Revert state on error
        updatePlayerUI();
        showStatus('Error toggling playback', 3000);
    });

    if (!isPlaying) {
        cleanup();
    } else if (!updateInterval) {
        // Restart progress tracking if needed
        lastUpdateTime = Date.now();
        updateProgress();
        updateInterval = setInterval(updateProgress, 100);
    }
}

// Add this new function for shuffle functionality
function shufflePlaylist(playlist) {
    if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
        showStatus('No tracks to shuffle', 2000);
        return;
    }

    // Create a copy of the tracks array
    let tracks = [...playlist.tracks];
    
    // Fisher-Yates shuffle algorithm
    for (let i = tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }

    // Clear current queue and add shuffled tracks
    queue = tracks;
    
    // Play the first track immediately
    if (tracks.length > 0) {
        playTrack(tracks[0]);
        showStatus(`Playing ${playlist.title} (Shuffled)`, 2000);
    }

    // Update UI
    updateTabContent('queue');
    hidePlaylistPanel(); // Close the playlist panel after shuffling
}

// Add this to your existing code
function initializeBackgroundAnimation() {
    // Create background animation element if it doesn't exist
    let backgroundAnimation = document.querySelector('.background-animation');
    if (!backgroundAnimation) {
        backgroundAnimation = document.createElement('div');
        backgroundAnimation.className = 'background-animation';
        document.body.appendChild(backgroundAnimation);
    }
}

// Playback control functionality
let isLooping = false;

function initializePlaybackControls() {
    const prevTrackBtn = document.getElementById('prevTrackBtn');
    const nextTrackBtn = document.getElementById('nextTrackBtn');
    const loopBtn = document.getElementById('loopBtn');
    
    // Previous Track
    prevTrackBtn?.addEventListener('click', () => {
        const currentList = getCurrentList();
        if (!currentList || !currentTrack) return;
        
        const currentIndex = currentList.findIndex(track => track.videoId === currentTrack.videoId);
        if (currentIndex > 0) {
            playTrack(currentList[currentIndex - 1]);
        }
    });

    // Next Track
    nextTrackBtn?.addEventListener('click', () => {
        const currentList = getCurrentList();
        if (!currentList || !currentTrack) return;
        
        const currentIndex = currentList.findIndex(track => track.videoId === currentTrack.videoId);
        if (currentIndex < currentList.length - 1) {
            playTrack(currentList[currentIndex + 1]);
        }
    });

    // Loop Toggle
    loopBtn?.addEventListener('click', () => {
        isLooping = !isLooping;
        loopBtn.classList.toggle('active');
        showStatus(`Loop ${isLooping ? 'enabled' : 'disabled'}`, 1500);
    });

    // Initial update of control states
    updateControlStates();
}

// Helper function to get current active list
function getCurrentList() {
    const isPlaylistView = document.getElementById('playlistView').style.display !== 'none';
    return isPlaylistView ? currentPlaylist : queue;
}

// Update control states based on current view and position
function updateControlStates() {
    const prevTrackBtn = document.getElementById('prevTrackBtn');
    const nextTrackBtn = document.getElementById('nextTrackBtn');
    
    if (!currentTrack) {
        prevTrackBtn?.classList.add('disabled');
        nextTrackBtn?.classList.add('disabled');
        return;
    }

    const currentList = getCurrentList();
    if (!currentList || currentList.length === 0) {
        prevTrackBtn?.classList.add('disabled');
        nextTrackBtn?.classList.add('disabled');
        return;
    }

    const currentIndex = currentList.findIndex(track => track.videoId === currentTrack.videoId);
    
    // Update previous button state
    if (prevTrackBtn) {
        prevTrackBtn.classList.toggle('disabled', currentIndex <= 0);
    }

    // Update next button state
    if (nextTrackBtn) {
        nextTrackBtn.classList.toggle('disabled', currentIndex >= currentList.length - 1);
    }
}

// Update the onPlayerStateChange function
function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
        if (isLooping) {
            player.playVideo();
        } else {
            const currentList = getCurrentList();
            if (!currentList || !currentTrack) return;
            
            const currentIndex = currentList.findIndex(track => track.videoId === currentTrack.videoId);
            if (currentIndex < currentList.length - 1) {
                playTrack(currentList[currentIndex + 1]);
            }
        }
    }
    
    // Update control states whenever player state changes
    updateControlStates();
}

// Add this to your existing event listeners
document.addEventListener('DOMContentLoaded', () => {
    initializePlaybackControls();
});

// Update the view change handlers to call updateControlStates
function showPlaylistView(playlist) {
    currentPlaylist = playlist;
    document.getElementById('mainView').style.display = 'none';
    document.getElementById('playlistView').style.display = 'block';
    // ... rest of your showPlaylistView code ...
    setTimeout(updateControlStates, 100);
}

function showMainView() {
    document.getElementById('mainView').style.display = 'block';
    document.getElementById('playlistView').style.display = 'none';
    currentPlaylist = null;
    // ... rest of your showMainView code ...
    setTimeout(updateControlStates, 100);
}

// Add this new function to handle playlist card clicks
function handlePlaylistClick(element) {
    try {
        // Decode the encoded JSON string
        const playlistData = JSON.parse(decodeURIComponent(element.getAttribute('data-playlist')));
        console.log('Playlist clicked:', playlistData);
        showPlaylistPanel(playlistData);
    } catch (error) {
        console.error('Error handling playlist click:', error);
        console.log('Raw playlist data:', element.getAttribute('data-playlist'));
    }
}

// Improved progress bar initialization with floating time preview
function initializeProgressBar() {
    const progressBar = document.querySelector('.progress-bar-container');
    const currentProgress = document.querySelector('.progress-bar-current');
    const timePreview = document.createElement('div');
    timePreview.className = 'time-preview';
    progressBar.appendChild(timePreview);
    
    let lastSeekTime = 0;
    const SEEK_THROTTLE = 200; // Minimum time between seeks in ms
    
    // Handle hover preview
    progressBar.addEventListener('mousemove', (e) => {
        if (!currentTrack) return;
        
        const rect = progressBar.getBoundingClientRect();
        const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const previewTime = position * lastKnownDuration;
        
        // Update preview time and position
        timePreview.textContent = formatDuration(Math.floor(previewTime));
        timePreview.style.left = `${position * 100}%`;
        timePreview.style.display = 'block';
        
        // Add hover indicator
        progressBar.style.setProperty('--hover-position', `${position * 100}%`);
        
        // If dragging, update the progress bar visually
        if (isDraggingSeeker) {
            currentProgress.style.width = `${position * 100}%`;
        }
    });
    
    // Hide preview when not hovering
    progressBar.addEventListener('mouseleave', () => {
        timePreview.style.display = 'none';
    });

    // Handle click/drag on progress bar
    progressBar.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDraggingSeeker = true;
        handleSeek(e);
    });

    // Handle mouse movement while dragging
    document.addEventListener('mousemove', (e) => {
        if (isDraggingSeeker) {
            e.preventDefault();
            const rect = progressBar.getBoundingClientRect();
            const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            currentProgress.style.width = `${position * 100}%`;
        }
    });

    // Handle mouse release anywhere on document
    document.addEventListener('mouseup', (e) => {
        if (isDraggingSeeker) {
            e.preventDefault();
            isDraggingSeeker = false;
            handleSeek(e);
        }
    });

    function handleSeek(e) {
        const now = Date.now();
        if (now - lastSeekTime < SEEK_THROTTLE) return;
        
        const rect = progressBar.getBoundingClientRect();
        const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const seekTime = position * lastKnownDuration;
        
        lastSeekTime = now;
        seek(seekTime);
    }
}

// Update the progress update function
function updateProgress() {
    if (!currentTrack || isDraggingSeeker) return;

    const now = Date.now();
    const elapsed = (now - lastUpdateTime) / 1000;
    
    // Only fetch from server every 3 seconds or if we don't have duration
    if (now - lastUpdateTime > 3000 || lastKnownDuration === 0) {
        fetch(`${backendUrl}/api/get_position`)
            .then(response => response.json())
            .then(data => {
                if (data.error) throw new Error(data.error);

                // Only update if the difference is significant (more than 0.5 seconds)
                if (Math.abs(data.position - lastKnownPosition) > 0.5) {
                    lastKnownPosition = data.position;
                }
                
                lastKnownDuration = data.duration || currentTrack.duration;
                lastUpdateTime = now;
                updateProgressUI(lastKnownPosition, lastKnownDuration);
            })
            .catch(error => {
                console.error('Error updating progress:', error);
            });
    } else {
        // Estimate current position based on time elapsed
        const estimatedPosition = lastKnownPosition + (isPlaying ? elapsed : 0);
        if (estimatedPosition <= lastKnownDuration) {
            // Only update UI if we haven't reached the end
            updateProgressUI(estimatedPosition, lastKnownDuration);
            // Update our last known position
            lastKnownPosition = estimatedPosition;
            lastUpdateTime = now;
        }
    }
}

// Separate UI update function
function updateProgressUI(position, duration) {
    if (!duration) return;
    
    // Update progress bar
    const progress = (position / duration) * 100;
    const progressBar = document.querySelector('.progress-bar-current');
    if (progressBar) {
        progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }
    
    // Update time display
    const currentTimeEl = document.getElementById('currentTime');
    const totalTimeEl = document.getElementById('totalTime');
    
    if (currentTimeEl) {
        currentTimeEl.textContent = formatDuration(Math.floor(position));
    }
    if (totalTimeEl) {
        totalTimeEl.textContent = formatDuration(Math.floor(duration));
    }
}

// Update the seek function to be more reliable
async function seek(position) {
    if (!currentTrack || isSeekInProgress) return;
    
    try {
        isSeekInProgress = true;
        const wasPlaying = isPlaying;
        
        // Pause playback before seeking
        if (wasPlaying) {
            await fetch(`${backendUrl}/api/pause`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        // Update UI immediately
        const progress = (position / lastKnownDuration) * 100;
        document.querySelector('.progress-bar-current').style.width = `${progress}%`;
        
        // Send seek request to server
        const response = await fetch(`${backendUrl}/api/seek`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ position })
        });

        if (!response.ok) {
            throw new Error('Failed to seek');
        }

        // Update local state
        lastKnownPosition = position;
        lastUpdateTime = Date.now();
        
        // Resume playback after a short delay if it was playing
        if (wasPlaying) {
            await new Promise(resolve => setTimeout(resolve, 100));
            await fetch(`${backendUrl}/api/resume`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        // Update time display
        document.getElementById('currentTime').textContent = formatDuration(Math.floor(position));
        
    } catch (error) {
        console.error('Error seeking:', error);
        showStatus('Error seeking track position', 3000);
    } finally {
        isSeekInProgress = false;
    }
}

// Add this new function to handle cleanup
function cleanup() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
    if (serverSyncInterval) {
        clearInterval(serverSyncInterval);
        serverSyncInterval = null;
    }
    lastKnownPosition = 0;
    lastKnownDuration = 0;
    lastUpdateTime = 0;
}