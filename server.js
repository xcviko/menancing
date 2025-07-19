const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Главная страница с UI
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Menancing Parser Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: #4CAF50;
        }
        .stat-label {
            color: #666;
            margin-top: 5px;
        }
        .progress-bar {
            width: 100%;
            height: 20px;
            background: #e0e0e0;
            border-radius: 10px;
            overflow: hidden;
            margin: 10px 0;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4CAF50, #45a049);
            transition: width 0.3s ease;
        }
        .controls {
            text-align: center;
            margin-bottom: 20px;
        }
        .btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            margin: 0 10px;
            transition: background 0.3s;
        }
        .btn:hover {
            background: #45a049;
        }
        .btn-danger {
            background: #f44336;
        }
        .btn-danger:hover {
            background: #da190b;
        }
        .links-table {
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
        }
        .link-title {
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .loading {
            text-align: center;
            padding: 20px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Menancing Parser Dashboard</h1>
        <p>Мониторинг парсинга вакансий с hh.ru</p>
    </div>

    <div class="stats">
        <div class="stat-card">
            <div class="stat-number" id="totalLinks">-</div>
            <div class="stat-label">Всего ссылок</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="targetLinks">300</div>
            <div class="stat-label">Цель</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="remainingLinks">-</div>
            <div class="stat-label">Осталось</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="progressPercent">-</div>
            <div class="stat-label">Прогресс</div>
        </div>
    </div>

    <div class="progress-bar">
        <div class="progress-fill" id="progressBar" style="width: 0%"></div>
    </div>

    <div class="controls">
        <button class="btn" onclick="refreshData()">🔄 Обновить</button>
        <button class="btn btn-danger" onclick="clearDatabase()">🗑️ Очистить базу</button>
    </div>

    <div class="links-table">
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Название вакансии</th>
                    <th>Страница</th>
                    <th>Дата добавления</th>
                </tr>
            </thead>
            <tbody id="linksTableBody">
                <tr>
                    <td colspan="4" class="loading">Загрузка...</td>
                </tr>
            </tbody>
        </table>
    </div>

    <script>
        async function fetchStats() {
            try {
                const response = await fetch('/api/stats');
                const stats = await response.json();
                
                document.getElementById('totalLinks').textContent = stats.total;
                document.getElementById('remainingLinks').textContent = stats.remaining;
                document.getElementById('progressPercent').textContent = stats.progress + '%';
                document.getElementById('progressBar').style.width = stats.progress + '%';
                
                return stats;
            } catch (error) {
                console.error('Ошибка загрузки статистики:', error);
            }
        }

        async function fetchLinks() {
            try {
                const response = await fetch('/api/links');
                const data = await response.json();
                
                const tbody = document.getElementById('linksTableBody');
                
                if (data.links.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="loading">Нет данных</td></tr>';
                    return;
                }
                
                tbody.innerHTML = data.links.map((link, index) => \`
                    <tr>
                        <td>\${index + 1}</td>
                        <td class="link-title" title="\${link.title || 'Без названия'}">\${link.title || 'Без названия'}</td>
                        <td>\${link.page_number !== null ? 'Стр. ' + (link.page_number + 1) : '-'}</td>
                        <td>\${new Date(link.created_at).toLocaleString('ru-RU')}</td>
                    </tr>
                \`).join('');
            } catch (error) {
                console.error('Ошибка загрузки ссылок:', error);
            }
        }

        async function clearDatabase() {
            if (!confirm('Вы уверены, что хотите очистить всю базу данных?')) {
                return;
            }
            
            try {
                const response = await fetch('/api/links', { method: 'DELETE' });
                const result = await response.json();
                
                if (result.success) {
                    alert('База данных очищена!');
                    refreshData();
                } else {
                    alert('Ошибка очистки базы данных');
                }
            } catch (error) {
                console.error('Ошибка очистки базы:', error);
                alert('Ошибка очистки базы данных');
            }
        }

        async function refreshData() {
            await Promise.all([fetchStats(), fetchLinks()]);
        }

        // Автообновление каждые 5 секунд
        setInterval(refreshData, 5000);
        
        // Загрузка при открытии страницы
        refreshData();
    </script>
</body>
</html>
    `);
});

// Добавление ссылок
app.post('/api/links', (req, res) => {
    const { links, pageNumber } = req.body;
    
    if (!Array.isArray(links) || links.length === 0) {
        return res.status(400).json({ error: 'Массив ссылок не может быть пустым' });
    }

    let inserted = 0;
    let duplicates = 0;
    
    const stmt = db.prepare(`INSERT OR IGNORE INTO vacancy_links (url, title, page_number) VALUES (?, ?, ?)`);
    
    links.forEach(link => {
        const result = stmt.run(link.url, link.title || null, pageNumber || null);
        if (result.changes > 0) {
            inserted++;
        } else {
            duplicates++;
        }
    });
    
    stmt.finalize();
    
    res.json({
        success: true,
        inserted,
        duplicates,
        total: links.length,
        message: `Добавлено ${inserted} новых ссылок, пропущено ${duplicates} дубликатов`
    });
});

// Получение всех ссылок
app.get('/api/links', (req, res) => {
    db.all(`SELECT * FROM vacancy_links ORDER BY created_at DESC`, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ links: rows });
    });
});

// Статистика
app.get('/api/stats', (req, res) => {
    db.get(`SELECT COUNT(*) as total FROM vacancy_links`, (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const total = row.total;
        const progress = Math.min((total / 300) * 100, 100);
        const remaining = Math.max(300 - total, 0);
        
        res.json({
            total,
            target: 300,
            remaining,
            progress: Math.round(progress),
            completed: total >= 300
        });
    });
});

// Очистка базы
app.delete('/api/links', (req, res) => {
    db.run(`DELETE FROM vacancy_links`, (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'База данных очищена' });
    });
});

// Обработка закрытия приложения
process.on('SIGINT', () => {
    console.log('\nЗакрытие базы данных...');
    db.close();
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`🚀 Menancing Server запущен на порту ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`💾 База данных: ${dbPath}`);
});