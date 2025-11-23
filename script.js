/**
 * ShowCase - Netflix-style Catalog App
 * Handles Google Sheets API fetching, UI rendering, and state management.
 */

'use strict';

// =========================================
// 1. CONFIGURATION & STATE
// =========================================

const CONFIG = {
    // ⚠️ IMPORTANT: Replace this with your actual Google Sheet ID
    SPREADSHEET_ID: '1R4wubVoX0rjs8Xuu_7vwQ487e4X1ES-OlER0JgSZwjQ', 
    
    API_KEY: 'AIzaSyAe26yWs-xvvTROq6HZ4bEKWbObMqSSHms',
    SHEETS: {
        MOVIES: 'Movies',
        TV: 'TV_Shows'
    },
    IMAGE_BASE_URL: 'https://image.tmdb.org/t/p/w500', 
    PLACEHOLDER_IMG: 'https://placehold.co/300x450/333/white?text=No+Poster'
};

// Global State
const state = {
    allContent: [],
    favorites: JSON.parse(localStorage.getItem('showcase_favorites')) || [],
    currentView: 'home', 
    isLoading: true
};

// DOM Elements
const DOM = {
    app: document.getElementById('app'),
    header: document.getElementById('main-header'),
    mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    mobileMenu: document.getElementById('mobile-menu'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    navLinks: document.querySelectorAll('[data-page]'),
    loadingScreen: document.getElementById('loading-screen'),
    errorScreen: document.getElementById('error-screen'),
    homeView: document.getElementById('home-view'),
    searchView: document.getElementById('search-view'),
    favoritesView: document.getElementById('favorites-view'),
    heroBanner: document.getElementById('hero-banner'),
    contentRows: document.getElementById('content-rows'),
    searchResultsGrid: document.getElementById('search-results-grid'),
    favoritesGrid: document.getElementById('favorites-grid'),
    searchCount: document.getElementById('search-count'),
    favCountBadge: document.getElementById('fav-count-badge'),
    detailModal: document.getElementById('detail-modal'),
    modalBody: document.getElementById('modal-body-content'),
    closeDetailBtn: document.getElementById('close-detail-modal'),
    videoModal: document.getElementById('video-modal'),
    videoPlaceholder: document.getElementById('youtube-player-placeholder'),
    closeVideoBtn: document.getElementById('close-video-modal'),
    filterType: document.getElementById('filter-type'),
    filterYear: document.getElementById('filter-year'),
    filterGenre: document.getElementById('filter-genre'),
    sortBy: document.getElementById('sort-by'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message'),
    retryBtn: document.getElementById('retry-btn')
};

// =========================================
// 2. DATA FETCHING
// =========================================

async function fetchSheetData(sheetName) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${sheetName}?key=${CONFIG.API_KEY}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return data.values || [];
    } catch (error) {
        console.error(`Error fetching ${sheetName}:`, error);
        throw error;
    }
}

function processPosterUrl(url) {
    if (!url) return CONFIG.PLACEHOLDER_IMG;
    let cleanUrl = url.trim();
    if (cleanUrl.includes('impawards.com') && cleanUrl.endsWith('.html')) {
        cleanUrl = cleanUrl.replace(/impawards\.com\/(\d{4})\/(.+)\.html/i, 'impawards.com/$1/posters/$2.jpg');
    }
    if (cleanUrl.includes('impawards.com')) {
        return `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}`;
    }
    return cleanUrl;
}

async function loadAllContent() {
    try {
        const [moviesRaw, tvShowsRaw] = await Promise.all([
            fetchSheetData(CONFIG.SHEETS.MOVIES),
            fetchSheetData(CONFIG.SHEETS.TV)
        ]);

        const isValidRow = (row) => {
            const hasTitle = row[0] && row[0].trim() !== '';
            const hasYear = row[1] && row[1].trim() !== '';
            return hasTitle || hasYear; 
        };

        const parseRow = (row, type) => {
            let isBurmese = false;
            let directorName = '';

            if (type === 'Movie') {
                isBurmese = (row[9] === 'TRUE');
                directorName = row[10] || '';
            } else {
                isBurmese = (row[11] === 'TRUE');
                directorName = row[12] || '';
            }

            const subtitleText = isBurmese ? 'Burmese Subtitle' : 'English Subtitle';

            return {
                id: generateId(row[0]),
                title: row[0] || 'Untitled',
                year: row[1] || 'N/A',
                language: row[2] || 'Unknown',
                genre: row[3] ? row[3].split(',').map(g => g.trim()) : [],
                synopsis: row[4] || 'No synopsis available.',
                cast: row[5] ? row[5].split(',').map(c => c.trim()) : [],
                imdb: row[6] === 'N/A' ? 0 : parseFloat(row[6]) || 0,
                posterUrl: processPosterUrl(row[7]),
                trailerUrl: row[8] || '',
                episodes: (type === 'TV Show' && row[9]) ? row[9].split('\n').filter(s => s.trim() !== '') : [],
                subtitle: subtitleText,
                director: directorName,
                type: type
            };
        };

        const movies = moviesRaw.slice(1).filter(isValidRow).map(row => parseRow(row, 'Movie'));
        const tvShows = tvShowsRaw.slice(1).filter(isValidRow).map(row => parseRow(row, 'TV Show'));

        state.allContent = [...movies, ...tvShows];
        state.allContent.sort(() => Math.random() - 0.5);

        initApp();
    } catch (error) {
        showErrorState();
    }
}

function generateId(title) {
    if (!title) return Math.random().toString(36).substr(2, 9);
    return title.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

// =========================================
// 3. UI RENDERING
// =========================================

function initApp() {
    DOM.loadingScreen.classList.add('hidden');
    DOM.homeView.classList.remove('hidden');
    
    updateFavCount();
    populateYearFilter();
    populateGenreFilter(); 
    
    renderHero();
    renderHomeRows();
}

function renderHero() {
    const candidates = state.allContent.filter(item => item.imdb > 7.5 && item.posterUrl.startsWith('http'));
    const heroItem = candidates[Math.floor(Math.random() * candidates.length)] || state.allContent[0];

    if (!heroItem) return;

    DOM.heroBanner.style.backgroundImage = `linear-gradient(to top, #141414, transparent 50%), linear-gradient(to right, rgba(0,0,0,0.8) 0%, transparent 80%), url('${heroItem.posterUrl}')`;
    
    // UPDATED: Use || 'N/A' to show N/A if rating is 0
    DOM.heroBanner.innerHTML = `
        <div class="hero-overlay">
            <div class="hero-content">
                <h1 class="hero-title">${heroItem.title}</h1>
                <div class="hero-meta">
                    <span class="imdb-score">IMDB ${heroItem.imdb || 'N/A'}</span>
                    <span>${heroItem.year}</span>
                    <span class="meta-badge">${heroItem.type}</span>
                    <span class="meta-badge subtitle-badge">${heroItem.subtitle}</span>
                </div>
                <p class="hero-desc">${heroItem.synopsis}</p>
                <div class="hero-actions">
                    <button class="primary-btn" onclick="openVideoPlayer('${heroItem.trailerUrl}')">
                        <i class="fa-solid fa-play"></i> Play Trailer
                    </button>
                    <button class="secondary-btn" onclick="openDetailModal('${heroItem.id}')">
                        <i class="fa-solid fa-circle-info"></i> More Info
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderHomeRows() {
    DOM.contentRows.innerHTML = '';
    const categories = [
        { title: 'Recently Added', filter: item => true, limit: 10 },
        { title: 'Trending Movies', filter: item => item.type === 'Movie' && item.imdb >= 7.0, limit: 10 },
        { title: 'TV Shows', filter: item => item.type === 'TV Show', limit: 10 },
        { title: 'Action & Thriller', filter: item => item.genre.some(g => g.includes('Action') || g.includes('Thriller')), limit: 10 },
        { title: 'Comedy', filter: item => item.genre.some(g => g.includes('Comedy')), limit: 10 },
        { title: 'Sci-Fi & Fantasy', filter: item => item.genre.some(g => g.includes('Sci-Fi') || g.includes('Fantasy')), limit: 10 },
        { title: 'Top Rated', filter: item => item.imdb >= 8.0, limit: 10 }
    ];

    categories.forEach(cat => {
        const items = state.allContent.filter(cat.filter).slice(0, cat.limit);
        if (items.length > 0) {
            createRow(cat.title, items);
        }
    });
}

function createRow(title, items) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'category-row';
    const sliderHTML = items.map(item => createCardHTML(item)).join('');
    rowDiv.innerHTML = `<h3 class="row-header">${title}</h3><div class="row-slider">${sliderHTML}</div>`;
    DOM.contentRows.appendChild(rowDiv);
}

function createCardHTML(item) {
    // UPDATED: Use || 'N/A' for card display
    return `
        <div class="movie-card" onclick="openDetailModal('${item.id}')">
            <img src="${item.posterUrl}" alt="${item.title}" loading="lazy" onerror="this.src='${CONFIG.PLACEHOLDER_IMG}'">
            <div class="card-overlay">
                <div class="card-title">${item.title}</div>
                <div class="card-meta">
                    <span>${item.year}</span>
                    <span><i class="fa-solid fa-star" style="color: gold; font-size: 0.6rem;"></i> ${item.imdb || 'N/A'}</span>
                </div>
            </div>
        </div>
    `;
}

// =========================================
// 4. SEARCH & FILTERING
// =========================================

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const performSearch = debounce(() => {
    const query = DOM.searchInput.value.toLowerCase().trim();
    const typeFilter = DOM.filterType.value;
    const yearFilter = DOM.filterYear.value;
    const genreFilter = DOM.filterGenre.value;
    const sortValue = DOM.sortBy.value;

    if (!query && typeFilter === 'all' && yearFilter === 'all' && genreFilter === 'all') {
        if (state.currentView === 'search') navigateTo('home');
        return;
    }

    navigateTo('search');
    DOM.clearSearchBtn.classList.remove('hidden');

    let results = state.allContent.filter(item => {
        const matchTitle = item.title.toLowerCase().includes(query);
        const matchCast = item.cast.some(actor => actor.toLowerCase().includes(query));
        const matchDirector = item.director && item.director.toLowerCase().includes(query);
        const matchGenreText = item.genre.some(g => g.toLowerCase().includes(query));
        
        const isTextMatch = matchTitle || matchCast || matchDirector || matchGenreText;
        const isTypeMatch = typeFilter === 'all' || item.type === typeFilter;
        const isYearMatch = yearFilter === 'all' || item.year.toString() === yearFilter;
        const isGenreMatch = genreFilter === 'all' || item.genre.includes(genreFilter);

        return isTextMatch && isTypeMatch && isYearMatch && isGenreMatch;
    });

    if (sortValue === 'rating') {
        results.sort((a, b) => b.imdb - a.imdb);
    } else if (sortValue === 'year') {
        results.sort((a, b) => parseInt(b.year) - parseInt(a.year));
    } 

    renderGrid(DOM.searchResultsGrid, results);
    DOM.searchCount.textContent = `(${results.length})`;
}, 300);

function renderGrid(container, items) {
    container.innerHTML = '';
    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i class="fa-solid fa-magnifying-glass"></i>
                <p>No matches found.</p>
            </div>`;
        return;
    }
    items.forEach(item => {
        const div = document.createElement('div');
        div.innerHTML = createCardHTML(item);
        container.appendChild(div.firstElementChild); 
    });
}

function populateYearFilter() {
    const years = [...new Set(state.allContent.map(item => item.year))].sort().reverse();
    years.forEach(year => {
        if (year !== 'N/A') {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            DOM.filterYear.appendChild(option);
        }
    });
}

function populateGenreFilter() {
    const allGenres = new Set();
    state.allContent.forEach(item => {
        item.genre.forEach(g => allGenres.add(g));
    });
    
    const sortedGenres = [...allGenres].sort();
    
    sortedGenres.forEach(genre => {
        if (genre) {
            const option = document.createElement('option');
            option.value = genre;
            option.textContent = genre;
            DOM.filterGenre.appendChild(option);
        }
    });
}

// =========================================
// 5. DETAIL MODAL & INTERACTIONS
// =========================================

window.searchByCast = function(name) {
    DOM.detailModal.classList.add('hidden');
    document.body.style.overflow = '';
    DOM.searchInput.value = name;
    performSearch();
    navigateTo('search');
};

window.openDetailModal = function(id) {
    DOM.detailModal.scrollTop = 0;

    const item = state.allContent.find(i => i.id === id);
    if (!item) return;

    const isFav = state.favorites.includes(item.id);
    
    const castHTML = item.cast.length > 0 
        ? item.cast.map(actor => 
            `<span class="cast-link" onclick="searchByCast('${actor.replace(/'/g, "\\'")}')">${actor}</span>`
          ).join(', ')
        : 'N/A';

    const directorHTML = item.director 
        ? `<span class="cast-link" onclick="searchByCast('${item.director.replace(/'/g, "\\'")}')">${item.director}</span>`
        : 'N/A';

    let episodesHTML = '';
    if (item.type === 'TV Show' && item.episodes && item.episodes.length > 0) {
        const badges = item.episodes.map(e => `<div class="episode-badge">${e}</div>`).join('');
        episodesHTML = `
            <div class="episodes-container">
                <h3 class="episodes-header">Seasons & Episodes</h3>
                <div class="episodes-grid">${badges}</div>
            </div>`;
    }

    let relatedItems = state.allContent.filter(other => 
        other.id !== item.id && 
        other.genre.some(g => item.genre.includes(g))
    );
    relatedItems = relatedItems.sort(() => 0.5 - Math.random()).slice(0, 6);
    
    let relatedHTML = '';
    if (relatedItems.length > 0) {
        const cardsHTML = relatedItems.map(r => createCardHTML(r)).join('');
        relatedHTML = `
            <div class="related-section">
                <h3 class="episodes-header">More Like This</h3>
                <div class="related-grid">
                    ${cardsHTML}
                </div>
            </div>
        `;
    }

    let playButtonHTML = '';
    if (item.trailerUrl) {
        playButtonHTML = `
            <button class="primary-btn" onclick="openVideoPlayer('${item.trailerUrl}')">
                <i class="fa-solid fa-play"></i> Play Trailer
            </button>`;
    }

    // UPDATED: Use || 'N/A' for rating display
    DOM.modalBody.innerHTML = `
        <div class="modal-hero">
            <div class="hero-backdrop" style="background-image: url('${item.posterUrl}')"></div>
            <img class="hero-poster-img" src="${item.posterUrl}" alt="${item.title}" onerror="this.src='${CONFIG.PLACEHOLDER_IMG}'">
            <div class="hero-gradient-overlay"></div>
        </div>

        <div class="modal-info">
            <div class="modal-header-row">
                <h2>${item.title}</h2>
                <div class="modal-meta-tags">
                    <span class="imdb-score">IMDB ${item.imdb || 'N/A'}</span>
                    <span class="year">${item.year}</span>
                    <span class="meta-badge">${item.type}</span>
                    <span class="meta-badge">${item.language}</span>
                    <span class="meta-badge subtitle-badge">${item.subtitle}</span>
                </div>
            </div>
            
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
                ${playButtonHTML}
                <button class="modal-fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite('${item.id}', this)">
                    <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                </button>
            </div>
            
            ${episodesHTML}

            <p class="modal-description">${item.synopsis}</p>
            
            <div class="modal-detail-list">
                <span>Cast:</span> ${castHTML}
            </div>
            <div class="modal-detail-list">
                <span>Director:</span> ${directorHTML}
            </div>
            <div class="modal-detail-list">
                <span>Genres:</span> ${item.genre.join(', ')}
            </div>
            
            ${relatedHTML}
        </div>
    `;

    DOM.detailModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};

window.toggleFavorite = function(id, btnElement) {
    const index = state.favorites.indexOf(id);
    const icon = btnElement.querySelector('i');
    
    if (index === -1) {
        state.favorites.push(id);
        btnElement.classList.add('active');
        icon.classList.remove('fa-regular');
        icon.classList.add('fa-solid');
        showToast('Added to My List');
    } else {
        state.favorites.splice(index, 1);
        btnElement.classList.remove('active');
        icon.classList.remove('fa-solid');
        icon.classList.add('fa-regular');
        showToast('Removed from My List');
        
        if (state.currentView === 'favorites') {
            loadFavoritesPage();
        }
    }
    localStorage.setItem('showcase_favorites', JSON.stringify(state.favorites));
    updateFavCount();
};

function updateFavCount() {
    const count = state.favorites.length;
    DOM.favCountBadge.textContent = count;
    if (count > 0) DOM.favCountBadge.classList.remove('hidden');
    else DOM.favCountBadge.classList.add('hidden');
}

// =========================================
// 6. VIDEO PLAYER
// =========================================

window.openVideoPlayer = function(url) {
    if (!url) return;
    const videoId = extractYouTubeID(url);
    if (!videoId) {
        showToast('Trailer not available');
        return;
    }
    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
    DOM.videoPlaceholder.innerHTML = `<iframe src="${embedUrl}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    DOM.videoModal.classList.remove('hidden');
};

function closeVideoPlayer() {
    DOM.videoModal.classList.add('hidden');
    DOM.videoPlaceholder.innerHTML = ''; 
}

function extractYouTubeID(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// =========================================
// 7. NAVIGATION & UTILS
// =========================================

function navigateTo(pageName) {
    state.currentView = pageName;
    DOM.homeView.classList.add('hidden');
    DOM.searchView.classList.add('hidden');
    DOM.favoritesView.classList.add('hidden');
    
    DOM.navLinks.forEach(link => {
        if (link.dataset.page === pageName) link.classList.add('active');
        else link.classList.remove('active');
    });
    DOM.mobileMenu.classList.add('hidden');

    switch(pageName) {
        case 'home':
            DOM.homeView.classList.remove('hidden');
            DOM.searchInput.value = '';
            DOM.clearSearchBtn.classList.add('hidden');
            break;
        case 'movies':
            navigateToSearchPreFilter('Movie');
            break;
        case 'tv':
            navigateToSearchPreFilter('TV Show');
            break;
        case 'favorites':
            loadFavoritesPage();
            DOM.favoritesView.classList.remove('hidden');
            break;
        case 'search':
            DOM.searchView.classList.remove('hidden');
            break;
    }
    window.scrollTo(0, 0);
}

function navigateToSearchPreFilter(type) {
    state.currentView = 'search';
    DOM.searchView.classList.remove('hidden');
    DOM.filterType.value = type;
    DOM.filterYear.value = 'all';
    DOM.filterGenre.value = 'all'; 
    DOM.searchInput.value = '';
    
    const results = state.allContent.filter(item => item.type === type);
    renderGrid(DOM.searchResultsGrid, results);
    DOM.searchCount.textContent = `(${results.length})`;
    
    DOM.navLinks.forEach(link => {
        const target = type === 'Movie' ? 'movies' : 'tv';
        if (link.dataset.page === target) link.classList.add('active');
        else link.classList.remove('active');
    });
}

function loadFavoritesPage() {
    const favItems = state.allContent.filter(item => state.favorites.includes(item.id));
    const noFavMsg = document.getElementById('no-favorites-msg');
    if (favItems.length === 0) {
        DOM.favoritesGrid.innerHTML = '';
        noFavMsg.classList.remove('hidden');
    } else {
        noFavMsg.classList.add('hidden');
        renderGrid(DOM.favoritesGrid, favItems);
    }
}

function showToast(msg) {
    DOM.toastMessage.textContent = msg;
    DOM.toast.classList.remove('hidden');
    setTimeout(() => {
        DOM.toast.classList.add('hidden');
    }, 3000);
}

function showErrorState() {
    DOM.loadingScreen.classList.add('hidden');
    DOM.errorScreen.classList.remove('hidden');
}

// =========================================
// 8. EVENT LISTENERS
// =========================================

document.addEventListener('DOMContentLoaded', () => {
    loadAllContent();
    DOM.searchInput.addEventListener('input', performSearch);
    DOM.clearSearchBtn.addEventListener('click', () => {
        DOM.searchInput.value = '';
        performSearch();
        navigateTo('home');
    });
    
    DOM.filterType.addEventListener('change', performSearch);
    DOM.filterYear.addEventListener('change', performSearch);
    DOM.filterGenre.addEventListener('change', performSearch); 
    DOM.sortBy.addEventListener('change', performSearch);

    DOM.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const page = e.target.dataset.page;
            navigateTo(page);
        });
    });
    DOM.mobileMenuBtn.addEventListener('click', () => {
        DOM.mobileMenu.classList.toggle('hidden');
    });
    DOM.closeDetailBtn.addEventListener('click', () => {
        DOM.detailModal.classList.add('hidden');
        document.body.style.overflow = '';
    });
    DOM.detailModal.addEventListener('click', (e) => {
        if (e.target === DOM.detailModal) {
            DOM.detailModal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    });
    DOM.closeVideoBtn.addEventListener('click', closeVideoPlayer);
    DOM.videoModal.addEventListener('click', (e) => {
        if (e.target === DOM.videoModal) closeVideoPlayer();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            DOM.detailModal.classList.add('hidden');
            closeVideoPlayer();
            document.body.style.overflow = '';
        }
    });
    document.getElementById('clear-favorites').addEventListener('click', () => {
        if(confirm('Are you sure you want to clear your list?')) {
            state.favorites = [];
            localStorage.setItem('showcase_favorites', JSON.stringify([]));
            updateFavCount();
            loadFavoritesPage();
        }
    });
    DOM.retryBtn.addEventListener('click', () => {
        DOM.errorScreen.classList.add('hidden');
        DOM.loadingScreen.classList.remove('hidden');
        loadAllContent();
    });
});
