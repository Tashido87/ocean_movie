/**
 * ShowCase - Netflix-style Catalog App with Gemini AI
 * Updated: Restored Detail Modal features (Episodes, Cast, Related)
 */

'use strict';

// =========================================
// 1. CONFIGURATION & STATE
// =========================================

const CONFIG = {
    SPREADSHEET_ID: '1R4wubVoX0rjs8Xuu_7vwQ487e4X1ES-OlER0JgSZwjQ', 
    API_KEY: 'AIzaSyAe26yWs-xvvTROq6HZ4bEKWbObMqSSHms', // Google Sheets API
    // ⚠️ SECURITY WARNING: In a real production app, never expose your AI API key in client-side code.
    GEMINI_API_KEY: 'AIzaSyCkz0TcxSj5s_vVTWrNCYLPyyhMDp3r680', 
    SHEETS: { MOVIES: 'Movies', TV: 'TV_Shows' },
    IMAGE_BASE_URL: 'https://image.tmdb.org/t/p/w500', 
    PLACEHOLDER_IMG: 'https://placehold.co/300x450/333/white?text=No+Poster'
};

const state = {
    allContent: [],
    favorites: JSON.parse(localStorage.getItem('showcase_favorites')) || [],
    currentView: 'home', 
    isLoading: true,
    sliderInterval: null,
    currentSlideIndex: 0,
    heroItems: [], 
    useAiSearch: true
};

const DOM = {
    app: document.getElementById('app'),
    header: document.getElementById('main-header'),
    logo: document.querySelector('.logo'),
    mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    mobileMenu: document.getElementById('mobile-menu'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    navLinks: document.querySelectorAll('[data-page]'),
    
    loadingScreen: document.getElementById('loading-screen'),
    homeView: document.getElementById('home-view'),
    searchView: document.getElementById('search-view'),
    favoritesView: document.getElementById('favorites-view'),
    
    // Hero & Content
    heroWrapper: document.getElementById('hero-wrapper'),
    customBannerTitle: document.getElementById('custom-banner-title'),
    contentRows: document.getElementById('content-rows'),
    searchResultsGrid: document.getElementById('search-results-grid'),
    favoritesGrid: document.getElementById('favorites-grid'),
    searchCount: document.getElementById('search-count'),
    favCountBadge: document.getElementById('fav-count-badge'),
    aiStatusMsg: document.getElementById('ai-status-msg'),
    
    // Detail Modal
    detailModal: document.getElementById('detail-modal'),
    modalBody: document.getElementById('modal-body-content'),
    closeDetailBtn: document.getElementById('close-detail-modal'),
    
    // Video Modal
    videoModal: document.getElementById('video-modal'),
    videoPlaceholder: document.getElementById('youtube-player-placeholder'),
    closeVideoBtn: document.getElementById('close-video-modal'),
    
    // Grid Modal (See All)
    gridModal: document.getElementById('grid-modal'),
    gridModalTitle: document.getElementById('grid-modal-title'),
    gridModalBody: document.getElementById('grid-modal-body'),
    closeGridModalBtn: document.getElementById('close-grid-modal'),

    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message')
};

// =========================================
// 2. DATA FETCHING (Sheets + Gemini)
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

// GEMINI API CALLER
async function callGeminiAPI(promptText) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    const payload = { contents: [{ parts: [{ text: promptText }] }] };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if(data.candidates && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        } else {
            throw new Error("No response from AI");
        }
    } catch (error) {
        console.error("Gemini Error:", error);
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

        const isValidRow = (row) => (row[0] && row[0].trim() !== '') || (row[1] && row[1].trim() !== '');

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
            return {
                id: generateId(row[0]),
                title: row[0] || 'Untitled',
                year: row[1] || 'N/A',
                language: row[2] || 'Unknown',
                genre: row[3] ? row[3].split(',').map(g => g.trim()) : [],
                synopsis: row[4] || '',
                cast: row[5] ? row[5].split(',').map(c => c.trim()) : [],
                imdb: row[6] === 'N/A' ? 0 : parseFloat(row[6]) || 0,
                posterUrl: processPosterUrl(row[7]),
                trailerUrl: row[8] || '',
                episodes: (type === 'TV Show' && row[9]) ? row[9].split('\n').filter(s => s.trim() !== '') : [],
                subtitle: isBurmese ? 'Burmese Subtitle' : 'English Subtitle',
                director: directorName,
                type: type,
                originalRowIndex: 0 // Will set below for sorting
            };
        };

        const movies = moviesRaw.slice(1).filter(isValidRow).map((row, idx) => {
            let m = parseRow(row, 'Movie'); m.originalRowIndex = idx; return m;
        });
        const tvShows = tvShowsRaw.slice(1).filter(isValidRow).map((row, idx) => {
            let t = parseRow(row, 'TV Show'); t.originalRowIndex = idx; return t;
        });

        state.allContent = [...movies, ...tvShows];
        
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
// 3. UI RENDERING & HERO SLIDER
// =========================================

function initApp() {
    DOM.loadingScreen.classList.add('hidden');
    DOM.homeView.classList.remove('hidden');
    updateFavCount();
    setupHeroSlider();
    renderHomeRows();
}

function setupHeroSlider() {
    const adminConfig = JSON.parse(localStorage.getItem('ocean_header_config'));
    
    if (adminConfig && adminConfig.items && adminConfig.items.length > 0) {
        state.heroItems = adminConfig.items
            .map(id => state.allContent.find(x => x.id === id))
            .filter(x => x !== undefined);
            
        if(adminConfig.bannerTitle) {
            DOM.customBannerTitle.textContent = adminConfig.bannerTitle;
            DOM.customBannerTitle.style.display = 'block';
        }
    } else {
        const highRated = state.allContent.filter(item => item.imdb > 7.0 && item.posterUrl.startsWith('http'));
        state.heroItems = highRated.sort(() => 0.5 - Math.random()).slice(0, 6);
    }

    renderHeroSlides();
    startSliderInterval();
}

function renderHeroSlides() {
    DOM.heroWrapper.innerHTML = '';
    state.heroItems.forEach((item, index) => {
        const slide = document.createElement('div');
        // Initial state: First one active, others off to the side (handled by CSS now)
        slide.className = `hero-slide ${index === 0 ? 'active' : ''}`;
        slide.style.backgroundImage = `linear-gradient(to top, #141414, transparent 50%), linear-gradient(to right, rgba(0,0,0,0.8) 0%, transparent 80%), url('${item.posterUrl}')`;
        
        slide.innerHTML = `
            <div class="hero-overlay">
                <div class="hero-content">
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
                </div>
            </div>
        `;
        DOM.heroWrapper.appendChild(slide);
    });

    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'hero-dots';
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
    DOM.heroWrapper.appendChild(dotsContainer);
}

function goToSlide(index) {
    const slides = document.querySelectorAll('.hero-slide');
    const dots = document.querySelectorAll('.dot');
    
    // Manage Slider Classes for Transition
    // 1. Mark the current (outgoing) slide as 'last-active' so it stays visible underneath
    if (slides[state.currentSlideIndex]) {
        slides[state.currentSlideIndex].classList.remove('active');
        slides[state.currentSlideIndex].classList.add('last-active');
        
        // Clean up 'last-active' after transition to keep DOM clean
        const oldIndex = state.currentSlideIndex;
        setTimeout(() => {
            if(slides[oldIndex]) slides[oldIndex].classList.remove('last-active');
        }, 800); // Match CSS transition time
    }
    
    if (dots[state.currentSlideIndex]) {
        dots[state.currentSlideIndex].classList.remove('active');
    }
    
    // 2. Set new index
    state.currentSlideIndex = index;
    
    // 3. Activate new slide (Slides in from right due to CSS)
    if (slides[state.currentSlideIndex]) {
        slides[state.currentSlideIndex].classList.remove('last-active'); // Ensure it's not marked as outgoing
        slides[state.currentSlideIndex].classList.add('active');
    }
    
    if (dots[state.currentSlideIndex]) {
        dots[state.currentSlideIndex].classList.add('active');
    }
}

function startSliderInterval() {
    if (state.sliderInterval) clearInterval(state.sliderInterval);
    state.sliderInterval = setInterval(() => {
        let next = state.currentSlideIndex + 1;
        if (next >= state.heroItems.length) next = 0;
        goToSlide(next);
    }, 4000); // Increased slightly for better reading time
}

function renderHomeRows() {
    DOM.contentRows.innerHTML = '';
    const sortedByRecency = [...state.allContent].sort((a, b) => b.originalRowIndex - a.originalRowIndex);

    const categories = [
        { title: 'Recently Added', items: sortedByRecency },
        { title: 'Trending Movies', items: state.allContent.filter(i => i.type === 'Movie' && i.imdb >= 7.0) },
        { title: 'TV Shows', items: state.allContent.filter(i => i.type === 'TV Show') },
        { title: 'Action & Thriller', items: state.allContent.filter(i => i.genre.some(g => g.includes('Action') || g.includes('Thriller'))) },
        { title: 'Comedy', items: state.allContent.filter(i => i.genre.some(g => g.includes('Comedy'))) },
        { title: 'Sci-Fi & Fantasy', items: state.allContent.filter(i => i.genre.some(g => g.includes('Sci-Fi') || g.includes('Fantasy'))) },
        { title: 'Top Rated', items: state.allContent.filter(i => i.imdb >= 8.0) }
    ];

    categories.forEach(cat => {
        if (cat.items.length > 0) createRow(cat.title, cat.items);
    });
}

function createRow(title, items) {
    const ROW_LIMIT = 10;
    const displayItems = items.slice(0, ROW_LIMIT);
    const hasMore = items.length > ROW_LIMIT;
    
    const rowDiv = document.createElement('div');
    rowDiv.className = 'category-row';
    
    let sliderHTML = displayItems.map(item => createCardHTML(item)).join('');
    
    if (hasMore) {
        sliderHTML += `
            <div class="see-more-card" onclick="openGridModal('${title}')">
                <i class="fa-solid fa-arrow-right"></i>
                <span>See All</span>
            </div>
        `;
    }

    rowDiv.innerHTML = `<h3 class="row-header">${title}</h3><div class="row-slider">${sliderHTML}</div>`;
    DOM.contentRows.appendChild(rowDiv);
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

// =========================================
// 4. SEARCH & FILTERING (AI POWERED)
// =========================================

const performSearch = debounce(async () => {
    const query = DOM.searchInput.value.trim();
    if (!query) {
        if (state.currentView === 'search') navigateTo('home');
        return;
    }

    navigateTo('search');
    DOM.clearSearchBtn.classList.remove('hidden');
    DOM.searchResultsGrid.innerHTML = '<div class="spinner"></div>';
    DOM.aiStatusMsg.textContent = "AI is selecting relevant titles...";

    try {
        const contentContext = state.allContent.map(i => `${i.id}|${i.title}|${i.genre.join(',')}|${i.synopsis.substring(0,50)}`).join('\n');
        
        // Updated Prompt to emphasize AI Choice/Relevance
        const prompt = `
            Task: You are an intelligent movie curator.
            User Query: "${query}" (Language could be English or Burmese/Myanmar).
            
            Database:
            ${contentContext}
            
            Instructions:
            1. Select the most RELEVANT movies/tv shows from the database that match the user's intent.
            2. If the user asks for "good" or "best" movies, prioritize high IMDB scores or popular items.
            3. Return ONLY a JSON array of IDs. Example: ["id1", "id2"].
        `;

        const aiResponseText = await callGeminiAPI(prompt);
        const jsonStr = aiResponseText.replace(/```json|```/g, '').trim();
        const matchedIds = JSON.parse(jsonStr);

        const results = matchedIds
            .map(id => state.allContent.find(item => item.id === id))
            .filter(item => item !== undefined);

        renderGrid(DOM.searchResultsGrid, results);
        DOM.searchCount.textContent = `(${results.length})`;
        DOM.aiStatusMsg.textContent = `Gemini AI selected ${results.length} relevant titles.`;

    } catch (e) {
        console.error("AI Search Failed, falling back to basic filter", e);
        DOM.aiStatusMsg.textContent = "AI unavailable. Showing basic keyword matches.";
        const lowerQ = query.toLowerCase();
        const results = state.allContent.filter(item => 
            item.title.toLowerCase().includes(lowerQ) || 
            item.genre.some(g => g.toLowerCase().includes(lowerQ))
        );
        renderGrid(DOM.searchResultsGrid, results);
    }
}, 800); 

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function renderGrid(container, items) {
    container.innerHTML = '';
    if (items.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No matches found.</p></div>`;
        return;
    }
    items.forEach(item => {
        const div = document.createElement('div');
        div.innerHTML = createCardHTML(item);
        container.appendChild(div.firstElementChild); 
    });
}

// =========================================
// 5. MODALS & INTERACTIONS (RESTORED FULL LOGIC)
// =========================================

// Helper for clickable cast links in modal
window.searchByCast = function(name) {
    DOM.detailModal.classList.add('hidden');
    document.body.style.overflow = '';
    DOM.searchInput.value = name;
    performSearch(); // Triggers the AI search with the name
    navigateTo('search');
};

window.openDetailModal = function(id) {
    DOM.detailModal.scrollTop = 0;

    const item = state.allContent.find(i => i.id === id);
    if (!item) return;

    const isFav = state.favorites.includes(item.id);
    
    // 1. Restore Cast Links
    const castHTML = item.cast.length > 0 
        ? item.cast.map(actor => 
            `<span class="cast-link" onclick="searchByCast('${actor.replace(/'/g, "\\'")}')">${actor}</span>`
          ).join(', ')
        : 'N/A';

    // 2. Restore Director Links
    const directorHTML = item.director 
        ? `<span class="cast-link" onclick="searchByCast('${item.director.replace(/'/g, "\\'")}')">${item.director}</span>`
        : 'N/A';

    // 3. Restore Episodes
    let episodesHTML = '';
    if (item.type === 'TV Show' && item.episodes && item.episodes.length > 0) {
        const badges = item.episodes.map(e => `<div class="episode-badge">${e}</div>`).join('');
        episodesHTML = `
            <div class="episodes-container">
                <h3 class="episodes-header">Seasons & Episodes</h3>
                <div class="episodes-grid">${badges}</div>
            </div>`;
    }

    // 4. Restore Related Items (More Like This)
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

    // 5. Restore Play Button
    let playButtonHTML = '';
    if (item.trailerUrl) {
        playButtonHTML = `
            <button class="primary-btn" onclick="openVideoPlayer('${item.trailerUrl}')">
                <i class="fa-solid fa-play"></i> Play Trailer
            </button>`;
    }

    // 6. Assemble Full Modal
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

// "See More" Grid Modal
window.openGridModal = function(categoryTitle) {
    DOM.gridModalTitle.textContent = categoryTitle;
    DOM.gridModalBody.innerHTML = '';
    
    let items = [];
    if(categoryTitle === 'Recently Added') items = [...state.allContent].sort((a, b) => b.originalRowIndex - a.originalRowIndex);
    else if(categoryTitle === 'Trending Movies') items = state.allContent.filter(i => i.type === 'Movie' && i.imdb >= 7.0);
    else if(categoryTitle === 'TV Shows') items = state.allContent.filter(i => i.type === 'TV Show');
    else if(categoryTitle === 'Top Rated') items = state.allContent.filter(i => i.imdb >= 8.0);
    else {
        items = state.allContent.filter(i => i.genre.some(g => categoryTitle.includes(g)));
    }

    const limitedItems = items.slice(0, 20);
    renderGrid(DOM.gridModalBody, limitedItems);
    DOM.gridModal.classList.remove('hidden');
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

window.openVideoPlayer = function(url) {
    if (!url) { showToast('Trailer not available'); return; }
    
    // Extract ID
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
    setTimeout(() => {
        DOM.toast.classList.add('hidden');
    }, 3000);
}

// =========================================
// 6. NAVIGATION
// =========================================

function navigateTo(pageName) {
    state.currentView = pageName;
    DOM.homeView.classList.add('hidden');
    DOM.searchView.classList.add('hidden');
    DOM.favoritesView.classList.add('hidden');
    DOM.mobileMenu.classList.add('hidden');
    
    if(pageName === 'home') DOM.homeView.classList.remove('hidden');
    if(pageName === 'search') DOM.searchView.classList.remove('hidden');
    if(pageName === 'favorites') {
        DOM.favoritesView.classList.remove('hidden');
        loadFavoritesPage();
    }
    window.scrollTo(0, 0);
}

function loadFavoritesPage() {
    const items = state.allContent.filter(i => state.favorites.includes(i.id));
    renderGrid(DOM.favoritesGrid, items);
}

// =========================================
// 7. INITIALIZATION
// =========================================

document.addEventListener('DOMContentLoaded', () => {
    if(DOM.homeView) {
        loadAllContent();
        DOM.searchInput.addEventListener('input', performSearch);
        DOM.clearSearchBtn.addEventListener('click', () => {
            DOM.searchInput.value = '';
            navigateTo('home');
        });
        
        DOM.navLinks.forEach(link => {
            link.addEventListener('click', (e) => navigateTo(e.target.dataset.page));
        });
        
        DOM.closeDetailBtn.addEventListener('click', () => { DOM.detailModal.classList.add('hidden'); document.body.style.overflow = ''; });
        DOM.closeVideoBtn.addEventListener('click', window.closeVideoPlayer);
        DOM.closeGridModalBtn.addEventListener('click', () => { DOM.gridModal.classList.add('hidden'); document.body.style.overflow = ''; });

        DOM.mobileMenuBtn.addEventListener('click', () => DOM.mobileMenu.classList.toggle('hidden'));
    }
});
