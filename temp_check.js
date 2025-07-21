const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Глобальные переменные для системы блокировки
let isBlocked = false;
let blockedSince = null;
let retryTimeout = null;

// Глобальная переменная для retry мониторинга
let retryMonitoringInterval = null;

// Глобальный Set для отслеживания открытых вкладок (используется для retry системы)
let openedVacancyTabs = new Set();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Инициализация базы данных
const dbPath = path.join(__dirname, 'vacancy_links.db');
const db = new sqlite3.Database(dbPath);

// Создание таблицы при запуске
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS vacancy_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        title TEXT,
        status TEXT DEFAULT 'new',
        page_number INTEGER,
        response_status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        responded_at DATETIME
    )`);
    
    // Добавляем новые поля если таблица уже существует
    db.run(`ALTER TABLE vacancy_links ADD COLUMN response_status TEXT DEFAULT 'pending'`, () => {});
    db.run(`ALTER TABLE vacancy_links ADD COLUMN responded_at DATETIME`, () => {});
    db.run(`ALTER TABLE vacancy_links ADD COLUMN is_being_tested INTEGER DEFAULT 0`, () => {});
console.log('test');
