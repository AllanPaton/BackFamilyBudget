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
                   type VARCHAR(40) NOT NULL,
                   sum NUMERIC(100),
                   note VARCHAR(255),
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
	const userId = req.userId;

	try {
		// Общий счет
		const totalBalanceQuery = `
      SELECT SUM(sum) 
      FROM userdata 
      WHERE date_part('month', date) = $1
      AND user_id = $2;
    `;
		const totalBalanceResult = await pool.query(totalBalanceQuery, [month, userId]);
		const totalBalance = parseFloat(totalBalanceResult.rows[0].sum || 0).toFixed(2);

		// Сумма исходящих переводов
		const outcomeQuery = `
      SELECT SUM(sum) 
      FROM userdata 
      WHERE date_part('month', date) = $1 
      AND sum < 0
      AND user_id = $2;
    `;
		const outcomeResult = await pool.query(outcomeQuery, [month, userId]);
		const outcome = parseFloat(outcomeResult.rows[0].sum || 0).toFixed(2);

		// Сумма входящих переводов
		const incomeQuery = `
      SELECT SUM(sum) 
      FROM userdata 
      WHERE date_part('month', date) = $1 
      AND sum > 0
      AND user_id = $2;
    `;
		const incomeResult = await pool.query(incomeQuery, [month, userId]);
		const income = parseFloat(incomeResult.rows[0].sum || 0).toFixed(2);

		console.log(`sending header{ total:${totalBalance}, outcome:${outcome}, income:${income}} to ${userId}`);
		res.json({ totalBalance, outcome, income });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Internal server error' });
	}
});

//ДАТА(входящие переводы за месяц) для графика
app.get('/api/protected/userdata/areachart', cors(), authMiddleware, async (req, res) => {
	const month = parseInt(req.query.month);
	const userId = req.userId;

	try {
		const incomeQuery = `
      SELECT date, sum, note 
      FROM userdata 
      WHERE date_part('month', date) = $1 AND sum > 0
      AND user_id = $2;
    `;
		const incomeResult = await pool.query(incomeQuery, [month, userId]);

		console.log(`sending chartArea data to ${req.userId}`);
		res.json(incomeResult.rows);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.get('/api/protected/userdata/piechart', cors(), authMiddleware, async (req, res) => {
	const month = parseInt(req.query.month);
	const userId = req.userId;

	try {
		const incomeQuery = `
      SELECT date, sum, type 
      FROM userdata 
      WHERE date_part('month', date) = $1
      AND user_id = $2;
    `;
		const incomeResult = await pool.query(incomeQuery, [month, userId]);

		console.log(`sending pieChart data to ${req.userId}`);
		res.json(incomeResult.rows); // Отправляем массив объектов
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Internal server error' });
	}
});


app.post('/api/protected/userdata/add', authMiddleware, async (req, res) => {
	console.log('Raw request body:', req.body); // Логируем сырой запрос

	const { sum, type, note, date } = req.body;

	console.log('Parsed data:', { sum, type, note, date }); // Логируем разобранные данные

	try {
		if (!sum || !type || !note || !date) {
			return res.status(400).json({ error: 'Missing required data' });
		}

		const userId = req.userId;
		const result = await pool.query(
			'INSERT INTO userdata (user_id, sum, type, note, date) VALUES ($1, $2, $3, $4, $5)',
			[userId, sum, type, note, date]
		);

		console.log(`${userId} added content successfully`);
		res.status(201).json({ message: 'Transaction created successfully' });
	} catch (err) {
		console.error('Error creating transaction:', err);
		res.status(500).json({ error: 'Internal server error' });
	}
});


//Запрос на редактирование бд
app.put('/api/protected/userdata/update/:id', authMiddleware, async (req, res) => {
	const transactionId = parseInt(req.params.id);
	const { sum, type, note, date } = req.body;

	const safeNote = note || '';
	try {
		if (transactionId === -1) {
			// --- Create a NEW transaction ---
			const userId = req.userId;
			const createQuery = 'INSERT INTO userdata (user_id, sum, type, note, date) VALUES ($1, $2, $3, $4, $5) RETURNING *';
			const createValues = [userId, sum, type, note, date];

			const createResult = await pool.query(createQuery, createValues);
			const newTransaction = createResult.rows[0];

			console.log(`${userId} created transaction ${newTransaction.id}`);
			res.status(201).json(newTransaction);

		} else if (!isNaN(transactionId) && transactionId > 0) {
		// --- Update an EXISTING transaction ---
		const userId = req.userId;

		const updateQuery = 'UPDATE userdata SET sum = $1, type = $2, note = $3, date = $4 WHERE id = $5 AND user_id = $6';
		const updateValues = [sum, type, note, date, transactionId, userId];

		const updateResult = await pool.query(updateQuery, updateValues);

		if (updateResult.rowCount === 0) {
			return res.status(404).json({
				error: 'Transaction not found or you are not authorized to update it',
			});
		}

		console.log(`${userId} updated transaction ${transactionId}`);
		res.json({ message: 'Transaction updated successfully' });
	} else {
		// --- Invalid ID ---
		return res.status(400).json({ error: 'Invalid transaction ID' });
	}
	} catch (err) {
		console.error('Error updating/creating transaction:', err);
		res.status(500).json({ error: 'Internal server error' });
}
});