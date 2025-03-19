require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(cors());

// Oppretter MySQL-tilkobling
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// 🔐 Middleware for å sjekke JWT-token
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
        return res.status(403).json({ error: 'Ingen token oppgitt' });
    }
    
    // Ekstraher token fra Bearer format
    const token = authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(403).json({ error: 'Ugyldig token format' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Ugyldig token' });
        }
        req.user = decoded; // Lagrer brukerdata i requesten
        next();
    });
};

// 🔹 Hent alle TODOs (krever innlogging)
app.get('/todos', authenticate, (req, res) => {
    // Sjekk om user_id-kolonnen eksisterer
    pool.query("SHOW COLUMNS FROM todos LIKE 'user_id'", (error, results) => {
        if (error) return res.status(500).json({ error: error.message });
        
        if (results.length === 0) {
            // Hvis user_id-kolonnen ikke finnes, hent alle todos
            pool.query('SELECT * FROM todos', (error, results) => {
                if (error) return res.status(500).json({ error: error.message });
                res.json(results);
            });
        } else {
            // Hvis user_id-kolonnen finnes, hent bare todos for denne brukeren
            pool.query('SELECT * FROM todos WHERE user_id = ?', [req.user.id], (error, results) => {
                if (error) return res.status(500).json({ error: error.message });
                res.json(results);
            });
        }
    });
});

// 🔹 Legg til en ny TODO
app.post('/todos', authenticate, (req, res) => {
    const { title } = req.body;
    
    // Sjekk om user_id-kolonnen eksisterer
    pool.query("SHOW COLUMNS FROM todos LIKE 'user_id'", (error, results) => {
        if (error) return res.status(500).json({ error: error.message });
        
        if (results.length === 0) {
            // Hvis user_id-kolonnen ikke finnes, bruk originalt SQL
            pool.query('INSERT INTO todos (title, completed) VALUES (?, ?)', 
                [title, false], 
                (error, results) => {
                    if (error) return res.status(500).json({ error: error.message });
                    res.json({ id: results.insertId, title: title, completed: false });
                }
            );
        } else {
            // Hvis user_id-kolonnen finnes, inkluder user_id
            pool.query('INSERT INTO todos (title, completed, user_id) VALUES (?, ?, ?)', 
                [title, false, req.user.id], 
                (error, results) => {
                    if (error) return res.status(500).json({ error: error.message });
                    res.json({ id: results.insertId, title: title, completed: false });
                }
            );
        }
    });
});

// 🔹 Oppdater en TODO
app.put('/todos/:id', authenticate, (req, res) => {
    const { id } = req.params;
    const { title, completed } = req.body;
    
    // Sjekk om user_id-kolonnen eksisterer
    pool.query("SHOW COLUMNS FROM todos LIKE 'user_id'", (error, results) => {
        if (error) return res.status(500).json({ error: error.message });
        
        if (results.length === 0) {
            // Hvis user_id-kolonnen ikke finnes, bruk originalt SQL
            pool.query('UPDATE todos SET title = ?, completed = ? WHERE id = ?', 
                [title, completed, id], 
                (error, results) => {
                    if (error) return res.status(500).json({ error: error.message });
                    res.json({ id, title, completed });
                }
            );
        } else {
            // Hvis user_id-kolonnen finnes, inkluder user_id-sjekk
            pool.query('UPDATE todos SET title = ?, completed = ? WHERE id = ? AND user_id = ?', 
                [title, completed, id, req.user.id], 
                (error, results) => {
                    if (error) return res.status(500).json({ error: error.message });
                    if (results.affectedRows === 0) {
                        return res.status(404).json({ error: 'Todo ikke funnet eller tilhører ikke deg' });
                    }
                    res.json({ id, title, completed });
                }
            );
        }
    });
});

// 🔹 Slett en TODO
app.delete('/todos/:id', authenticate, (req, res) => {
    const { id } = req.params;
    
    // Sjekk om user_id-kolonnen eksisterer
    pool.query("SHOW COLUMNS FROM todos LIKE 'user_id'", (error, results) => {
        if (error) return res.status(500).json({ error: error.message });
        
        if (results.length === 0) {
            // Hvis user_id-kolonnen ikke finnes, bruk originalt SQL
            pool.query('DELETE FROM todos WHERE id = ?', 
                [id], 
                (error, results) => {
                    if (error) return res.status(500).json({ error: error.message });
                    res.json({ message: 'Todo slettet' });
                }
            );
        } else {
            // Hvis user_id-kolonnen finnes, inkluder user_id-sjekk
            pool.query('DELETE FROM todos WHERE id = ? AND user_id = ?', 
                [id, req.user.id], 
                (error, results) => {
                    if (error) return res.status(500).json({ error: error.message });
                    if (results.affectedRows === 0) {
                        return res.status(404).json({ error: 'Todo ikke funnet eller tilhører ikke deg' });
                    }
                    res.json({ message: 'Todo slettet' });
                }
            );
        }
    });
});

// 🔹 Registrer ny bruker
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Brukernavn og passord er påkrevd' });
    }

    pool.query('SELECT * FROM users WHERE username = ?', [username], async (error, results) => {
        if (error) return res.status(500).json({ error: error.message });

        if (results.length > 0) {
            return res.status(400).json({ error: 'Brukernavnet er allerede tatt' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        pool.query('INSERT INTO users (username, passord) VALUES (?, ?)', 
            [username, hashedPassword], 
            (error) => {
                if (error) return res.status(500).json({ error: error.message });
                res.json({ message: 'Bruker registrert!' });
            }
        );
    });
});

// 🔹 LOGIN: Sjekker brukernavn og passord, og gir tilbake JWT-token
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Brukernavn og passord må fylles ut' });
    }

    pool.query('SELECT * FROM users WHERE username = ?', [username], async (error, results) => {
        if (error) return res.status(500).json({ error: error.message });

        if (results.length === 0) {
            return res.status(400).json({ error: 'Feil brukernavn eller passord' });
        }

        const user = results[0];

        // Sjekk passordet
        const isMatch = await bcrypt.compare(password, user.passord);
        if (!isMatch) {
            return res.status(400).json({ error: 'Feil brukernavn eller passord' });
        }

        // Generer JWT-token
        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.json({ message: 'Innlogging vellykket!', token });
    });
});

// 🔹 Token refresh
app.post('/refresh-token', authenticate, (req, res) => {
    // Generer ny token
    const newToken = jwt.sign(
        { id: req.user.id, username: req.user.username }, 
        process.env.JWT_SECRET, 
        { expiresIn: '1h' }
    );
    
    res.json({ message: 'Token fornyet', token: newToken });
});

// Automatisk sjekking/oppretting av påkrevde tabeller
app.listen(port, () => {
    console.log(`Serveren kjører på http://localhost:${port}`);
    
    // Sjekk om users-tabellen eksisterer
    pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            passord VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, (error) => {
        if (error) {
            console.error('Feil ved oppretting av users-tabell:', error);
        } else {
            console.log('Users-tabell OK');
        }
    });
    
    // Sjekk om todos-tabellen eksisterer
    pool.query(`
        CREATE TABLE IF NOT EXISTS todos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            completed BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, (error) => {
        if (error) {
            console.error('Feil ved oppretting av todos-tabell:', error);
        } else {
            console.log('Todos-tabell OK');
        }
    });
});