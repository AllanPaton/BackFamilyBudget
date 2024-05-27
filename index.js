const express = require('express');
const { Pool } = require('pg');
const app = express();
const port = 8081;

const authController = require('./src/authController');
const authMiddleware = require('./src/authMiddleware');


//Подключение к базе данных
const pool = new Pool({
	user: 'postgres',
	host: 'localhost',
	database: 'postgres',
	password: 'postgres',
	port: 5432,
});

app.use(express.json());

async function createUsersTable() {
	try {
		const query = `
            CREATE TABLE IF NOT EXISTS users (
              id SERIAL PRIMARY KEY,
              login VARCHAR(255) UNIQUE NOT NULL,
              password VARCHAR(255) NOT NULL
            );
          `;

		await pool.query(query);
		console.log('users table created');
	} catch (err) {
		console.error(err);
		console.error('users table creation failed');
	}
}

async function createUserdataTable() {
	try {
		const query = `
            CREATE TABLE IF NOT EXISTS userdata (
              id SERIAL PRIMARY KEY,
              user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
              date DATE NOT NULL,
              sum NUMERIC(100),
              note VARCHAR(255) NOT NULL
            );
          `;

		await pool.query(query);
		console.log('userdata table created');
	} catch (err) {
		console.error(err);
		console.error('userdata table creation failed');
	}
}

app.get('/', (req, res) => {
	res.send('Server works successfully')
})


// Маршрутизация
app.use('/api/auth', authController); // Обработка запросов /api/auth
app.post('/users', async (req, res) => { // Обработка запросов POST /users
	try {
		const { login, password } = req.body;

		const insertUserQuery = `INSERT INTO users (login, password) VALUES ($1, $2) RETURNING id;`;
		const insertedUserId = await pool.query(insertUserQuery, [login, password]);

		res.json({ message: 'User created successfully', userId: insertedUserId.rows[0].id });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to create user' });
	}
});

// Запуск сервера
app.listen(port, () => {
	console.log(`Server listening on port ${port}`);

	// Создание таблиц при запуске сервера
	createUsersTable()
		.then(() => createUserdataTable())
		.then(() => console.log('Tables created successfully!'))
		.catch(err => console.error('Error creating tables:', err));
});

