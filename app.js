const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const port = 3000;

// Use JSON file for database
const file = path.join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const db = new Low(adapter, {});

let fixtureData = {}; // Dinamik fikstür verisi için önbellek

// Read data from db.json, or initialize if not found
async function initializeDb() {
    await db.read();
    db.data = db.data || { posts: [] };
    await db.write();
}
initializeDb();

// Configure session middleware
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    if (!req.session.isAdmin) {
        return res.redirect('/admin/login');
    }
    next();
};

// Set EJS as the templating engine
const engine = require('ejs-mate');
app.engine('ejs', engine);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files (CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse request bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Helper to generate a unique ID
const generateUniqueId = () => crypto.randomBytes(16).toString('hex');

// -------------------- ROUTES --------------------

// Home page
app.get('/', async (req, res) => {
    await db.read();
    res.render('index', { posts: db.data.posts });
});

// Post detail
app.get('/post/:id', async (req, res) => {
    await db.read();
    const post = db.data.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).send('Post not found');
    res.render('post_access', { post: post });
});

// Verify access
app.post('/verify-access', async (req, res) => {
    await db.read();
    const { postId, accessCode } = req.body;
    const post = db.data.posts.find(p => p.id === postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    if (post.accessCode === accessCode) {
        res.json({ success: true, redirectUrl: `/content/${postId}` });
    } else {
        res.json({ success: false, message: 'Invalid access code.' });
    }
});

// Full content
app.get('/content/:id', async (req, res) => {
    await db.read();
    const post = db.data.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).send('Post not found');
    res.render('post_content', { post: post });
});

// Admin login
app.get('/admin/login', (req, res) => {
    res.render('admin_login', { message: null });
});

app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'adminpass') {
        req.session.isAdmin = true;
        res.redirect('/admin/dashboard');
    } else {
        res.render('admin_login', { message: 'Invalid credentials' });
    }
});

// Admin Dashboard
app.get('/admin/dashboard', requireAdmin, async (req, res) => {
    await db.read();
    res.render('admin_dashboard', { posts: db.data.posts });
});

app.get('/admin/new-post', requireAdmin, (req, res) => {
    res.render('admin_new_post');
});

app.post('/admin/new-post', requireAdmin, async (req, res) => {
    const { title, thumbnailUrl, accessCode, content } = req.body;
    const newPost = {
        id: generateUniqueId(),
        title,
        thumbnailUrl,
        accessCode,
        content,
        createdAt: new Date()
    };
    await db.read();
    db.data.posts.push(newPost);
    await db.write();
    res.redirect('/admin/dashboard');
});

app.get('/admin/edit-post/:id', requireAdmin, async (req, res) => {
    await db.read();
    const post = db.data.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).send('Post not found');
    res.render('admin_edit_post', { post: post });
});

app.post('/admin/edit-post/:id', requireAdmin, async (req, res) => {
    const { title, thumbnailUrl, accessCode, content } = req.body;
    await db.read();
    const postIndex = db.data.posts.findIndex(p => p.id === req.params.id);
    if (postIndex > -1) {
        db.data.posts[postIndex] = { ...db.data.posts[postIndex], title, thumbnailUrl, accessCode, content };
        await db.write();
    }
    res.redirect('/admin/dashboard');
});

app.post('/admin/delete-post/:id', requireAdmin, async (req, res) => {
    await db.read();
    db.data.posts = db.data.posts.filter(p => p.id !== req.params.id);
    await db.write();
    res.redirect('/admin/dashboard');
});

// Fixture Table HTML
app.get('/fixture-table', (req, res) => {
    res.sendFile(path.join(__dirname, 'fixture-table.html'));
});

// -------------------- FİKSTÜR API --------------------

app.get('/fixtures', async (req, res) => {
    const teamUrl = req.query.url;
    if (!teamUrl) {
        return res.status(400).json({ error: 'Takım URL’si gerekli.' });
    }

    if (!fixtureData[teamUrl]) {
        await scrapeFixtureData(teamUrl);
    }

    res.json(fixtureData[teamUrl] || []);
});

async function scrapeFixtureData(teamUrl) {
    try {
        const response = await axios.get(teamUrl);
        const $ = cheerio.load(response.data);

        const teamFixtures = [];
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

                // Diagnostic logs to understand HTML structure
                console.log("👉 td:nth-child(3) HTML:");
                console.log($(row).find('td:nth-child(3)').html());

                console.log("👉 td:nth-child(7) HTML:");
                console.log($(row).find('td:nth-child(7)').html());

                console.log("📌 td:nth-child(3) a[href]:", $(row).find('td:nth-child(3) a[href]').attr('href'));
                console.log("📌 td:nth-child(7) a[href]:", $(row).find('td:nth-child(7) a[href]').attr('href'));

                const homeLink = $(row).find('td:nth-child(3) a[href]').attr('href');
                const awayLink = $(row).find('td:nth-child(7) a[href]').attr('href');

                if (!global.allTeamLinks) global.allTeamLinks = new Map();
                if (homeLink) global.allTeamLinks.set(homeTeam, `${homeLink}`);
                if (awayLink) global.allTeamLinks.set(awayTeam, `${awayLink}`);

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

        fixtureData[teamUrl] = teamFixtures;
        // JSON olarak allTeamLinks'i kaydet (tek dosyada)
        const fs = require('fs');
        const teamLinksJson = {};

        // Var olan dosya varsa, onu oku
        const existingPath = path.join(__dirname, 'team-links.json');
        if (fs.existsSync(existingPath)) {
            try {
                const existingData = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
                Object.assign(teamLinksJson, existingData);
            } catch (err) {
                console.error("⚠️ Mevcut team-links.json dosyası okunamadı:", err.message);
            }
        }

        // Yeni verileri ekle
        for (const [team, url] of global.allTeamLinks.entries()) {
            teamLinksJson[team] = url;
        }

        // Tek dosyaya kaydet
        const jsonPath = path.join(__dirname, 'team-links.json');
        fs.writeFileSync(jsonPath, JSON.stringify(teamLinksJson, null, 2), 'utf-8');

        console.log(`✅ Fikstür verisi çekildi: ${teamUrl}`);
    } catch (error) {
        console.error(`❌ Fikstür çekme hatası: ${teamUrl}`, error.message);
    }
}

// -------------------- SERVER --------------------

app.listen(port, () => {
    console.log(`Patsi Analiz app running at http://localhost:${port}`);
    console.log(`Admin panel: http://localhost:${port}/admin/dashboard`);
    console.log(`Fixture table: http://localhost:${port}/fixture-table`);
});
