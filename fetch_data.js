const fs = require('fs');

// YOUR CONFIGURATION
const SPREADSHEET_ID = '1R4wubVoX0rjs8Xuu_7vwQ487e4X1ES-OlER0JgSZwjQ';
const API_KEY = 'AIzaSyAe26yWs-xvvTROq6HZ4bEKWbObMqSSHms'; // Your REAL API Key

async function fetchSheet(sheetName) {
    // 1. Fetch data from Google API
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheetName}?key=${API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch ${sheetName}: ${response.statusText}`);
    }

    const json = await response.json();
    return json.values || [];
}

async function run() {
    try {
        console.log("🌊 Connecting to Google Sheets...");
        
        // 2. Download tabs in parallel (Removed 'Cast')
        const [movies, tv, config] = await Promise.all([
            fetchSheet('Movies'),
            fetchSheet('TV_Shows'),
            fetchSheet('Config')
        ]);

        console.log(`✅ Downloaded ${movies.length} Movies`);
        console.log(`✅ Downloaded ${tv.length} TV Shows`);

        // 3. Structure the data
        const data = {
            movies: movies,
            tv: tv,
            config: config,
            updatedAt: new Date().toISOString()
        };

        // 4. Save to content.json
        fs.writeFileSync('content.json', JSON.stringify(data));
        console.log("🎉 Success! Real data saved to 'content.json'");

    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

run();
