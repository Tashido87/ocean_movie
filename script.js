/**
 * ShowCase - Netflix-style Catalog App
 * Updated: Reverted Cast View to Search-based navigation
 */

'use strict';

// =========================================
// 1. CONFIGURATION & STATE
// =========================================

const CONFIG = {
    IMAGE_BASE_URL: 'https://image.tmdb.org/t/p/w500', 
    PLACEHOLDER_IMG: 'https://placehold.co/300x450/333/white?text=No+Poster',
    ITEMS_PER_PAGE: 30,
    PAGINATION_GROUP_SIZE: 5
};

const GENRE_FIXES = {
    'sci-fi': 'Science Fiction', 'sci-fi/fantasy': 'Science Fiction',
    'science fiction': 'Science Fiction', 'science-fiction': 'Science Fiction',
    'animated': 'Animation', 'cartoon': 'Animation', 'anime': 'Animation',
    'sport': 'Sports', 'suspense/thriller': 'Thriller', 'suspense': 'Thriller',
    'rom-com': 'Romance', 'romantic comedy': 'Romance', 'docu': 'Documentary'
};

const state = {
    allContent: [],
    favorites: JSON.parse(localStorage.getItem('showcase_favorites')) || [],
    configData: {}, 
    currentView: 'home', 
    isLoading: true,
    sliderInterval: null,
    currentSlideIndex: 0,
    heroItems: [],
    scrollPositions: {}, 
    
    fuse: null,
    
    listing: {
        activeItems: [],
        currentPage: 1,
        currentFilterType: '', 
        searchQuery: '',
        baseTitle: 'Listing', 
        filters: {
            language: '',
            year: '',
            genre: '',
            subtitle: '',
            sort: 'latest' 
        }
    }
};

const DOM = {
    app: document.getElementById('app'),
    header: document.getElementById('main-header'),
    mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    mobileMenu: document.getElementById('mobile-menu'),
    searchInput: document.getElementById('search-input'),
    searchCountBadge: document.getElementById('search-count-badge'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    navLinks: document.querySelectorAll('[data-page]'),
    mobileNavLinks: document.querySelectorAll('.mobile-nav-links li'),
    loadingScreen: document.getElementById('loading-screen'),
    
    // Views
    homeView: document.getElementById('home-view'),
    searchView: document.getElementById('search-view'),
    searchEmptyState: document.getElementById('search-empty-state'),
    searchResultsGrid: document.getElementById('search-results-grid'),
    favoritesView: document.getElementById('favorites-view'),
    listingView: document.getElementById('listing-view'),
    
    // Hero & Content
    heroWrapper: document.getElementById('hero-wrapper'),
    contentRows: document.getElementById('content-rows'),
    favoritesGrid: document.getElementById('favorites-grid'),
    favCountBadge: document.getElementById('fav-count-badge'),
    
    // Listing Elements
    listingTitle: document.getElementById('listing-title'),
    listingGrid: document.getElementById('listing-grid'),
    listingPagination: document.getElementById('listing-pagination'),
    activeFiltersContainer: document.getElementById('active-filters'),
    listingFilters: {
        container: document.getElementById('listing-filters'),
        type: document.getElementById('filter-type'),
        language: document.getElementById('filter-language'),
        year: document.getElementById('filter-year'),
        genre: document.getElementById('filter-genre'),
        subtitle: document.getElementById('filter-subtitle'),
        sort: document.getElementById('filter-sort'),
        clearBtn: document.getElementById('filter-clear-btn')
    },

    // Modals
    detailModal: document.getElementById('detail-modal'),
    modalBody: document.getElementById('modal-body-content'),
    closeDetailBtn: document.getElementById('close-detail-modal'),
    videoModal: document.getElementById('video-modal'),
    videoPlaceholder: document.getElementById('youtube-player-placeholder'),
    closeVideoBtn: document.getElementById('close-video-modal'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message')
};

// =========================================
// 2. DATA FETCHING & PARSING
// =========================================

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

function parseRow(row, type, index) {
    let isBurmese = false;
    let directorName = '';
    let streamingPlatform = '';

    if (type === 'Movie') {
        isBurmese = (row[9] === 'TRUE');
        directorName = row[10] || '';
        streamingPlatform = row[11] || ''; 
    } else {
        isBurmese = (row[11] === 'TRUE');
        directorName = row[12] || '';
        streamingPlatform = row[13] || ''; 
    }

    return {
        id: generateId(row[0]),
        title: row[0] || 'Untitled',
        year: row[1] || 'N/A',
        language: row[2] || 'Unknown',
        genre: row[3] ? row[3].split(',').map(g => {
            let clean = g.trim();
            if (!clean) return null;
            let lower = clean.toLowerCase();
            if (GENRE_FIXES[lower]) return GENRE_FIXES[lower];
            return clean.replace(/\w\S*/g, (w) => (w.replace(/^\w/, (c) => c.toUpperCase())));
        }).filter(g => g) : [],
        synopsis: row[4] || '',
        cast: row[5] ? row[5].split(',').map(c => c.trim()) : [],
        imdb: row[6] === 'N/A' ? 0 : parseFloat(row[6]) || 0,
        posterUrl: processPosterUrl(row[7]),
        trailerUrl: row[8] || '',
        episodes: (type === 'TV Show' && row[9]) ? row[9].split('\n').filter(s => s.trim() !== '') : [],
        subtitle: isBurmese ? 'Burmese Subtitle' : 'English Subtitle',
        director: directorName,
        type: type,
        streaming: streamingPlatform,
        originalRowIndex: index 
    };
}

function processConfigData(configRaw) {
    if (configRaw && configRaw.length > 1) {
        configRaw.slice(1).forEach(row => {
            const [key, desc, listRaw, lang, genre, sort, type, platform, rating] = row;
            if (key && desc) {
                state.configData[key] = {
                    description: desc.trim(),
                    list: listRaw ? listRaw.split(',').map(t => t.trim()).filter(t => t) : [],
                    language: lang ? lang.trim() : '',
                    genre: genre ? genre.trim() : '',
                    sort: sort ? sort.trim().toLowerCase() : 'random',
                    type: type ? type.trim().toLowerCase() : '',
                    platform: platform ? platform.trim() : '',
                    rating: rating ? parseFloat(rating) : 0 
                };
            }
        });
    }
}

async function loadAllContent() {
    try {
        const response = await fetch('./content.json');
        if (!response.ok) throw new Error('Failed to load local content.json');
        
        const data = await response.json();
        
        const movies = (data.movies || []).slice(1).filter(r => r[0]).map((r, i) => parseRow(r, 'Movie', i));
        const tvShows = (data.tv || []).slice(1).filter(r => r[0]).map((r, i) => parseRow(r, 'TV Show', i));

        state.allContent = [...movies, ...tvShows];
        
        const fuseOptions = {
            keys: [
                { name: 'title', weight: 0.4 },
                { name: 'cast', weight: 0.3 },
                { name: 'director', weight: 0.2 },
                { name: 'genre', weight: 0.1 }
            ],
            threshold: 0.3,
            ignoreLocation: true
        };
        state.fuse = new Fuse(state.allContent, fuseOptions);

        processConfigData(data.config || []);
        populateFilterOptions(); 
        
        initApp();
        
    } catch (error) {
        console.error("Data Load Error:", error);
        if(DOM.loadingScreen) DOM.loadingScreen.innerHTML = '<p>Error loading data. Check console.</p>';
    }
}

function generateId(title) {
    if (!title) return Math.random().toString(36).substr(2, 9);
    return title.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

// =========================================
// 3. NAVIGATION & ROUTING
// =========================================

function handleHashChange() {
    const hash = window.location.hash.slice(1); 
    
    if (!hash) {
        showView('home');
        return;
    }

    if (hash === 'movies') showView('movies');
    else if (hash === 'tv') showView('tv');
    else if (hash === 'favorites') showView('favorites');
    else if (hash.startsWith('search=')) {
        const query = decodeURIComponent(hash.split('=')[1]);
        DOM.searchInput.value = query;
        performSearch();
    } else {
        showView('home');
    }
}

function navigateTo(pageName, param = null) {
    if (pageName === 'home') window.location.hash = '';
    else if (pageName === 'movies') window.location.hash = 'movies';
    else if (pageName === 'tv') window.location.hash = 'tv';
    else if (pageName === 'favorites') window.location.hash = 'favorites';
    else if (pageName === 'listing-custom') {
        state.listing.baseTitle = param.title;
        state.currentView = 'listing-custom';
        updateUIForView('listing-view');
        resetFilters();
        updateListingView(param.items);
    }
}

function showView(viewName) {
    state.currentView = viewName;
    
    if (state.lastView) {
        state.scrollPositions[state.lastView] = window.scrollY;
    }
    state.lastView = viewName;

    DOM.homeView.classList.add('hidden');
    DOM.favoritesView.classList.add('hidden');
    DOM.listingView.classList.add('hidden');
    DOM.searchView.classList.add('hidden');
    DOM.detailModal.classList.add('hidden'); 
    document.body.style.overflow = '';

    DOM.navLinks.forEach(link => link.classList.remove('active'));
    DOM.mobileNavLinks.forEach(link => link.classList.remove('active'));
    
    const activeNav = document.querySelector(`[data-page="${viewName}"]`);
    if(activeNav) activeNav.classList.add('active');

    if (viewName === 'home') {
        DOM.homeView.classList.remove('hidden');
    } else if (viewName === 'movies') {
        DOM.listingView.classList.remove('hidden');
        state.listing.baseTitle = 'Movies';
        state.listing.currentFilterType = 'Movie';
        resetFilters();
        populateFilterOptions('Movie');
        state.listing.currentPage = 1;
        updateListingView();
    } else if (viewName === 'tv') {
        DOM.listingView.classList.remove('hidden');
        state.listing.baseTitle = 'TV Shows';
        state.listing.currentFilterType = 'TV Show';
        resetFilters();
        populateFilterOptions('TV Show');
        state.listing.currentPage = 1;
        updateListingView();
    } else if (viewName === 'favorites') {
        DOM.favoritesView.classList.remove('hidden');
        loadFavoritesPage();
    }

    const savedScroll = state.scrollPositions[viewName] || 0;
    setTimeout(() => window.scrollTo(0, savedScroll), 0);
}

function updateUIForView(activeId) {
    [DOM.homeView, DOM.searchView, DOM.favoritesView, DOM.listingView].forEach(el => el.classList.add('hidden'));
    document.getElementById(activeId).classList.remove('hidden');
}

// =========================================
// 4. UI RENDERING COMPONENTS
// =========================================

function createCardHTML(item) {
    const badgeHTML = `
        <div class="card-badges">
            ${item.streaming ? `<span class="platform-badge">${item.streaming}</span>` : ''}
            ${item.imdb > 0 ? `<span class="rating-pill">★ ${item.imdb}</span>` : ''}
            ${state.favorites.includes(item.id) ? `<span class="list-badge"><i class="fa-solid fa-check"></i></span>` : ''}
        </div>
    `;

    return `
        <div class="movie-card ${state.favorites.includes(item.id) ? 'in-list' : ''}" onclick="openDetailModal('${item.id}')">
            ${badgeHTML}
            <img src="${item.posterUrl}" alt="${item.title} (${item.year})" loading="lazy" onerror="this.src='${CONFIG.PLACEHOLDER_IMG}'">
            <div class="card-overlay">
                <div class="card-title">${item.title}</div>
                <div class="card-meta">
                    <span>${item.year}</span>
                    <span>${item.type === 'TV Show' ? 'Series' : 'Movie'}</span>
                </div>
            </div>
        </div>
    `;
}

// =========================================
// 5. SEARCH LOGIC
// =========================================

const performSearch = debounce(() => {
    const query = DOM.searchInput.value.trim();
    
    if (query.length > 0) {
        DOM.clearSearchBtn.classList.remove('hidden');
        const count = state.fuse.search(query).length;
        DOM.searchCountBadge.textContent = `${count}`;
        DOM.searchCountBadge.classList.remove('hidden');
    } else {
        DOM.clearSearchBtn.classList.add('hidden');
        DOM.searchCountBadge.classList.add('hidden');
        if (state.currentView === 'search-results') {
            window.location.hash = ''; 
        }
        return;
    }

    state.listing.searchQuery = query;
    state.currentView = 'search-results';
    
    updateUIForView('search-view');
    renderSearchResults(query);

}, 300);

function renderSearchResults(query) {
    if (!state.fuse) return;
    
    const results = state.fuse.search(query).map(r => r.item);
    
    DOM.searchResultsGrid.innerHTML = '';
    
    if (results.length === 0) {
        DOM.searchEmptyState.classList.remove('hidden');
        DOM.searchEmptyState.querySelector('p').textContent = `No results found for "${query}"`;
    } else {
        DOM.searchEmptyState.classList.add('hidden');
        results.forEach(item => {
            const div = document.createElement('div');
            div.innerHTML = createCardHTML(item);
            DOM.searchResultsGrid.appendChild(div.firstElementChild);
        });
    }
}

// Restore: Search by Cast Click
window.searchByCast = function(name) {
    DOM.detailModal.classList.add('hidden');
    document.body.style.overflow = '';
    DOM.searchInput.value = name;
    performSearch();
};

// =========================================
// 6. LISTING & FILTERS
// =========================================

function updateListingView(customItems = null) {
    DOM.listingFilters.container.classList.remove('hidden');
    
    let items = customItems || state.allContent;

    if (!customItems) {
        if (state.listing.currentFilterType) {
            items = items.filter(i => i.type === state.listing.currentFilterType);
        }
        const f = state.listing.filters;
        if (f.language) items = items.filter(i => i.language === f.language);
        if (f.year) items = items.filter(i => i.year === f.year);
        if (f.genre) items = items.filter(i => i.genre.includes(f.genre));
        if (f.subtitle) items = items.filter(i => i.subtitle.includes(f.subtitle));

        if (f.sort === 'latest') {
            items = getSortedByRecency(items);
        } else if (f.sort === 'year') {
            items.sort((a, b) => parseInt(b.year) - parseInt(a.year));
        } else if (f.sort === 'title') {
            items.sort((a, b) => a.title.localeCompare(b.title));
        }
    }

    state.listing.activeItems = items;
    
    const totalPages = Math.ceil(items.length / CONFIG.ITEMS_PER_PAGE);
    if (state.listing.currentPage > totalPages) state.listing.currentPage = 1;

    renderFilterChips();

    DOM.listingTitle.innerHTML = `${state.listing.baseTitle} <span style="font-size: 0.6em; opacity: 0.6; vertical-align: middle;">(${items.length})</span>`;

    renderListingGrid();
    renderPagination();
}

function renderFilterChips() {
    const f = state.listing.filters;
    const chips = [];

    if (f.language) chips.push({ label: f.language, key: 'language' });
    if (f.year) chips.push({ label: f.year, key: 'year' });
    if (f.genre) chips.push({ label: f.genre, key: 'genre' });
    if (f.subtitle) chips.push({ label: f.subtitle, key: 'subtitle' });

    DOM.activeFiltersContainer.innerHTML = chips.map(chip => `
        <div class="filter-chip" onclick="removeFilter('${chip.key}')">
            ${chip.label} <i class="fa-solid fa-times"></i>
        </div>
    `).join('');
}

window.removeFilter = function(key) {
    state.listing.filters[key] = '';
    const select = document.getElementById(`filter-${key}`);
    if (select) select.value = '';
    updateListingView();
};

function renderPagination() {
    const container = DOM.listingPagination;
    container.innerHTML = '';
    
    const totalItems = state.listing.activeItems.length;
    const totalPages = Math.ceil(totalItems / CONFIG.ITEMS_PER_PAGE);
    
    if (totalPages <= 1) return;

    const current = state.listing.currentPage;
    
    const info = document.createElement('span');
    info.className = 'page-info';
    info.textContent = `Page ${current} of ${totalPages}`;
    container.appendChild(info);

    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    prevBtn.disabled = current === 1;
    prevBtn.onclick = () => { state.listing.currentPage--; updateListingView(); window.scrollTo(0,0); };
    container.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    nextBtn.disabled = current === totalPages;
    nextBtn.onclick = () => { state.listing.currentPage++; updateListingView(); window.scrollTo(0,0); };
    container.appendChild(nextBtn);
}

function renderListingGrid() {
    DOM.listingGrid.innerHTML = '';
    
    if (state.listing.activeItems.length === 0) {
        DOM.listingGrid.innerHTML = `<div class="empty-state"><p>No results match your filters.</p></div>`;
        return;
    }

    const start = (state.listing.currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
    const end = start + CONFIG.ITEMS_PER_PAGE;
    const pageItems = state.listing.activeItems.slice(start, end);

    const frag = document.createDocumentFragment();
    pageItems.forEach(item => {
        const div = document.createElement('div');
        div.innerHTML = createCardHTML(item);
        frag.appendChild(div.firstElementChild);
    });
    DOM.listingGrid.appendChild(frag);
}

// =========================================
// 7. FAVORITES
// =========================================

function loadFavoritesPage() {
    let items = state.allContent.filter(i => state.favorites.includes(i.id));
    
    items.reverse();

    const container = DOM.favoritesGrid;
    container.innerHTML = '';
    
    if (items.length === 0) {
        document.getElementById('no-favorites-msg').classList.remove('hidden');
    } else {
        document.getElementById('no-favorites-msg').classList.add('hidden');
        const frag = document.createDocumentFragment();
        items.forEach(item => {
            const div = document.createElement('div');
            div.innerHTML = createCardHTML(item);
            frag.appendChild(div.firstElementChild);
        });
        container.appendChild(frag);
    }
}

// =========================================
// 8. MODALS & INTERACTIONS
// =========================================

window.openDetailModal = function(id) {
    const item = state.allContent.find(i => i.id === id);
    if (!item) return;

    state.scrollPositions[state.currentView] = window.scrollY;

    const isFav = state.favorites.includes(item.id);
    const castHTML = item.cast.length > 0 
        ? item.cast.map(actor => `<span class="cast-link" onclick="searchByCast('${actor.replace(/'/g, "\\'")}')">${actor}</span>`).join('')
        : 'N/A';
    
    let playButtonHTML = `<button class="primary-btn" disabled style="opacity:0.5; cursor:not-allowed"><i class="fa-solid fa-ban"></i> No Trailer</button>`;
    
    if (item.trailerUrl && item.trailerUrl.length > 5) {
        playButtonHTML = `
            <button class="primary-btn" onclick="openVideoPlayer('${item.trailerUrl}')">
                <i class="fa-solid fa-play"></i> Play Trailer
            </button>`;
    }

    let relatedItems = state.allContent.filter(other => 
        other.id !== item.id && other.genre.some(g => item.genre.includes(g))
    ).sort(() => 0.5 - Math.random()).slice(0, 6);
    
    let relatedHTML = '';
    if (relatedItems.length > 0) {
        relatedHTML = `
            <div class="detail-section">
                <span class="detail-label">Similar Titles</span>
                <div class="related-grid">
                    ${relatedItems.map(r => createCardHTML(r)).join('')}
                </div>
            </div>`;
    }

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
                    <span class="imdb-score">★ ${item.imdb || 'N/A'}</span>
                    <span class="meta-badge">${item.year}</span>
                    <span class="meta-badge">${item.type}</span>
                    <span class="meta-badge subtitle-badge">${item.subtitle}</span>
                </div>
            </div>
            
            <div class="modal-controls">
                ${playButtonHTML}
                <button class="modal-fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite('${item.id}', this)" title="${isFav ? 'Remove from List' : 'Add to List'}">
                    <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                </button>
            </div>

            <p class="modal-description">${item.synopsis}</p>
            
            <div class="detail-section">
                <span class="detail-label">Details</span>
                <div class="detail-content">
                    Director: ${item.director || 'N/A'} <br>
                    Genres: ${item.genre.join(', ')} <br>
                    Language: ${item.language}
                </div>
            </div>

            <div class="detail-section">
                <span class="detail-label">Cast</span>
                <div class="detail-content">${castHTML}</div>
            </div>

            ${relatedHTML}
        </div>
    `;
    
    DOM.detailModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    const relatedLinks = DOM.modalBody.querySelectorAll('.related-grid .movie-card');
    relatedLinks.forEach(card => {
        card.onclick = (e) => {
            e.stopPropagation();
            DOM.detailModal.scrollTo(0, 0);
        };
    });
};

window.toggleFavorite = function(id, btn) {
    const idx = state.favorites.indexOf(id);
    const icon = btn.querySelector('i');
    
    if (idx === -1) {
        state.favorites.push(id);
        btn.classList.add('active');
        icon.className = 'fa-solid fa-heart';
        showToast('Added to My List');
    } else {
        state.favorites.splice(idx, 1);
        btn.classList.remove('active');
        icon.className = 'fa-regular fa-heart';
        showToast('Removed from My List');
        if (state.currentView === 'favorites') loadFavoritesPage();
    }
    localStorage.setItem('showcase_favorites', JSON.stringify(state.favorites));
    updateFavCount();
};

window.openVideoPlayer = function(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    const videoId = (match && match[2].length === 11) ? match[2] : null;

    if (videoId) {
        const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
        DOM.videoPlaceholder.innerHTML = `<iframe src="${embedUrl}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        DOM.videoModal.classList.remove('hidden');
    } else {
        showToast('Trailer unavailable');
    }
};

window.closeVideoPlayer = function() {
    DOM.videoModal.classList.add('hidden');
    DOM.videoPlaceholder.innerHTML = ''; 
};

// =========================================
// 9. HELPER FUNCTIONS
// =========================================

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function updateFavCount() {
    const count = state.favorites.length;
    DOM.favCountBadge.textContent = count;
    DOM.favCountBadge.classList.toggle('hidden', count === 0);
}

function showToast(msg) {
    DOM.toastMessage.textContent = msg;
    DOM.toast.classList.remove('hidden');
    setTimeout(() => { DOM.toast.classList.add('hidden'); }, 3000);
}

function getSortedByRecency(items) {
    return items.slice().sort((a, b) => b.originalRowIndex - a.originalRowIndex);
}

function resetFilters() {
    DOM.listingFilters.container.querySelectorAll('select').forEach(s => s.value = '');
    state.listing.filters = { language: '', year: '', genre: '', subtitle: '', sort: 'latest' };
}

function populateFilterOptions(typeFilter = null) {
    const years = new Set();
    const languages = new Set();
    const genres = new Set();

    const items = typeFilter 
        ? state.allContent.filter(i => i.type === typeFilter)
        : state.allContent;

    items.forEach(item => {
        if (item.year && item.year !== 'N/A') years.add(item.year);
        if (item.language) languages.add(item.language);
        item.genre.forEach(g => genres.add(g));
    });

    const populate = (id, set, desc = false) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const opts = Array.from(set).sort();
        if (desc) opts.reverse();
        
        const label = sel.options[0];
        sel.innerHTML = '';
        sel.appendChild(label);
        
        opts.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            sel.appendChild(opt);
        });
    };

    populate('filter-year', years, true);
    populate('filter-language', languages);
    populate('filter-genre', genres);
}

// =========================================
// 10. INITIALIZATION
// =========================================

function initApp() {
    updateFavCount();
    setupEventListeners();
    renderHomeRows();
    handleHashChange(); 
    
    DOM.loadingScreen.classList.add('hidden');
}

function setupEventListeners() {
    window.addEventListener('hashchange', handleHashChange);
    
    DOM.navLinks.forEach(link => link.addEventListener('click', (e) => {
        const page = e.target.dataset.page;
        navigateTo(page);
    }));
    DOM.mobileNavLinks.forEach(link => link.addEventListener('click', (e) => {
        const page = e.target.dataset.page;
        navigateTo(page);
        DOM.mobileMenu.classList.add('hidden');
    }));
    
    DOM.searchInput.addEventListener('input', performSearch);
    DOM.clearSearchBtn.addEventListener('click', () => {
        DOM.searchInput.value = '';
        DOM.searchCountBadge.classList.add('hidden');
        DOM.clearSearchBtn.classList.add('hidden');
        window.history.back(); 
    });

    DOM.closeDetailBtn.addEventListener('click', () => { 
        DOM.detailModal.classList.add('hidden'); 
        document.body.style.overflow = ''; 
    });
    DOM.closeVideoBtn.addEventListener('click', closeVideoPlayer);
    
    DOM.mobileMenuBtn.addEventListener('click', () => DOM.mobileMenu.classList.toggle('hidden'));

    const f = DOM.listingFilters;
    ['type', 'language', 'year', 'genre', 'subtitle', 'sort'].forEach(key => {
        if(f[key]) f[key].addEventListener('change', (e) => {
            if(key === 'type') {
                state.listing.currentFilterType = e.target.value;
                populateFilterOptions(e.target.value || null);
            } else {
                state.listing.filters[key] = e.target.value;
            }
            state.listing.currentPage = 1;
            updateListingView();
        });
    });
    if (f.clearBtn) f.clearBtn.addEventListener('click', () => {
        resetFilters();
        state.listing.currentPage = 1;
        updateListingView();
    });
}

function renderHomeRows() {
    // 1. Determine Hero Banner (Priority: Config > Random)
    state.heroItems = [];
    let promoText = '';

    if (state.configData['banner']) {
        const bannerConfig = state.configData['banner'];
        promoText = bannerConfig.description; 
        state.heroItems = getItemsFromConfig(bannerConfig);
    }

    if (state.heroItems.length === 0) {
        const highRated = state.allContent.filter(i => i.imdb >= 7.0 && i.posterUrl.startsWith('http'));
        state.heroItems = highRated.sort(() => 0.5 - Math.random()).slice(0, 8);
    }
    
    // 2. Render Slider
    if (state.heroItems.length > 0) {
        renderHeroSlides(promoText);
        setInterval(() => {
            let next = state.currentSlideIndex + 1;
            if (next >= state.heroItems.length) next = 0;
            goToHeroSlide(next);
        }, 5000);
    }
    
    // 3. Render Content Rows
    DOM.contentRows.innerHTML = '';
    
    const recentMovies = getSortedByRecency(state.allContent.filter(i => i.type === 'Movie'));
    if(recentMovies.length) createRow('Recently Added Movies', recentMovies, 'movies');
    
    const recentTV = getSortedByRecency(state.allContent.filter(i => i.type === 'TV Show'));
    if(recentTV.length) createRow('Recently Added TV Shows', recentTV, 'tv');
    
    // Config rows
    Object.keys(state.configData).forEach(key => {
        if(key.startsWith('row_')) {
            const cfg = state.configData[key];
            const items = getItemsFromConfig(cfg);
            if(items.length) createRow(cfg.description, items);
        }
    });
}

function createRow(title, items, navTarget = null) {
    const ROW_LIMIT = 12;
    const displayItems = items.slice(0, ROW_LIMIT);
    
    let sliderHTML = displayItems.map(item => createCardHTML(item)).join('');
    
    if (items.length > ROW_LIMIT) {
        sliderHTML += `
            <div class="see-more-card" onclick="openListingFromRow('${title}', '${navTarget}')">
                <i class="fa-solid fa-arrow-right"></i>
                <span>See All</span>
            </div>`;
    }

    const div = document.createElement('div');
    div.innerHTML = `
        <div class="category-row">
            <h3 class="row-header">${title}</h3>
            <div class="row-slider">${sliderHTML}</div>
        </div>
    `;
    DOM.contentRows.appendChild(div.firstElementChild);
}

function openListingFromRow(title, navTarget) {
    if (navTarget) navigateTo(navTarget);
    else {
        const configKey = Object.keys(state.configData).find(k => state.configData[k].description === title);
        let items = [];
        if (configKey) items = getItemsFromConfig(state.configData[configKey]);
        else items = state.allContent; 
        
        navigateTo('listing-custom', { title, items });
    }
}

// Hero Logic helpers
function renderHeroSlides(promoText = '') {
    DOM.heroWrapper.innerHTML = '';
    const bgContainer = document.createElement('div');
    bgContainer.className = 'hero-bg-container';
    
    state.heroItems.forEach((item, i) => {
        const d = document.createElement('div');
        d.className = `hero-bg-slide ${i===0 ? 'active' : ''}`;
        d.style.backgroundImage = `url('${item.posterUrl}')`;
        bgContainer.appendChild(d);
    });
    
    const staticLayer = document.createElement('div');
    staticLayer.className = 'hero-static-layer';
    
    let ribbonHTML = promoText ? `<div class="promo-ribbon">${promoText}</div>` : '';

    staticLayer.innerHTML = `
        ${ribbonHTML}
        <div class="hero-content-wrapper">
             <div class="hero-content" id="hero-dynamic-text"></div>
             <div class="hero-dots" id="hero-dots-container"></div>
        </div>
    `;
    
    DOM.heroWrapper.appendChild(bgContainer);
    DOM.heroWrapper.appendChild(staticLayer);
    
    const dotsContainer = document.getElementById('hero-dots-container');
    state.heroItems.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = `dot ${i===0 ? 'active' : ''}`;
        dot.onclick = () => goToHeroSlide(i);
        dotsContainer.appendChild(dot);
    });
    
    updateHeroText(0);
}

function goToHeroSlide(index) {
    const slides = document.querySelectorAll('.hero-bg-slide');
    const dots = document.querySelectorAll('.dot');
    
    if(slides[state.currentSlideIndex]) {
        slides[state.currentSlideIndex].classList.remove('active');
        slides[state.currentSlideIndex].classList.add('last-active');
        dots[state.currentSlideIndex].classList.remove('active');
    }
    
    state.currentSlideIndex = index;
    slides[index].classList.remove('last-active');
    slides[index].classList.add('active');
    dots[index].classList.add('active');
    updateHeroText(index);
}

function updateHeroText(index) {
    const item = state.heroItems[index];
    const el = document.getElementById('hero-dynamic-text');
    if(!el) return;
    
    el.classList.remove('fade-in');
    void el.offsetWidth; 
    el.classList.add('fade-in');
    
    el.innerHTML = `
        <h1 class="hero-title">${item.title}</h1>
        <div class="hero-meta">
            <span class="imdb-score" style="color:#f5c518; font-weight:700">★ ${item.imdb}</span>
            <span>${item.year}</span>
            <span class="meta-badge">${item.type}</span>
        </div>
        <p class="hero-desc">${item.synopsis}</p>
        <div class="hero-actions">
            <button class="primary-btn" onclick="openVideoPlayer('${item.trailerUrl}')"><i class="fa-solid fa-play"></i> Trailer</button>
            <button class="secondary-btn" onclick="openDetailModal('${item.id}')"><i class="fa-solid fa-info-circle"></i> Info</button>
        </div>
    `;
}

function getItemsFromConfig(config) {
    let items = [...state.allContent];
    if (config.list && config.list.length) items = config.list.map(t => items.find(i => i.title === t)).filter(i => i);
    else {
        if (config.type) items = items.filter(i => i.type.toLowerCase() === config.type);
        if (config.language) items = items.filter(i => i.language.includes(config.language));
        if (config.genre) items = items.filter(i => i.genre.some(g => g.includes(config.genre)));
    }
    return items;
}

document.addEventListener('DOMContentLoaded', () => {
    loadAllContent();
});
