const cheerio = require('cheerio');
const axios = require('axios');
const express = require('express');
const path = require('path');

const app = express();
const port = 3000;

let fixtureData = {}; // Store fixture data per URL

async function scrapeFixtureData(teamUrl) {
    try {
        const response = await axios.get(teamUrl);
        const $ = cheerio.load(response.data);

        const teamFixtures = []; // Store fixtures for the current teamUrl
        let currentCompetition = '';

        $('#tblFixture tbody tr').each((i, row) => {
            if ($(row).hasClass('competition')) {
                currentCompetition = $(row).find('td:nth-child(1) b a').text().trim();
            } else if ($(row).hasClass('row')) {
                const date = $(row).find('td:nth-child(1)').text().trim();
                const homeTeam = $(row).find('td:nth-child(3) span.team, td:nth-child(3) a').text().trim();
                const score = $(row).find('td:nth-child(5) b a').text().trim().replace(/\s+/g, '');
                const halfTimeScore = $(row).find('td:nth-child(9)').text().trim().replace(/\s+/g, '');
                const awayTeam = $(row).find('td:nth-child(7) span.team, td:nth-child(7) a').text().trim();

                console.log(`Row ${i}: Date='${date}', Home='${homeTeam}', Score='${score}', HalfTime='${halfTimeScore}', Away='${awayTeam}', Competition='${currentCompetition}'`);

                // Function to determine winner from score string (e.g., "2-1")
                const getWinner = (scoreStr) => {
                    const [homeScore, awayScore] = scoreStr.split('-').map(Number);
                    if (homeScore > awayScore) return 'H';
                    if (awayScore > homeScore) return 'A';
                    return 'D'; // Draw
                };

                console.log(`Scraped halfTimeScore: '${halfTimeScore}' for row: ${i}`);

                if (date && homeTeam && score && awayTeam) {
                    teamFixtures.push({
                        date,
                        homeTeam,
                        score,
                        halfTimeScore,
                        awayTeam,
                        competition: currentCompetition
                    });
                }
            }
        });
        fixtureData[teamUrl] = teamFixtures; // Store data with URL as key
        console.log(`Fixture data scraped successfully for ${teamUrl}`);
    } catch (error) {
        console.error(`Error scraping data for ${teamUrl}: ${error}`);
    }
}

// Serve static files from the current directory
app.use(express.static(__dirname));

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Define a route to trigger scraping and serve the data
app.get('/fixtures', async (req, res) => {
    const teamUrl = req.query.url; // Get URL from query parameter
    if (!teamUrl) {
        return res.status(400).json({ error: 'Team URL is required.' });
    }

    if (!fixtureData[teamUrl]) {
        await scrapeFixtureData(teamUrl);
    }
    res.json(fixtureData[teamUrl]);
});

// Start the Express server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Fixture data available at http://localhost:${port}/fixtures`);
});