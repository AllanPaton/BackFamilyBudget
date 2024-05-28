//Middleware для обеспечения взаимодействия между различными приложениями, системами, компонентами

const express = require('express');
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
	const token = req.headers.authorization?.split(' ')[1];

	if (!token) {
		return res.status(401).json({ error: 'Unauthorized' });
	}

	try {
		const decodedToken = jwt.verify(token, 'your-secret-key'); // Изменить ключ при деплое
		req.userId = decodedToken.userId;
		next();
	} catch (err) {
		console.error(err);
		res.status(401).json({ error: 'Unauthorized' });
	}

};

module.exports = authMiddleware;