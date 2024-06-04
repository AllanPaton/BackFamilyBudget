const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
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
		process.exit(1);
	}
}

async function createUserdataTable() {
	try {
		const query = `
            CREATE TABLE IF NOT EXISTS userdata (
                   id SERIAL PRIMARY KEY,
                   user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                   date DATE NOT NULL,
                   type VARCHAR(40),
                   sum NUMERIC(100),
                   note VARCHAR(255) NOT NULL,
                   year INTEGER,
                   month INTEGER,
                   day INTEGER
            );
          `;

		await pool.query(query);
		console.log('userdata table created');
	} catch (err) {
		console.error(err);
		console.error('userdata table creation failed');
		process.exit(1);
	}
}

app.get('/', (req, res) => {
	res.send('Server works successfully')
})

app.use(cors({
	origin: ['http://localhost:3000', 'http://localhost:3001'], //  Допустимые  домены
	methods: ['GET', 'POST', 'PUT', 'DELETE'], //  Допустимые  методы  HTTP
	allowedHeaders: ['Content-Type', 'Authorization'], //  Допустимые  заголовки
}));

// Маршрутизация
app.use('/api/auth', authController); // Обработка запросов /api/auth
app.use(authMiddleware); //прослойка для всех защищенных маршрутов

// Запуск сервера
app.listen(port, () => {
	console.log(`Server listening on port ${port}`);

	// Создание таблиц при запуске сервера
	createUsersTable()
		.then(() => createUserdataTable())
		.then(() => console.log('Tables created successfully!'))
		.catch(err => console.error('Error creating tables:', err));
});

//ДАННЫЕ

app.delete('/api/protected', authMiddleware, async (req, res) => {
	res.json({ message: 'Access to the protected resource is granted.',  userId:  req.userId  });
});

app.get('/api/protected/userdata/all', cors(), authMiddleware, async (req, res) => {
	const month = parseInt(req.query.month);

	if (isNaN(month) || month < 1 || month > 12) {
		return res.status(400).json({ error: 'Invalid month parameter' });
	}

	try {
		const userId = req.userId;
		const query = `
      SELECT * 
      FROM userdata 
      WHERE date_part('month', date) = $2
      AND user_id = $1
      AND sum <> 0
      ORDER BY date DESC;
    `;
		const values = [userId, month];
		const result = await pool.query(query, values);
		res.json(result.rows);
		console.log('sending ALL data to', userId);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Internal server error' });
	}
});

//ДАТА(за месяц) для хедера сайта
app.get('/api/protected/userdata/header', cors(), authMiddleware, async (req, res) => {
	const month = parseInt(req.query.month);

	try {
		const totalBalanceQuery = `SELECT SUM(sum) FROM userdata WHERE date_part('month', date) = $1`; //Общий счет
		const totalBalanceResult = await pool.query(totalBalanceQuery, [month]);
		const totalBalance = parseFloat(totalBalanceResult.rows[0].sum || 0).toFixed(2);

		const outcomeQuery = `SELECT SUM(sum) FROM userdata WHERE date_part('month', date) = $1 AND sum < 0`; //Сумма исходящих переводов
		const outcomeResult = await pool.query(outcomeQuery, [month]);
		const outcome = parseFloat(outcomeResult.rows[0].sum || 0).toFixed(2);

		const incomeQuery = `SELECT SUM(sum) FROM userdata WHERE date_part('month', date) = $1 AND sum > 0`; //Сумма входящих переводов
		const incomeResult = await pool.query(incomeQuery, [month]);
		const income = parseFloat(incomeResult.rows[0].sum || 0).toFixed(2);

		console.log(`sending header{ total:${totalBalance}, outcome:${outcome}, income:${income}} to ${req.userId}`)
		res.json({ totalBalance, outcome, income });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Internal server error' });
	}
});

//ДАТА(входящие переводы за месяц) для графика
app.get('/api/protected/userdata/areachart', cors(), authMiddleware, async (req, res) => {
	const month = parseInt(req.query.month);

	try {
		const incomeQuery = `
      SELECT date, sum, note 
      FROM userdata 
      WHERE date_part('month', date) = $1 AND sum > 0
    `;
		const incomeResult = await pool.query(incomeQuery, [month]);

		console.log(`sending chartArea data to ${req.userId}`);
		res.json(incomeResult.rows); // Отправляем массив объектов
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.get('/api/protected/userdata/piechart', cors(), authMiddleware, async (req, res) => {
	const month = parseInt(req.query.month);

	try {
		const incomeQuery = `
      SELECT date, sum, type 
      FROM userdata 
      WHERE date_part('month', date) = $1
    `;
		const incomeResult = await pool.query(incomeQuery, [month]);

		console.log(`sending pieChart data to ${req.userId}`);
		res.json(incomeResult.rows); // Отправляем массив объектов
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Internal server error' });
	}
});