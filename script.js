/**
 * ShowCase - Netflix-style Catalog App
 * Updated: Increased Banner/Hero slider limit from 5/6 to 10 items.
 */

'use strict';

// =========================================
// 1. CONFIGURATION & STATE
// =========================================

const CONFIG = {
    SPREADSHEET_ID: '1R4wubVoX0rjs8Xuu_7vwQ487e4X1ES-OlER0JgSZwjQ', 
    API_KEY: 'AIzaSyAe26yWs-xvvTROq6HZ4bEKWbObMqSSHms', // Google Sheets API Key
    
    SHEETS: { MOVIES: 'Movies', TV: 'TV_Shows', CONFIG: 'Config' },
    
    IMAGE_BASE_URL: 'https://image.tmdb.org/t/p/w500', 
    PLACEHOLDER_IMG: 'https://placehold.co/300x450/333/white?text=No+Poster',
    
    ITEMS_PER_PAGE: 30, // Supports 5 full rows on Desktop
    PAGINATION_GROUP_SIZE: 5
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
    
    // Listing / Search State
    listing: {
        activeItems: [],
        currentPage: 1,
        currentFilterType: '', 
        searchQuery: '',
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
    clearSearchBtn: document.getElementById('clear-search-btn'),
    navLinks: document.querySelectorAll('[data-page]'),
    mobileNavLinks: document.querySelectorAll('.mobile-nav-links li'),
    loadingScreen: document.getElementById('loading-screen'),
    
    // Views
    homeView: document.getElementById('home-view'),
    searchView: document.getElementById('search-view'),
    favoritesView: document.getElementById('favorites-view'),
    listingView: document.getElementById('listing-view'),
    
    // Hero & Content
    heroWrapper: document.getElementById('hero-wrapper'),
    contentRows: document.getElementById('content-rows'),
    favoritesGrid: document.getElementById('favorites-grid'),
    favCountBadge: document.getElementById('fav-count-badge'),
    
    // Listing View Elements
    listingTitle: document.getElementById('listing-title'),
    listingGrid: document.getElementById('listing-grid'),
    listingPagination: document.getElementById('listing-pagination'),
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
    gridModal: document.getElementById('grid-modal'),
    gridModalTitle: document.getElementById('grid-modal-title'),
    gridModalBody: document.getElementById('grid-modal-body'),
    closeGridModalBtn: document.getElementById('close-grid-modal'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message')
};

// =========================================
// 2. DATA FETCHING
// =========================================

async function fetchSheetData(sheetName) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${sheetName}?key=${CONFIG.API_KEY}`;
    try {
        const response = await fetch(url);
        if (!response.ok && sheetName === CONFIG.SHEETS.CONFIG) return [];
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return data.values || [];
    } catch (error) {
        console.error(`Error fetching ${sheetName}:`, error);
        return [];
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
        const [moviesRaw, tvShowsRaw, configRaw] = await Promise.all([
            fetchSheetData(CONFIG.SHEETS.MOVIES),
            fetchSheetData(CONFIG.SHEETS.TV),
            fetchSheetData(CONFIG.SHEETS.CONFIG)
        ]);

        const isValidRow = (row) => (row[0] && row[0].trim() !== '') || (row[1] && row[1].trim() !== '');

        const parseRow = (row, type) => {
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
                genre: row[3] ? row[3].split(',').map(g => g.trim()).filter(g => g) : [],
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
                originalRowIndex: 0 
            };
        };

        const movies = moviesRaw.slice(1).filter(isValidRow).map((row, idx) => {
            let m = parseRow(row, 'Movie'); m.originalRowIndex = idx; return m;
        });
        const tvShows = tvShowsRaw.slice(1).filter(isValidRow).map((row, idx) => {
            let t = parseRow(row, 'TV Show'); t.originalRowIndex = idx; return t;
        });

        state.allContent = [...movies, ...tvShows];

        if (configRaw && configRaw.length > 1) {
            configRaw.slice(1).forEach(row => {
                const key = row[0] ? row[0].trim() : null;
                const desc = row[1] ? row[1].trim() : null;
                const listRaw = row[2];
                const lang = row[3];
                const genre = row[4];
                const sort = row[5];
                const type = row[6];
                const platform = row[7];

                const hasCondition = (listRaw || lang || genre || sort || type || platform);

                if (key && desc && hasCondition) {
                    state.configData[key] = {
                        description: desc,
                        list: listRaw ? listRaw.split(',').map(t => t.trim()).filter(t => t) : [],
                        language: lang ? lang.trim() : '',
                        genre: genre ? genre.trim() : '',
                        sort: sort ? sort.trim().toLowerCase() : 'random',
                        type: type ? type.trim().toLowerCase() : '',
                        platform: platform ? platform.trim() : '' 
                    };
                }
            });
        }

        populateFilterOptions(); 
        if(DOM.homeView) initApp();
    } catch (error) {
        console.error(error);
        if(DOM.loadingScreen) DOM.loadingScreen.innerHTML = '<p>Error loading data. Check console.</p>';
    }
}

function generateId(title) {
    if (!title) return Math.random().toString(36).substr(2, 9);
    return title.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

// =========================================
// 3. HELPER FUNCTIONS
// =========================================

function normalizeStr(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getSortedByRecency(items) {
    const movies = items.filter(i => i.type === 'Movie').sort((a, b) => b.originalRowIndex - a.originalRowIndex);
    const tv = items.filter(i => i.type === 'TV Show').sort((a, b) => b.originalRowIndex - a.originalRowIndex);

    if (movies.length === 0) return tv;
    if (tv.length === 0) return movies;

    const combined = [];
    const max = Math.max(movies.length, tv.length);
    for (let i = 0; i < max; i++) {
        if (i < movies.length) combined.push(movies[i]);
        if (i < tv.length) combined.push(tv[i]);
    }
    return combined;
}

function getItemsFromConfig(config) {
    let items = [...state.allContent];

    if (config.list && config.list.length > 0) {
        return config.list.map(title => items.find(i => i.title.toLowerCase() === title.toLowerCase())).filter(item => item !== undefined);
    }

    if (config.type) {
        if (config.type.includes('tv')) items = items.filter(i => i.type === 'TV Show');
        else if (config.type.includes('movie')) items = items.filter(i => i.type === 'Movie');
    }

    if (config.language) {
        const langTarget = config.language.toLowerCase();
        items = items.filter(i => i.language.toLowerCase().includes(langTarget));
    }

    if (config.genre) {
        const genreTarget = config.genre.toLowerCase();
        items = items.filter(i => i.genre.some(g => g.toLowerCase().includes(genreTarget)));
    }

    if (config.platform) {
        const target = normalizeStr(config.platform);
        items = items.filter(i => {
            if (!i.streaming) return false;
            const current = normalizeStr(i.streaming);
            return current.includes(target) || target.includes(current); 
        });
    }

    if (config.sort === 'latest') {
        items = getSortedByRecency(items);
    } else {
        items.sort(() => 0.5 - Math.random());
    }

    return items;
}

// =========================================
// 4. UI RENDERING & FILTER LOGIC
// =========================================

function initApp() {
    DOM.loadingScreen.classList.add('hidden');
    DOM.homeView.classList.remove('hidden');
    updateFavCount();
    
    setupHeroSlider();
    renderHomeRows();
    setupFilterEventListeners();
}

function populateFilterOptions() {
    const years = new Set();
    const languages = new Set();
    const genres = new Set();

    if (!state.allContent || state.allContent.length === 0) return;

    state.allContent.forEach(item => {
        if (item.year && item.year !== 'N/A' && item.year.trim() !== '') years.add(item.year.trim());
        if (item.language && item.language !== 'Unknown' && item.language.trim() !== '') languages.add(item.language.trim());
        if (item.genre && Array.isArray(item.genre)) {
            item.genre.forEach(g => { if(g && g.trim() !== '') genres.add(g.trim()); });
        }
    });

    const populate = (elementId, values, sortDesc = false) => {
        const select = document.getElementById(elementId);
        if(!select) return;
        const labelOption = select.firstElementChild;
        select.innerHTML = '';
        if(labelOption) select.appendChild(labelOption);

        const array = Array.from(values);
        if (sortDesc) {
            array.sort((a, b) => {
                const numA = parseInt(a);
                const numB = parseInt(b);
                if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
                return b.localeCompare(a);
            });
        } else {
            array.sort((a, b) => a.localeCompare(b));
        }

        array.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            select.appendChild(opt);
        });
    };

    populate('filter-year', years, true);
    populate('filter-language', languages);
    populate('filter-genre', genres);
}

function setupFilterEventListeners() {
    const f = DOM.listingFilters;
    if(!f.container) return;

    ['type', 'language', 'year', 'genre', 'subtitle', 'sort'].forEach(key => {
        if(f[key]) {
            f[key].addEventListener('change', (e) => {
                state.listing.filters[key] = e.target.value;
                state.listing.currentPage = 1; 
                updateListingView();
            });
        }
    });

    if(f.clearBtn) {
        f.clearBtn.addEventListener('click', () => {
            resetFilters();
            state.listing.currentPage = 1;
            updateListingView();
        });
    }
}

function resetFilters() {
    const f = DOM.listingFilters;
    state.listing.filters = {
        language: '',
        year: '',
        genre: '',
        subtitle: '',
        sort: 'latest'
    };
    if(f.language) f.language.value = '';
    if(f.year) f.year.value = '';
    if(f.genre) f.genre.value = '';
    if(f.subtitle) f.subtitle.value = '';
    if(f.sort) f.sort.value = 'latest';
}

function setupHeroSlider() {
    let heroItems = [];
    let promoText = '';

    if (state.configData['banner']) {
        const bannerConfig = state.configData['banner'];
        promoText = bannerConfig.description; 
        heroItems = getItemsFromConfig(bannerConfig);
    }
    
    if (heroItems.length === 0) {
        const highRated = state.allContent.filter(item => item.imdb > 7.0 && item.posterUrl.startsWith('http'));
        // UPDATED: Increased limit to 10
        heroItems = highRated.sort(() => 0.5 - Math.random()).slice(0, 10);
    }

    // UPDATED: Allow up to 10 items in the state
    state.heroItems = heroItems.slice(0, 10);
    renderHeroSlides(promoText);
    startSliderInterval();
}

function renderHeroSlides(promoText) {
    DOM.heroWrapper.innerHTML = '';
    const bgContainer = document.createElement('div');
    bgContainer.className = 'hero-bg-container';

    state.heroItems.forEach((item, index) => {
        const slide = document.createElement('div');
        slide.className = `hero-bg-slide ${index === 0 ? 'active' : ''}`;
        slide.style.backgroundImage = `linear-gradient(to top, #141414 5%, transparent 60%), linear-gradient(to right, rgba(0,0,0,0.8) 0%, transparent 80%), url('${item.posterUrl}')`;
        bgContainer.appendChild(slide);
    });

    const staticContent = document.createElement('div');
    staticContent.className = 'hero-static-layer';
    let ribbonHTML = promoText ? `<div class="promo-ribbon">${promoText}</div>` : '';

    staticContent.innerHTML = `
        ${ribbonHTML}
        <div class="hero-content-wrapper">
             <div class="hero-content" id="hero-dynamic-text"></div>
             <div class="hero-dots" id="hero-dots-container"></div>
        </div>
    `;

    DOM.heroWrapper.appendChild(bgContainer);
    DOM.heroWrapper.appendChild(staticContent);

    const dotsContainer = document.getElementById('hero-dots-container');
    state.heroItems.forEach((_, index) => {
        const dot = document.createElement('div');
        dot.className = `dot ${index === 0 ? 'active' : ''}`;
        dot.onclick = () => {
            clearInterval(state.sliderInterval);
            goToSlide(index);
            startSliderInterval();
        };
        dotsContainer.appendChild(dot);
    });

    updateHeroText(0);
}

function updateHeroText(index) {
    const item = state.heroItems[index];
    const textContainer = document.getElementById('hero-dynamic-text');
    if (!item || !textContainer) return;

    textContainer.classList.remove('fade-in');
    void textContainer.offsetWidth; 
    textContainer.classList.add('fade-in');

    textContainer.innerHTML = `
        <h1 class="hero-title">${item.title}</h1>
        <div class="hero-meta">
            <span class="imdb-score">IMDB ${item.imdb || 'N/A'}</span>
            <span>${item.year}</span>
            <span class="meta-badge">${item.type}</span>
            <span class="meta-badge subtitle-badge">${item.subtitle}</span>
        </div>
        <p class="hero-desc">${item.synopsis}</p>
        <div class="hero-actions">
            <button class="primary-btn" onclick="openVideoPlayer('${item.trailerUrl}')">
                <i class="fa-solid fa-play"></i> Trailer
            </button>
            <button class="secondary-btn" onclick="openDetailModal('${item.id}')">
                <i class="fa-solid fa-circle-info"></i> Info
            </button>
        </div>
    `;
}

function goToSlide(index) {
    const slides = document.querySelectorAll('.hero-bg-slide');
    const dots = document.querySelectorAll('.dot');
    
    if (slides[state.currentSlideIndex]) {
        slides[state.currentSlideIndex].classList.remove('active');
        slides[state.currentSlideIndex].classList.add('last-active');
        const oldIndex = state.currentSlideIndex;
        setTimeout(() => {
            if(slides[oldIndex]) slides[oldIndex].classList.remove('last-active');
        }, 800); 
    }
    if (dots[state.currentSlideIndex]) dots[state.currentSlideIndex].classList.remove('active');
    
    state.currentSlideIndex = index;
    if (slides[state.currentSlideIndex]) {
        slides[state.currentSlideIndex].classList.remove('last-active');
        slides[state.currentSlideIndex].classList.add('active');
    }
    if (dots[state.currentSlideIndex]) dots[state.currentSlideIndex].classList.add('active');
    updateHeroText(index);
}

function startSliderInterval() {
    if (state.sliderInterval) clearInterval(state.sliderInterval);
    state.sliderInterval = setInterval(() => {
        let next = state.currentSlideIndex + 1;
        if (next >= state.heroItems.length) next = 0;
        goToSlide(next);
    }, 5000); 
}

function renderHomeRows() {
    DOM.contentRows.innerHTML = '';
    
    // 1. Recently Added Movies (Newest First)
    const recentMovies = state.allContent
        .filter(item => item.type === 'Movie')
        .sort((a, b) => b.originalRowIndex - a.originalRowIndex);
        
    if (recentMovies.length > 0) {
        createRow('Recently Added Movies', recentMovies);
    }

    // 2. Recently Added TV Shows (Newest First)
    const recentTV = state.allContent
        .filter(item => item.type === 'TV Show')
        .sort((a, b) => b.originalRowIndex - a.originalRowIndex);

    if (recentTV.length > 0) {
        createRow('Recently Added TV Shows', recentTV);
    }

    // 3. Config Rows
    for(let i=1; i<=20; i++) {
        const key = `row_${i}`;
        if (state.configData[key]) {
            const rowConfig = state.configData[key];
            const items = getItemsFromConfig(rowConfig);
            if (items.length > 0) createRow(rowConfig.description, items);
        }
    }
}

function createRow(title, items) {
    const html = createRowHTML(title, items);
    const div = document.createElement('div');
    div.innerHTML = html;
    DOM.contentRows.appendChild(div.firstElementChild);
}

function createRowHTML(title, items) {
    const ROW_LIMIT = 10;
    const displayItems = items.slice(0, ROW_LIMIT);
    const hasMore = items.length > ROW_LIMIT;
    
    let sliderHTML = displayItems.map(item => createCardHTML(item)).join('');
    
    if (hasMore) {
        sliderHTML += `
            <div class="see-more-card" onclick="openListingFromRow('${title.replace(/'/g, "\\'")}')">
                <i class="fa-solid fa-arrow-right"></i>
                <span>See All</span>
            </div>
        `;
    }

    return `
        <div class="category-row">
            <h3 class="row-header">${title}</h3>
            <div class="row-slider">${sliderHTML}</div>
        </div>
    `;
}

function createCardHTML(item) {
    return `
        <div class="movie-card" onclick="openDetailModal('${item.id}')">
            <img src="${item.posterUrl}" alt="${item.title}" loading="lazy" onerror="this.src='${CONFIG.PLACEHOLDER_IMG}'">
            <div class="card-overlay">
                <div class="card-title">${item.title}</div>
                <div class="card-meta">
                    <span>${item.year}</span>
                    <span><i class="fa-solid fa-star" style="color: gold;"></i> ${item.imdb}</span>
                </div>
            </div>
        </div>
    `;
}

function openListingFromRow(title) {
    // Redirect "Recently Added" clicks to their respective main pages
    if (title === 'Recently Added Movies') {
        navigateTo('movies'); 
        return;
    }
    if (title === 'Recently Added TV Shows') {
        navigateTo('tv'); 
        return;
    }

    const configKey = Object.keys(state.configData).find(key => state.configData[key].description === title);
    
    if (configKey) {
        const cfg = state.configData[configKey];
        resetFilters();
        state.listing.currentFilterType = ''; 
        if(cfg.type === 'movie') state.listing.currentFilterType = 'Movie';
        if(cfg.type === 'tv show') state.listing.currentFilterType = 'TV Show';
        if(cfg.genre) state.listing.filters.genre = cfg.genre;
        
        const items = getItemsFromConfig(cfg);
        navigateTo('listing-custom', { title: title, items: items });
    } else {
        resetFilters();
        state.listing.currentFilterType = '';
        state.listing.filters.genre = title; 
        navigateTo('listing-mixed'); 
    }
}

// =========================================
// 5. MAIN LISTING VIEW UPDATE
// =========================================

function updateListingView(customItems = null) {
    let items = [];

    if (customItems) {
        items = customItems;
    } else {
        // Start with all content
        items = state.allContent;

        // 1. Filter by Type
        if (state.listing.currentFilterType) {
            items = items.filter(i => i.type === state.listing.currentFilterType);
        }

        // 2. Filter by Search Query
        if (state.listing.searchQuery) {
            const q = state.listing.searchQuery.toLowerCase();
            items = items.filter(i => 
                i.title.toLowerCase().includes(q) || 
                i.cast.some(c => c.toLowerCase().includes(q)) ||
                (i.director && i.director.toLowerCase().includes(q)) ||
                i.genre.some(g => g.toLowerCase().includes(q))
            );
        }

        // 3. Dropdown Filters
        const f = state.listing.filters;
        if (f.language) items = items.filter(i => i.language === f.language);
        if (f.year) items = items.filter(i => i.year === f.year);
        if (f.genre) items = items.filter(i => i.genre.includes(f.genre));
        if (f.subtitle) items = items.filter(i => i.subtitle.includes(f.subtitle));

        // 4. Sort
        if (f.sort === 'latest') {
            items = getSortedByRecency(items);
        } else if (f.sort === 'year') {
            items.sort((a, b) => parseInt(b.year) - parseInt(a.year));
        } else if (f.sort === 'title') {
            items.sort((a, b) => a.title.localeCompare(b.title));
        }
    }

    state.listing.activeItems = items;
    renderListingGrid();
    renderPagination();
}

function renderListingGrid() {
    DOM.listingGrid.innerHTML = '';
    
    if (state.listing.activeItems.length === 0) {
        DOM.listingGrid.innerHTML = `<div class="empty-state"><p>No results found.</p></div>`;
        return;
    }

    const start = (state.listing.currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
    const end = start + CONFIG.ITEMS_PER_PAGE;
    const pageItems = state.listing.activeItems.slice(start, end);

    pageItems.forEach(item => {
        const div = document.createElement('div');
        div.innerHTML = createCardHTML(item);
        DOM.listingGrid.appendChild(div.firstElementChild);
    });
    
    window.scrollTo(0, 0);
}

function renderPagination() {
    const container = DOM.listingPagination;
    container.innerHTML = '';
    
    const totalItems = state.listing.activeItems.length;
    const totalPages = Math.ceil(totalItems / CONFIG.ITEMS_PER_PAGE);
    
    if (totalPages <= 1) return;

    const current = state.listing.currentPage;
    const groupSize = CONFIG.PAGINATION_GROUP_SIZE;
    
    const currentGroup = Math.ceil(current / groupSize);
    const startPage = (currentGroup - 1) * groupSize + 1;
    let endPage = startPage + groupSize - 1;
    if (endPage > totalPages) endPage = totalPages;

    if (startPage > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'page-btn';
        prevBtn.innerHTML = '<i class="fa-solid fa-angle-double-left"></i>';
        prevBtn.onclick = () => {
            state.listing.currentPage = startPage - 1;
            renderListingGrid();
            renderPagination();
        };
        container.appendChild(prevBtn);
    }

    for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${i === current ? 'active' : ''}`;
        btn.textContent = i;
        btn.onclick = () => {
            state.listing.currentPage = i;
            renderListingGrid();
            renderPagination();
        };
        container.appendChild(btn);
    }

    if (endPage < totalPages) {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'page-btn';
        nextBtn.innerHTML = '<i class="fa-solid fa-angle-double-right"></i>';
        nextBtn.onclick = () => {
            state.listing.currentPage = endPage + 1;
            renderListingGrid();
            renderPagination();
        };
        container.appendChild(nextBtn);
    }
}

// =========================================
// 6. SEARCH & INTERACTIONS
// =========================================

const performSearch = debounce(() => {
    const query = DOM.searchInput.value.toLowerCase().trim();
    if (!query) {
        if (state.currentView === 'listing-mixed' || state.currentView === 'search-results') {
            navigateTo('home');
        }
        return;
    }
    state.listing.searchQuery = query;
    state.listing.currentFilterType = '';
    resetFilters();
    navigateTo('search-results');
    DOM.clearSearchBtn.classList.remove('hidden');
}, 500); 

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

window.searchByCast = function(name) {
    DOM.detailModal.classList.add('hidden');
    document.body.style.overflow = '';
    DOM.searchInput.value = name;
    performSearch(); 
};

window.openDetailModal = function(id) {
    DOM.detailModal.scrollTop = 0;
    const item = state.allContent.find(i => i.id === id);
    if (!item) return;

    const isFav = state.favorites.includes(item.id);
    const castHTML = item.cast.length > 0 
        ? item.cast.map(actor => `<span class="cast-link" onclick="searchByCast('${actor.replace(/'/g, "\\'")}')">${actor}</span>`).join(', ')
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
        other.id !== item.id && other.genre.some(g => item.genre.includes(g))
    );
    relatedItems = relatedItems.sort(() => 0.5 - Math.random()).slice(0, 6);
    
    let relatedHTML = '';
    if (relatedItems.length > 0) {
        relatedHTML = `
            <div class="related-section">
                <h3 class="episodes-header">More Like This</h3>
                <div class="related-grid">${relatedItems.map(r => createCardHTML(r)).join('')}</div>
            </div>`;
    }

    let playButtonHTML = item.trailerUrl ? `
        <button class="primary-btn" onclick="openVideoPlayer('${item.trailerUrl}')">
            <i class="fa-solid fa-play"></i> Play Trailer
        </button>` : '';

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
            <div class="modal-detail-list"><span>Cast:</span> ${castHTML}</div>
            <div class="modal-detail-list"><span>Director:</span> ${directorHTML}</div>
            <div class="modal-detail-list"><span>Genres:</span> ${item.genre.join(', ')}</div>
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
        if (state.currentView === 'favorites') loadFavoritesPage();
    }
    localStorage.setItem('showcase_favorites', JSON.stringify(state.favorites));
    updateFavCount();
};

window.openVideoPlayer = function(url) {
    if (!url) { showToast('Trailer not available'); return; }
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    const videoId = (match && match[2].length === 11) ? match[2] : null;

    if (videoId) {
        const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
        DOM.videoPlaceholder.innerHTML = `<iframe src="${embedUrl}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        DOM.videoModal.classList.remove('hidden');
    } else {
        showToast('Invalid Trailer URL');
    }
};

window.closeVideoPlayer = function() {
    DOM.videoModal.classList.add('hidden');
    DOM.videoPlaceholder.innerHTML = ''; 
};

function updateFavCount() {
    DOM.favCountBadge.textContent = state.favorites.length;
    DOM.favCountBadge.classList.toggle('hidden', state.favorites.length === 0);
}

function showToast(msg) {
    DOM.toastMessage.textContent = msg;
    DOM.toast.classList.remove('hidden');
    setTimeout(() => { DOM.toast.classList.add('hidden'); }, 3000);
}

// =========================================
// 7. NAVIGATION
// =========================================

function navigateTo(pageName, data = null) {
    state.currentView = pageName;
    DOM.homeView.classList.add('hidden');
    DOM.favoritesView.classList.add('hidden');
    DOM.listingView.classList.add('hidden');
    DOM.mobileMenu.classList.add('hidden');
    
    DOM.navLinks.forEach(link => link.classList.remove('active'));
    DOM.mobileNavLinks.forEach(link => link.classList.remove('active'));
    const activeNav = document.querySelector(`[data-page="${pageName}"]`);
    if(activeNav) activeNav.classList.add('active');

    if (pageName === 'home') {
        DOM.homeView.classList.remove('hidden');
        DOM.searchInput.value = '';
    } 
    else if (pageName === 'movies') {
        DOM.listingView.classList.remove('hidden');
        DOM.listingTitle.textContent = 'Movies';
        resetFilters();
        state.listing.currentFilterType = 'Movie';
        state.listing.searchQuery = '';
        state.listing.currentPage = 1;
        updateListingView();
    }
    else if (pageName === 'tv') {
        DOM.listingView.classList.remove('hidden');
        DOM.listingTitle.textContent = 'TV Shows';
        resetFilters();
        state.listing.currentFilterType = 'TV Show';
        state.listing.searchQuery = '';
        state.listing.currentPage = 1;
        updateListingView();
    }
    else if (pageName === 'listing-mixed' || pageName === 'search-results') {
        DOM.listingView.classList.remove('hidden');
        DOM.listingTitle.textContent = pageName === 'search-results' ? 'Search Results' : 'Browse';
        state.listing.currentPage = 1;
        updateListingView();
    }
    else if (pageName === 'listing-custom') {
        DOM.listingView.classList.remove('hidden');
        DOM.listingTitle.textContent = data.title;
        state.listing.currentPage = 1;
        updateListingView(data.items);
    }
    else if (pageName === 'favorites') {
        DOM.favoritesView.classList.remove('hidden');
        loadFavoritesPage();
    }
    window.scrollTo(0, 0);
}

function loadFavoritesPage() {
    const items = state.allContent.filter(i => state.favorites.includes(i.id));
    const container = DOM.favoritesGrid;
    container.innerHTML = '';
    
    if (items.length === 0) {
        document.getElementById('no-favorites-msg').classList.remove('hidden');
    } else {
        document.getElementById('no-favorites-msg').classList.add('hidden');
        items.forEach(item => {
            const div = document.createElement('div');
            div.innerHTML = createCardHTML(item);
            container.appendChild(div.firstElementChild);
        });
    }
}

// =========================================
// 8. INITIALIZATION
// =========================================

document.addEventListener('DOMContentLoaded', () => {
    if(DOM.homeView) {
        loadAllContent();
        DOM.searchInput.addEventListener('input', performSearch);
        DOM.clearSearchBtn.addEventListener('click', () => {
            DOM.searchInput.value = '';
            state.listing.searchQuery = ''; 
            navigateTo('home');
        });
        
        DOM.navLinks.forEach(link => link.addEventListener('click', (e) => navigateTo(e.target.dataset.page)));
        DOM.mobileNavLinks.forEach(link => link.addEventListener('click', (e) => navigateTo(e.target.dataset.page)));
        
        DOM.closeDetailBtn.addEventListener('click', () => { DOM.detailModal.classList.add('hidden'); document.body.style.overflow = ''; });
        DOM.closeVideoBtn.addEventListener('click', window.closeVideoPlayer);
        DOM.closeGridModalBtn.addEventListener('click', () => { DOM.gridModal.classList.add('hidden'); document.body.style.overflow = ''; });
        DOM.mobileMenuBtn.addEventListener('click', () => DOM.mobileMenu.classList.toggle('hidden'));
    
        const contentRows = document.getElementById('content-rows');
        if (contentRows) {
            contentRows.addEventListener('wheel', (evt) => {
                const slider = evt.target.closest('.row-slider');
                if (slider && slider.scrollWidth > slider.clientWidth) {
                    evt.preventDefault();
                    slider.scrollLeft += evt.deltaY; 
                }
            }, { passive: false });
        }
    }
});
