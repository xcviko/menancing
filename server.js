const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Глобальные переменные для системы блокировки
let isBlocked = false;
let blockedSince = null;

// Конфигурация Telegram бота
const TELEGRAM_BOT_TOKEN = '7790802705:AAFZMdSTSlVGukNJPJL6zZMfDhkbOlReY3E';
const TELEGRAM_CHAT_ID = '-1002845507640';

// Функция отправки уведомлений в Telegram
async function sendTelegramNotification(message) {
    try {  
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message
            })
        });
        
        if (response.ok) {
            console.log('✅ Telegram уведомление отправлено');
        } else {
            console.error('❌ Ошибка отправки Telegram уведомления:', response.statusText);
        }
    } catch (error) {
        console.error('❌ Ошибка отправки Telegram уведомления:', error);
    }
}

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
}); // Закрытие db.serialize

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
            color: #2196F3;
            text-decoration: none;
        }
        .link-title:hover {
            color: #1976D2;
            text-decoration: underline;
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

    <div id="blockingBanner" style="display: none; background: #E91E63; color: white; padding: 15px; margin-bottom: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h3 style="margin: 0; font-size: 18px;">🚫 Система заблокирована (403)</h3>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">Автоматические отклики приостановлены. Уведомление отправлено в Telegram.</p>
        <div style="margin-top: 10px;">
            <button class="btn" onclick="clearBlocking()" style="background: white; color: #E91E63;">✅ Снять блокировку вручную</button>
        </div>
    </div>

    <div class="stats">
        <div class="stat-card">
            <div class="stat-number" id="totalLinks">-</div>
            <div class="stat-label">Всего ссылок</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="targetLinks">300</div>
            <div class="stat-label">Цель парсинга</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="remainingLinks">-</div>
            <div class="stat-label">Осталось парсить</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="progressPercent">-</div>
            <div class="stat-label">Прогресс парсинга</div>
        </div>
    </div>

    <div class="stats">
        <div class="stat-card">
            <div class="stat-number" id="pendingResponses" style="color: #FF9800;">-</div>
            <div class="stat-label">Ожидают отклика</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="processingResponses" style="color: #2196F3;">-</div>
            <div class="stat-label">В обработке</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="completedResponses" style="color: #4CAF50;">-</div>
            <div class="stat-label">Откликнулись</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="failedResponses" style="color: #f44336;">-</div>
            <div class="stat-label">Ошибки</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="quizResponses" style="color: #FF5722;">-</div>
            <div class="stat-label">Требует квиз</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="coverLetterResponses" style="color: #9C27B0;">-</div>
            <div class="stat-label">Требует письмо</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="blockedResponses" style="color: #E91E63;">-</div>
            <div class="stat-label">Заблокировано</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="unavailableResponses" style="color: #9E9E9E;">-</div>
            <div class="stat-label">Недоступно</div>
        </div>
    </div>

    <div class="progress-bar">
        <div class="progress-fill" id="responseProgressBar" style="width: 0%; background: linear-gradient(90deg, #FF9800, #4CAF50);"></div>
    </div>

    <div class="progress-bar">
        <div class="progress-fill" id="progressBar" style="width: 0%"></div>
    </div>

    <div class="controls">
        <button class="btn" onclick="refreshData()">🔄 Обновить</button>
        <button class="btn btn-danger" onclick="clearDatabase()">🗑️ Очистить базу</button>
        <button class="btn" onclick="startAutoResponding()" id="startRespondingBtn" style="background: #4CAF50;">🚀 Запустить автоотклики</button>
        <button class="btn btn-danger" onclick="stopAutoResponding()" id="stopRespondingBtn" style="display: none;">⏹️ Остановить отклики</button>
    </div>

    <div class="links-table">
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Название вакансии</th>
                    <th>Страница</th>
                    <th>Статус отклика</th>
                    <th>Дата добавления</th>
                </tr>
            </thead>
            <tbody id="linksTableBody">
                <tr>
                    <td colspan="5" class="loading">Загрузка...</td>
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
                console.error('Ошибка загрузки статистики парсинга:', error);
            }
        }

        async function fetchResponseStats() {
            try {
                const response = await fetch('/api/response-stats');
                const stats = await response.json();
                
                document.getElementById('pendingResponses').textContent = stats.pending;
                document.getElementById('processingResponses').textContent = stats.processing;
                document.getElementById('completedResponses').textContent = stats.completed;
                document.getElementById('failedResponses').textContent = stats.failed;
                document.getElementById('quizResponses').textContent = stats.requires_quiz;
                document.getElementById('coverLetterResponses').textContent = stats.requires_cover_letter;
                document.getElementById('blockedResponses').textContent = stats.blocked_403;
                document.getElementById('unavailableResponses').textContent = stats.unavailable;
                document.getElementById('responseProgressBar').style.width = stats.progress + '%';
                
                // Обновляем кнопку автооткликов
                const startBtn = document.getElementById('startRespondingBtn');
                if (stats.canStartResponding && !isRespondingActive) {
                    startBtn.style.display = 'inline-block';
                    startBtn.textContent = '🚀 Запустить автоотклики (' + stats.pending + ')';
                } else if (!isRespondingActive) {
                    startBtn.style.display = 'none';
                }
                
                return stats;
            } catch (error) {
                console.error('Ошибка загрузки статистики откликов:', error);
            }
        }

        async function fetchLinks() {
            try {
                const response = await fetch('/api/links');
                const data = await response.json();
                
                const tbody = document.getElementById('linksTableBody');
                
                if (data.links.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="loading">Нет данных</td></tr>';
                    return;
                }
                
                tbody.innerHTML = data.links.map((link, index) => {
                    const statusColors = {
                        'pending': '#FF9800',
                        'processing': '#2196F3', 
                        'completed': '#4CAF50',
                        'failed': '#f44336',
                        'requires_quiz': '#FF5722',
                        'requires_cover_letter': '#9C27B0',
                        'blocked_403': '#E91E63',
                        'unavailable': '#9E9E9E'
                    };
                    const statusTexts = {
                        'pending': 'Ожидает',
                        'processing': 'В работе',
                        'completed': 'Откликнулись',
                        'failed': 'Ошибка',
                        'requires_quiz': 'Требует квиз',
                        'requires_cover_letter': 'Требует письмо',
                        'blocked_403': 'Заблокирован',
                        'unavailable': 'Недоступна'
                    };
                    return '<tr>' +
                        '<td>' + (index + 1) + '</td>' +
                        '<td><a href="' + link.url + '" target="_blank" class="link-title" title="' + (link.title || 'Без названия') + '">' + (link.title || 'Без названия') + '</a></td>' +
                        '<td>' + (link.page_number !== null ? 'Стр. ' + (link.page_number + 1) : '-') + '</td>' +
                        '<td style="color: ' + (statusColors[link.response_status] || '#666') + '">' + (statusTexts[link.response_status] || link.response_status) + '</td>' +
                        '<td>' + new Date(link.created_at).toLocaleString('ru-RU') + '</td>' +
                    '</tr>';
                }).join('');
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

        let respondingInterval = null;
        let isRespondingActive = false;
        let localOpenedVacancyTabs = new Set(); // Локальная копия для dashboard

        async function startAutoResponding() {
            if (isRespondingActive) {
                alert('Автоотклики уже активны!');
                return;
            }

            const stats = await fetchResponseStats();
            if (!stats.canStartResponding) {
                alert('Нет вакансий для откликов или все уже обработаны!');
                return;
            }

            if (!confirm('Начать автоотклики? Будет открыто ' + stats.pending + ' вкладок по одной каждые 4 секунды.')) {
                return;
            }

            isRespondingActive = true;
            document.getElementById('startRespondingBtn').style.display = 'none';
            document.getElementById('stopRespondingBtn').style.display = 'inline-block';

            console.log('🚀 Запуск автооткликов через дашборд');
            
            // Открываем первую вакансию сразу
            await openNextVacancy();
            
            // Запускаем упрощенный мониторинг только для UI
            startVacancyMonitoring();
            
            // Запускаем проверку появления новых processing вакансий
            startProcessingMonitor();
        }

        async function openNextVacancy() {
            try {
                const response = await fetch('/api/next-vacancy');
                const data = await response.json();
                
                if (!data.vacancy) {
                    console.log('🎉 Все вакансии обработаны!');
                    return false;
                }

                // Проверяем, не открыта ли уже эта вакансия
                if (localOpenedVacancyTabs.has(data.vacancy.id)) {
                    console.log('⏳ Вакансия уже обрабатывается...');
                    return true;
                }

                console.log('🔗 Открываем вакансию: ' + data.vacancy.title);
                
                // Добавляем в список открытых
                localOpenedVacancyTabs.add(data.vacancy.id);
                
                
                // Открываем в новой вкладке
                window.open(data.vacancy.url, '_blank');
                
                return true;
            } catch (error) {
                console.error('❌ Ошибка открытия вакансии:', error);
                return false;
            }
        }

        function startVacancyMonitoring() {
            // Упрощенный мониторинг - только проверяем статистику для обновления UI
            respondingInterval = setInterval(async () => {
                if (!isRespondingActive) {
                    clearInterval(respondingInterval);
                    return;
                }
                
                const stats = await fetchResponseStats();
                
                // Если больше нет pending вакансий, завершаем процесс
                if (stats.pending === 0) {
                    console.log('🎉 Все вакансии обработаны!');
                    stopAutoResponding();
                }
            }, 3000); // Проверяем каждые 3 секунды только для статистики
        }

        function startProcessingMonitor() {
            // Мониторинг для автоматического открытия следующих вакансий
            const processingInterval = setInterval(async () => {
                if (!isRespondingActive) {
                    clearInterval(processingInterval);
                    return;
                }
                
                // Проверяем, есть ли новые processing вакансии для открытия
                const response = await fetch('/api/links');
                const data = await response.json();
                
                const processingVacancies = data.links.filter(link => 
                    link.response_status === 'processing' && 
                    !localOpenedVacancyTabs.has(link.id)
                );
                
                // Открываем новые processing вакансии
                processingVacancies.forEach(vacancy => {
                    if (!localOpenedVacancyTabs.has(vacancy.id)) {
                        console.log('🔗 Автооткрытие новой processing вакансии:', vacancy.title);
                        localOpenedVacancyTabs.add(vacancy.id);
                        window.open(vacancy.url, '_blank');
                    }
                });
                
            }, 1000); // Проверяем каждую секунду для быстрого отклика
        }

        function stopAutoResponding() {
            if (respondingInterval) {
                clearInterval(respondingInterval);
                respondingInterval = null;
            }
            
            isRespondingActive = false;
            localOpenedVacancyTabs.clear(); // Очищаем список открытых вкладок
            
            document.getElementById('startRespondingBtn').style.display = 'inline-block';
            document.getElementById('stopRespondingBtn').style.display = 'none';
            
            console.log('⏹️ Автоотклики остановлены');
        }

        async function fetchBlockingStatus() {
            try {
                const response = await fetch('/api/is-blocked');
                const data = await response.json();
                
                const banner = document.getElementById('blockingBanner');
                if (data.isBlocked) {
                    banner.style.display = 'block';
                } else {
                    banner.style.display = 'none';
                }
                
                return data;
            } catch (error) {
                console.error('Ошибка загрузки статуса блокировки:', error);
            }
        }


        async function clearBlocking() {
            if (!confirm('Снять блокировку системы? Автоотклики продолжатся.')) {
                return;
            }
            
            try {
                const response = await fetch('/api/clear-blocked', { method: 'POST' });
                const result = await response.json();
                
                if (result.success) {
                    alert('Блокировка снята!');
                    refreshData();
                } else {
                    alert('Ошибка снятия блокировки');
                }
            } catch (error) {
                console.error('Ошибка снятия блокировки:', error);
                alert('Ошибка снятия блокировки');
            }
        }

        async function refreshData() {
            await Promise.all([fetchStats(), fetchResponseStats(), fetchLinks(), fetchBlockingStatus()]);
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

// Получение следующей необработанной вакансии для автооткликов
app.get('/api/next-vacancy', (req, res) => {
    // Сначала сбрасываем зависшие processing статусы (если скрипт крашнулся)
    db.run(`UPDATE vacancy_links SET response_status = 'pending' WHERE response_status = 'processing'`, (err) => {
        if (err) console.log('Ошибка сброса processing статусов:', err);
        
        // Получаем первую pending вакансию
        db.get(`SELECT * FROM vacancy_links WHERE response_status = 'pending' ORDER BY id LIMIT 1`, (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (!row) {
                return res.json({ vacancy: null, message: 'Все вакансии обработаны' });
            }
            
            // Сразу помечаем как "processing" чтобы избежать дублирования
            db.run(`UPDATE vacancy_links SET response_status = 'processing' WHERE id = ?`, [row.id], (updateErr) => {
                if (updateErr) {
                    console.log('Ошибка обновления статуса:', updateErr);
                }
                
                res.json({ vacancy: row });
            });
        });
    });
});

// Отметить вакансию как "в обработке"
app.post('/api/vacancy/start', (req, res) => {
    const { vacancyId } = req.body;
    
    if (!vacancyId) {
        return res.status(400).json({ error: 'vacancyId обязателен' });
    }
    
    db.run(`UPDATE vacancy_links SET response_status = 'processing' WHERE id = ?`, [vacancyId], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Вакансия отмечена как обрабатываемая' });
    });
});

// Отметить вакансию как "откликнулись"
app.post('/api/vacancy/complete', (req, res) => {
    const { vacancyId } = req.body;
    
    if (!vacancyId) {
        return res.status(400).json({ error: 'vacancyId обязателен' });
    }
    
    db.run(`UPDATE vacancy_links SET response_status = 'completed', responded_at = CURRENT_TIMESTAMP WHERE id = ?`, [vacancyId], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Отклик отправлен успешно' });
    });
});

// Отметить вакансию как "ошибка"
app.post('/api/vacancy/failed', (req, res) => {
    const { vacancyId, reason } = req.body;
    
    if (!vacancyId) {
        return res.status(400).json({ error: 'vacancyId обязателен' });
    }
    
    db.run(`UPDATE vacancy_links SET response_status = 'failed' WHERE id = ?`, [vacancyId], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Вакансия отмечена как проблемная', reason: reason || 'Неизвестная ошибка' });
    });
});

// Отметить вакансию как "требует сопроводительное письмо"
app.post('/api/vacancy/requires-cover-letter', (req, res) => {
    const { vacancyId } = req.body;
    
    if (!vacancyId) {
        return res.status(400).json({ error: 'vacancyId обязателен' });
    }
    
    db.run(`UPDATE vacancy_links SET response_status = 'requires_cover_letter' WHERE id = ?`, [vacancyId], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        console.log(`📝 Вакансия ID${vacancyId} отмечена как требующая сопроводительное письмо`);
        
        // Получаем следующую pending вакансию для продолжения процесса
        db.get(`SELECT * FROM vacancy_links WHERE response_status = 'pending' ORDER BY id LIMIT 1`, (err, nextVacancy) => {
            if (err) {
                console.error('Ошибка получения следующей вакансии:', err);
                return res.json({ success: true, message: 'Вакансия помечена как требующая сопр. письмо' });
            }
            
            if (!nextVacancy) {
                console.log('🎉 Больше нет pending вакансий для обработки!');
                return res.json({ success: true, message: 'Вакансия помечена как требующая сопр. письмо, все остальные обработаны', allCompleted: true });
            }
            
            // Помечаем следующую как processing для автоматического открытия
            db.run(`UPDATE vacancy_links SET response_status = 'processing' WHERE id = ?`, [nextVacancy.id], (updateErr) => {
                if (updateErr) {
                    console.error('Ошибка обновления статуса следующей вакансии:', updateErr);
                }
                
                console.log(`🔗 Подготавливаем следующую вакансию для автооткрытия: ${nextVacancy.title}`);
                
                res.json({ 
                    success: true, 
                    message: 'Вакансия помечена как требующая сопр. письмо, следующая будет открыта dashboard\'ом',
                    shouldOpenNext: true
                });
            });
        });
    });
});

// Отметить вакансию как "требует квиз"
app.post('/api/vacancy/requires-quiz', (req, res) => {
    const { vacancyId } = req.body;
    
    if (!vacancyId) {
        return res.status(400).json({ error: 'vacancyId обязателен' });
    }
    
    db.run(`UPDATE vacancy_links SET response_status = 'requires_quiz' WHERE id = ?`, [vacancyId], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        console.log(`📝 Вакансия ID${vacancyId} отмечена как требующая квиз`);
        
        // Получаем следующую pending вакансию для продолжения процесса
        db.get(`SELECT * FROM vacancy_links WHERE response_status = 'pending' ORDER BY id LIMIT 1`, (err, nextVacancy) => {
            if (err) {
                console.error('Ошибка получения следующей вакансии:', err);
                return res.json({ success: true, message: 'Вакансия помечена как требующая квиз' });
            }
            
            if (!nextVacancy) {
                console.log('🎉 Больше нет pending вакансий для обработки!');
                return res.json({ success: true, message: 'Вакансия помечена как требующая квиз, все остальные обработаны', allCompleted: true });
            }
            
            // Помечаем следующую как processing для автоматического открытия
            db.run(`UPDATE vacancy_links SET response_status = 'processing' WHERE id = ?`, [nextVacancy.id], (updateErr) => {
                if (updateErr) {
                    console.error('Ошибка обновления статуса следующей вакансии:', updateErr);
                }
                
                console.log(`🔗 Подготавливаем следующую вакансию для автооткрытия: ${nextVacancy.title}`);
                
                res.json({ 
                    success: true, 
                    message: 'Вакансия помечена как требующая квиз, следующая будет открыта dashboard\'ом',
                    shouldOpenNext: true
                });
            });
        });
    });
});

// Отметить вакансию как "недоступна" (скрыта создателем)
app.post('/api/vacancy/unavailable', (req, res) => {
    const { vacancyId } = req.body;
    
    if (!vacancyId) {
        return res.status(400).json({ error: 'vacancyId обязателен' });
    }
    
    db.run(`UPDATE vacancy_links SET response_status = 'unavailable' WHERE id = ?`, [vacancyId], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        console.log(`🚫 Вакансия ID${vacancyId} отмечена как недоступная`);
        
        // Получаем следующую pending вакансию для продолжения процесса
        db.get(`SELECT * FROM vacancy_links WHERE response_status = 'pending' ORDER BY id LIMIT 1`, (err, nextVacancy) => {
            if (err) {
                console.error('Ошибка получения следующей вакансии:', err);
                return res.json({ success: true, message: 'Вакансия помечена как недоступная' });
            }
            
            if (!nextVacancy) {
                console.log('🎉 Больше нет pending вакансий для обработки!');
                return res.json({ success: true, message: 'Вакансия помечена как недоступная, все остальные обработаны', allCompleted: true });
            }
            
            // Помечаем следующую как processing для автоматического открытия
            db.run(`UPDATE vacancy_links SET response_status = 'processing' WHERE id = ?`, [nextVacancy.id], (updateErr) => {
                if (updateErr) {
                    console.error('Ошибка обновления статуса следующей вакансии:', updateErr);
                }
                
                console.log(`🔗 Подготавливаем следующую вакансию для автооткрытия: ${nextVacancy.title}`);
                
                res.json({ 
                    success: true, 
                    message: 'Вакансия помечена как недоступная, следующая будет открыта dashboard\'ом',
                    shouldOpenNext: true
                });
            });
        });
    });
});

// Синхронный endpoint: пометить как completed + открыть следующую вакансию
app.post('/api/vacancy/completed-and-next', (req, res) => {
    const { vacancyId } = req.body;
    
    if (!vacancyId) {
        return res.status(400).json({ error: 'vacancyId обязателен' });
    }
    
    // Помечаем текущую как completed
    db.run(`UPDATE vacancy_links SET response_status = 'completed', responded_at = CURRENT_TIMESTAMP WHERE id = ?`, [vacancyId], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        console.log(`✅ Вакансия ID${vacancyId} отмечена как completed`);
        
        // Если система была заблокирована и успешно обработали вакансию - снимаем блокировку
        if (isBlocked) {
            console.log('🎉 РАЗБЛОКИРОВКА: Успешный отклик во время блокировки!');
            console.log('📊 Снимаем глобальную блокировку системы');
            isBlocked = false;
            blockedSince = null;
            console.log('✅ Система полностью разблокирована');
        } else {
            console.log('📊 Система не была заблокирована, продолжаем обычную работу');
        }
        
        // Получаем следующую pending вакансию
        db.get(`SELECT * FROM vacancy_links WHERE response_status = 'pending' ORDER BY id LIMIT 1`, (err, nextVacancy) => {
            if (err) {
                console.error('Ошибка получения следующей вакансии:', err);
                return res.json({ success: true, message: 'Текущая вакансия завершена, но ошибка при получении следующей' });
            }
            
            if (!nextVacancy) {
                console.log('🎉 Все вакансии обработаны!');
                return res.json({ success: true, message: 'Все вакансии обработаны!', allCompleted: true });
            }
            
            // Помечаем следующую как processing
            db.run(`UPDATE vacancy_links SET response_status = 'processing' WHERE id = ?`, [nextVacancy.id], (updateErr) => {
                if (updateErr) {
                    console.error('Ошибка обновления статуса следующей вакансии:', updateErr);
                }
                
                console.log(`🔗 Открываем следующую вакансию: ${nextVacancy.title}`);
                
                // Используем Server-Sent Events или простое решение через polling endpoint
                
                res.json({ 
                    success: true, 
                    message: 'Вакансия завершена, следующая будет открыта dashboard\'ом',
                    shouldOpenNext: true
                });
            });
        });
    });
});

// Статистика откликов
app.get('/api/response-stats', (req, res) => {
    db.all(`
        SELECT 
            response_status,
            COUNT(*) as count
        FROM vacancy_links 
        GROUP BY response_status
    `, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const stats = {
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            requires_quiz: 0,
            requires_cover_letter: 0,
            blocked_403: 0,
            unavailable: 0
        };
        
        rows.forEach(row => {
            stats[row.response_status] = row.count;
        });
        
        const total = stats.pending + stats.processing + stats.completed + stats.failed;
        const progress = total > 0 ? Math.round((stats.completed / total) * 100) : 0;
        
        res.json({
            ...stats,
            total,
            progress,
            canStartResponding: stats.pending > 0
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



// ============ ENDPOINTS ДЛЯ БЛОКИРОВКИ ============

// Отметить вакансию как заблокированную (403)
app.post('/api/vacancy/blocked', (req, res) => {
    const { vacancyId } = req.body;
    
    if (!vacancyId) {
        return res.status(400).json({ error: 'vacancyId обязателен' });
    }
    
    db.run(`UPDATE vacancy_links SET response_status = 'blocked_403' WHERE id = ?`, [vacancyId], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        console.log(`🚫 Вакансия ID${vacancyId} отмечена как заблокированная (403)`);
        
        res.json({ success: true, message: 'Вакансия отмечена как заблокированная' });
    });
});

// Проверить статус глобальной блокировки
app.get('/api/is-blocked', (req, res) => {
    res.json({ 
        isBlocked,
        blockedSince
    });
});

// Установить глобальную блокировку
app.post('/api/set-blocked', (req, res) => {
    isBlocked = true;
    blockedSince = new Date();
    
    console.log(`🚫 Система заблокирована в ${blockedSince.toLocaleString()}`);
    
    // Отправляем уведомление в Telegram
    const message = `🚫 СИСТЕМА ЗАБЛОКИРОВАНА!\n\nОбнаружена 403 ошибка на hh.ru\nВремя: ${blockedSince.toLocaleString()}\n\nАвтоматические отклики приостановлены до ручного снятия блокировки.`;
    sendTelegramNotification(message);
    
    res.json({ success: true, message: 'Система заблокирована, отправлено уведомление в Telegram' });
});

// Снять глобальную блокировку вручную
app.post('/api/clear-blocked', (req, res) => {
    isBlocked = false;
    blockedSince = null;
    
    console.log('✅ Блокировка снята вручную');
    
    // Автоматически продолжаем процесс - ищем следующую pending вакансию
    db.get(`SELECT * FROM vacancy_links WHERE response_status = 'pending' ORDER BY id LIMIT 1`, (err, nextVacancy) => {
        if (err) {
            console.error('Ошибка получения следующей вакансии после разблокировки:', err);
            return res.json({ success: true, message: 'Блокировка снята' });
        }
        
        if (!nextVacancy) {
            console.log('🎉 Нет pending вакансий для продолжения');
            return res.json({ success: true, message: 'Блокировка снята, все вакансии обработаны' });
        }
        
        // Помечаем следующую как processing для автооткрытия
        db.run(`UPDATE vacancy_links SET response_status = 'processing' WHERE id = ?`, [nextVacancy.id], (updateErr) => {
            if (updateErr) {
                console.error('Ошибка обновления статуса следующей вакансии:', updateErr);
            } else {
                console.log(`🔗 Подготовлена следующая вакансия для автооткрытия: ${nextVacancy.title}`);
            }
            
            res.json({ 
                success: true, 
                message: 'Блокировка снята, следующая вакансия будет открыта автоматически',
                shouldOpenNext: true
            });
        });
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