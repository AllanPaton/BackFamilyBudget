const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

//Подключение к базе данных
const pool = new Pool({
	user: 'postgres',
	host: 'localhost',
	database: 'postgres',
	password: 'postgres',
	port: 5432,
});

const router = express.Router();

router.post('/register', async (req, res) => {
	const { login, password } = req.body;

	console.log('Registration POST:', req.body) //Отслеживание запросов

	if (!login || !password) {
		return res.status(400).send('Login or password missing!');
	}

	try {
		const hashedPassword = await bcrypt.hash(password, 10); //  10  -  количество раундов хэширования

		const insertUserQuery = `INSERT INTO users (login, password) VALUES ($1, $2) RETURNING id;`;
		const insertedUserId = await pool.query(insertUserQuery, [login, hashedPassword]);

		res.json({ message: 'User registered successfully', userId: insertedUserId.rows[0].id });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to register user' });
	}
});

router.post('/login', async (req, res) => {
	const { login, password } = req.body;

	try {
		const selectUserQuery = `SELECT * FROM users WHERE login = $1`;
		const user = await pool.query(selectUserQuery, [login]);

		if (user.rows.length === 0) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}

		const isPasswordValid = await bcrypt.compare(password, user.rows[0].password);

		if (!isPasswordValid) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}

		const token = jwt.sign({ userId: user.rows[0].id }, 'your-secret-key', { expiresIn: '1h' });
		res.json({ token: token });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to login' });
	}
});

module.exports = router;