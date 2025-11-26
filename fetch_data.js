const fs = require('fs');

// 1. CONFIGURATION
const SPREADSHEET_ID = '1R4wubVoX0rjs8Xuu_7vwQ487e4X1ES-OlER0JgSZwjQ';
const API_KEY = process.env.GOOGLE_API_KEY; // We will set this safely in GitHub

async function fetchSheet(sheetName) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheetName}?key=${API_KEY}`;
    const response = await fetch(url);
    const json = await response.json();
    return json.values || [];
}

async function run() {
    try {
        console.log("Fetching data...");
        const [movies, tv, config] = await Promise.all([
            fetchSheet('Movies'),
            fetchSheet('TV_Shows'),
            fetchSheet('Config')
        ]);

        const data = {
            movies: movies,
            tv: tv,
            config: config,
            updatedAt: new Date().toISOString()
        };

        // Save to file
        fs.writeFileSync('content.json', JSON.stringify(data));
        console.log("Data saved to content.json");

    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

run();
