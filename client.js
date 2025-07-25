// ==UserScript==
// @name         Menancing Client - HH.ru Parser
// @namespace    https://github.com/xcviko/menancing
// @version      2.2.1
// @description  Автоматический парсинг вакансий с hh.ru
// @author       xcviko
// @match        https://hh.ru/*
// @updateURL    https://raw.githubusercontent.com/xcviko/menancing/main/client.js
// @downloadURL  https://raw.githubusercontent.com/xcviko/menancing/main/client.js
// @homepageURL  https://github.com/xcviko/menancing
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';
    
    const SERVER_URL = 'http://localhost:3000';
    const TARGET_LINKS = 300;
    let isParsingActive = false;
    let isRespondingActive = false;
    let currentVacancy = null;
    
    console.log('🚀 Menancing Parser v2.1 загружен');

    // Конфигурация парсинга
    const config = {
        autoStart: true,
        delay: 2000, // Задержка между страницами
        scrollDelay: 800, // Задержка между прокрутками для lazy loading
        maxScrollAttempts: 20, // Максимальное количество попыток прокрутки
        targetCards: 50, // Целевое количество карточек на странице
        currentPage: 0
    };

    // Утилита для ожидания
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Универсальная функция для ожидания условия с активной проверкой
    async function waitForCondition(checkFunction, maxAttempts = 600, intervalMs = 100) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const result = checkFunction();
                if (result) {
                    return result;
                }
            } catch (error) {
                // Игнорируем ошибки в checkFunction и продолжаем проверку
            }
            await sleep(intervalMs);
        }
        return false;
    }

    // Прокрутка страницы до загрузки всех карточек (до 50 или до конца)
    async function scrollUntilAllCardsLoaded() {
        console.log('📜 Прокручиваем страницу для загрузки всех карточек...');
        
        let attempts = 0;
        let previousCount = 0;
        let stableCount = 0;
        
        // Проверяем текущее количество карточек без прокрутки в начало
        let initialCount = document.querySelectorAll('[data-qa="vacancy-serp__vacancy"]').length;
        console.log(`📋 Изначально видно карточек: ${initialCount}`);
        
        // Если уже достаточно карточек - возвращаем результат
        if (initialCount >= config.targetCards) {
            console.log('✅ Уже загружено достаточно карточек');
            return initialCount;
        }
        
        while (attempts < config.maxScrollAttempts) {
            const currentCount = document.querySelectorAll('[data-qa="vacancy-serp__vacancy"]').length;
            console.log(`📋 Загружено карточек: ${currentCount}/${config.targetCards}`);
            
            // Если достигли целевого количества карточек
            if (currentCount >= config.targetCards) {
                console.log('✅ Загружено достаточно карточек');
                return currentCount;
            }
            
            // Если количество карточек не изменилось несколько раз подряд
            if (currentCount === previousCount) {
                stableCount++;
                if (stableCount >= 3) {
                    console.log(`⚠️ Карточки больше не загружаются. Возможно это последняя страница. Итого: ${currentCount}`);
                    return currentCount;
                }
            } else {
                stableCount = 0;
            }
            
            previousCount = currentCount;
            
            // Прокручиваем вниз на высоту экрана
            window.scrollBy(0, window.innerHeight);
            await sleep(config.scrollDelay);
            
            // Дополнительная пауза для загрузки контента
            await sleep(300);
            
            attempts++;
        }
        
        const finalCount = document.querySelectorAll('[data-qa="vacancy-serp__vacancy"]').length;
        console.log(`📋 Прокрутка завершена. Итого карточек: ${finalCount}`);
        return finalCount;
    }

    // Определение последней страницы
    function isLastPage() {
        // Метод 1: Проверяем через пагинацию
        const pageButtons = document.querySelectorAll('[data-qa="pager-page"]');
        const currentPage = getCurrentPageNumber();
        
        if (pageButtons.length === 0) {
            console.log('🔍 Пагинация не найдена - возможно последняя страница');
            return true;
        }
        
        // Находим максимальный номер страницы из пагинации
        const maxPage = Math.max(...Array.from(pageButtons).map(btn => {
            const href = btn.getAttribute('href');
            const pageMatch = href.match(/page=(\d+)/);
            return pageMatch ? parseInt(pageMatch[1]) : 0;
        }));
        
        console.log(`🔍 Текущая страница: ${currentPage}, Максимальная: ${maxPage}`);
        return currentPage >= maxPage;
    }

    // Парсинг ссылок на отклик с текущей страницы
    function parseCurrentPage() {
        console.log('🔍 Парсим текущую страницу...');
        
        const vacancyCards = document.querySelectorAll('[data-qa="vacancy-serp__vacancy"]');
        console.log(`📋 Найдено карточек: ${vacancyCards.length}`);
        
        const links = [];
        
        vacancyCards.forEach((card, index) => {
            const titleElement = card.querySelector('a[data-qa="serp-item__title"]');
            
            if (titleElement && titleElement.href) {
                links.push({
                    title: titleElement.textContent.trim(),
                    url: titleElement.href
                });
            }
        });
        
        console.log(`✅ Собрано ${links.length} ссылок`);
        return links;
    }

    // Отправка данных на сервер
    async function sendLinksToServer(links, pageNumber) {
        try {
            const response = await fetch(`${SERVER_URL}/api/links`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    links: links,
                    pageNumber: pageNumber
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('📤 Данные отправлены:', data.message);
            return data;
            
        } catch (error) {
            console.error('❌ Ошибка отправки данных:', error);
            throw error;
        }
    }

    // Получение статистики с сервера
    async function getStats() {
        try {
            const response = await fetch(`${SERVER_URL}/api/stats`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            console.error('❌ Ошибка получения статистики:', error);
            throw error;
        }
    }

    // Переход на следующую страницу
    function goToNextPage() {
        const url = new URL(window.location.href);
        const currentPage = parseInt(url.searchParams.get('page') || '0');
        const nextPage = currentPage + 1;
        
        url.searchParams.set('page', nextPage);
        
        console.log(`➡️ Переходим на страницу ${nextPage + 1}`);
        window.location.href = url.toString();
    }

    // Основная логика автопарсинга с lazy loading
    async function startAutoParsing() {
        if (isParsingActive) {
            console.log('⚠️ Парсинг уже активен');
            return;
        }
        
        isParsingActive = true;
        console.log('🎯 Запуск автопарсинга...');
        
        try {
            // Получаем статистику
            const stats = await getStats();
            console.log(`📊 Статистика: ${stats.total}/${stats.target} (${stats.progress}%)`);
            
            if (stats.completed) {
                console.log('🎉 Цель достигнута! Парсинг завершён.');
                showCompletionMessage();
                return;
            }
            
            // НОВОЕ: Сначала прокручиваем страницу для загрузки всех карточек
            console.log('⏳ Ожидаем загрузки всех карточек через lazy loading...');
            const totalCards = await scrollUntilAllCardsLoaded();
            
            // Парсим текущую страницу
            const links = parseCurrentPage();
            
            if (links.length === 0) {
                console.log('❌ На странице нет ссылок для парсинга');
                isParsingActive = false;
                return;
            }
            
            // Отправляем данные на сервер
            const currentPageNum = getCurrentPageNumber();
            await sendLinksToServer(links, currentPageNum);
            
            // Проверяем обновлённую статистику
            const newStats = await getStats();
            console.log(`📊 Обновлённая статистика: ${newStats.total}/${newStats.target}`);
            
            if (newStats.completed) {
                console.log('🎉 Цель достигнута! Парсинг завершён.');
                isParsingActive = false; // Завершаем парсинг
                showCompletionMessage();
                return;
            }
            
            // НОВОЕ: Проверяем, не последняя ли это страница
            if (totalCards < config.targetCards || isLastPage()) {
                console.log('🏁 Достигнута последняя страница или недостаточно вакансий');
                console.log(`📊 Финальная статистика: ${newStats.total} ссылок собрано`);
                isParsingActive = false; // Завершаем парсинг
                showCompletionMessage(`Парсинг завершён! Собрано ${newStats.total} ссылок.`);
                return;
            }
            
            // Переходим на следующую страницу с задержкой
            console.log(`➡️ Переходим на следующую страницу через ${config.delay}мс...`);
            setTimeout(() => {
                goToNextPage();
            }, config.delay);
            
        } catch (error) {
            console.error('❌ Ошибка автопарсинга:', error);
            
            // Если сервер недоступен, показываем инструкцию
            if (error.message.includes('fetch')) {
                console.log('💡 Убедитесь что сервер запущен: npm start');
            }
            
            isParsingActive = false;
        }
    }

    // Получение номера текущей страницы
    function getCurrentPageNumber() {
        const url = new URL(window.location.href);
        return parseInt(url.searchParams.get('page') || '0');
    }

    // Показ сообщения о завершении
    function showCompletionMessage(customMessage = '🎉 Парсинг завершён! Собрано 300 ссылок.') {
        const message = document.createElement('div');
        message.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #4CAF50;
            color: white;
            padding: 20px;
            border-radius: 8px;
            z-index: 10000;
            font-size: 18px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 400px;
        `;
        message.innerHTML = customMessage;
        document.body.appendChild(message);
        
        setTimeout(() => {
            if (document.body.contains(message)) {
                document.body.removeChild(message);
            }
        }, 5000);
    }

    // ============ АВТООТКЛИКИ ============
    
    // Функция для обнаружения модалки с сопроводительным письмом
    function detectCoverLetterModal() {
        // Ищем модалку по основному селектору
        const modalOverlay = document.querySelector('[data-qa="modal-overlay"]') || 
                           document.querySelector('.magritte-modal-overlay') ||
                           document.querySelector('[class*="magritte-modal-overlay"]');
        
        if (!modalOverlay) {
            return false;
        }
        
        // Проверяем наличие textarea внутри модалки (для сопроводительного письма)
        const textarea = modalOverlay.querySelector('textarea') ||
                        modalOverlay.querySelector('[data-qa*="letter"]') ||
                        modalOverlay.querySelector('[data-qa*="cover"]');
        
        // Дополнительная проверка на текст "Сопроводительное письмо"
        const hasLetterText = modalOverlay.textContent && 
                             modalOverlay.textContent.includes('Сопроводительное письмо');
        
        // Модалка с сопр. письмом найдена если есть textarea ИЛИ соответствующий текст
        return Boolean(textarea || hasLetterText);
    }
    
    // Функция для обнаружения страницы с 403 блокировкой
    function detect403Block() {
        const bodyText = document.body.textContent;
        
        // Главная проверка - ищем элемент <b> с текстом 403
        const boldElements = document.querySelectorAll('b');
        for (let boldElement of boldElements) {
            const text = boldElement.textContent.trim();
            if (text.includes('403') && text.includes('Forbidden')) {
                console.log('🚫 Обнаружена 403 блокировка!');
                return true;
            }
        }
        
        // Проверка через заголовок "403 - Forbidden" в тексте страницы
        if (bodyText.includes('403 - Forbidden')) {
            console.log('🚫 Обнаружена 403 блокировка!');
            return true;
        }
        
        // Проверка через характерные тексты на странице 403
        if (bodyText.includes("That's an error") && 
            bodyText.includes('Client does not have access rights')) {
            console.log('🚫 Обнаружена 403 блокировка!');
            return true;
        }
        
        // Дополнительная проверка через URL (если в URL есть признаки ошибки)
        if (window.location.href.includes('error') && bodyText.includes('403')) {
            console.log('🚫 Обнаружена 403 блокировка!');
            return true;
        }
        
        // Проверка через title страницы
        if (document.title.includes('403') || document.title.includes('Forbidden')) {
            console.log('🚫 Обнаружена 403 блокировка!');
            return true;
        }
        
        return false;
    }
    
    // Функция для обнаружения недоступной вакансии (скрытой создателем)
    function detectUnavailableVacancy() {
        // Сначала ищем родительский элемент с классом account-login-page
        const loginPageElement = document.querySelector('.account-login-page') || 
                                 document.querySelector('[class*="account-login-page"]');
        
        if (!loginPageElement) {
            return false;
        }
        
        console.log('🔍 Найден элемент account-login-page, проверяем содержимое...');
        
        // Внутри родительского элемента ищем текст о недоступности вакансии
        const elementText = loginPageElement.textContent;
        
        // Основная проверка - ищем ключевой текст
        if (elementText.includes('Вам недоступна эта вакансия')) {
            console.log('🚫 Обнаружена недоступная вакансия!');
            return true;
        }
        
        // Дополнительная проверка для надежности
        if (elementText.includes('Войдите как пользователь, у которого есть доступ на просмотр')) {
            console.log('🚫 Обнаружена недоступная вакансия (через текст входа)!');
            return true;
        }
        
        // Проверка на текст о входе как работодатель
        if (elementText.includes('либо как работодатель, создавший эту вакансию')) {
            console.log('🚫 Обнаружена недоступная вакансия (через текст работодателя)!');
            return true;
        }
        
        return false;
    }
    
    // Обработка страницы квиза
    async function handleQuizPage() {
        console.log('🎯 Обнаружена страница квиза - требует ручной обработки');
        
        try {
            // Пытаемся получить ID вакансии из URL или referrer
            let vacancyId = null;
            
            // Метод 1: Ищем ID в текущем URL
            const currentUrl = window.location.href;
            const urlMatch = currentUrl.match(/vacancy[\/=](\d+)/);
            if (urlMatch) {
                vacancyId = urlMatch[1];
            }
            
            // Метод 2: Ищем ID в referrer
            if (!vacancyId && document.referrer) {
                const referrerMatch = document.referrer.match(/vacancy[\/=](\d+)/);
                if (referrerMatch) {
                    vacancyId = referrerMatch[1];
                }
            }
            
            // Метод 3: Ищем vacancy ID из localStorage или sessionStorage (если они есть)
            if (!vacancyId) {
                // Можно добавить дополнительные методы поиска ID
                console.log('⚠️ Не удалось определить ID вакансии автоматически');
            }
            
            if (vacancyId) {
                console.log(`🔍 Найден ID вакансии: ${vacancyId}`);
                
                // Ищем вакансию в базе по ID
                const response = await fetch(`${SERVER_URL}/api/links`);
                const data = await response.json();
                
                const vacancy = data.links.find(link => 
                    link.url.includes(`/vacancy/${vacancyId}`) || 
                    link.url.includes(vacancyId)
                );
                
                if (vacancy) {
                    console.log(`📝 Отмечаем вакансию "${vacancy.title}" как требующую квиз`);
                    
                    // Отправляем запрос на сервер о том, что это квиз
                    await fetch(`${SERVER_URL}/api/vacancy/requires-quiz`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ vacancyId: vacancy.id })
                    });
                    
                    console.log('✅ Вакансия помечена как требующая квиз');
                } else {
                    console.log('❌ Вакансия не найдена в базе данных');
                }
            }
            
            // Закрываем вкладку сразу после обработки
            console.log('🚪 Закрываем вкладку с квизом');
            window.close();
            
        } catch (error) {
            console.error('❌ Ошибка обработки страницы квиза:', error);
            window.close();
        }
    }
    
    // Новая функция для обработки вакансии, открытой из дашборда
    async function processVacancyFromDashboard() {
        console.log('🎯 === НАЧАЛО ОБРАБОТКИ ВАКАНСИИ ===');
        console.log('📍 Функция: processVacancyFromDashboard()');
        
        try {
            // Получаем URL текущей страницы
            const currentUrl = window.location.href;
            console.log('🔗 URL страницы:', currentUrl);
            
            // Извлекаем ID вакансии из URL
            const urlParts = currentUrl.match(/\/vacancy\/(\d+)/);
            const vacancyId = urlParts ? urlParts[1] : null;
            console.log('🆔 Извлеченный ID вакансии:', vacancyId);
            
            if (!vacancyId) {
                console.log('❌ ОШИБКА: Не удалось извлечь ID вакансии из URL');
                console.log('🚪 Закрываем вкладку из-за отсутствия ID');
                window.close();
                return;
            }
            
            console.log('🔍 Этап A: Поиск вакансии в базе данных...');
            
            // Ищем вакансию в базе по ID
            console.log('📤 Отправляем запрос на /api/links...');
            const response = await fetch(`${SERVER_URL}/api/links`);
            const data = await response.json();
            console.log('📊 Получено вакансий из базы:', data.links.length);
            
            const vacancy = data.links.find(link => 
                link.url.includes(`/vacancy/${vacancyId}`) || 
                link.url.includes(vacancyId)
            );
            
            if (!vacancy) {
                console.log('❌ ОШИБКА: Вакансия не найдена в базе данных');
                console.log('🚪 Закрываем вкладку - вакансия не найдена');
                window.close();
                return;
            }
            
            console.log(`✅ Вакансия найдена в базе: ${vacancy.title}`);
            console.log('📊 Статус вакансии:', vacancy.response_status);
            console.log('🆔 ID в базе:', vacancy.id);
            
            console.log('🔍 Этап B: Проверка страницы на 403 блокировку...');
            // СНАЧАЛА проверяем, не заблокирована ли страница 403
            await sleep(2000); // Даём время странице загрузиться
            console.log('⏱️ Пауза 2 секунды завершена, проверяем 403...');
            
            const is403 = detect403Block();
            console.log('🚫 Результат проверки 403:', is403);
            
            if (is403) {
                console.log('🚫 ОБНАРУЖЕНА 403 БЛОКИРОВКА - начинаем обработку...');
                
                try {
                    console.log('📤 Отправляем POST /api/vacancy/blocked...');
                    // Отмечаем вакансию как заблокированную
                    const blockedResponse = await fetch(`${SERVER_URL}/api/vacancy/blocked`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ vacancyId: vacancy.id })
                    });
                    const blockedResult = await blockedResponse.json();
                    console.log('✅ Результат blocked запроса:', blockedResult);
                    
                    console.log('📤 Отправляем POST /api/set-blocked...');
                    // Устанавливаем глобальную блокировку
                    const setBlockedResponse = await fetch(`${SERVER_URL}/api/set-blocked`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    const setBlockedResult = await setBlockedResponse.json();
                    console.log('✅ Результат set-blocked запроса:', setBlockedResult);
                    
                    console.log('🚫 Система успешно заблокирована из-за 403!');
                } catch (error) {
                    console.error('❌ Ошибка при блокировке системы:', error);
                }
                
                console.log('🚪 Закрываем вкладку после обработки 403');
                window.close();
                return;
            } else {
                console.log('✅ 403 НЕ обнаружена на этой странице');
                
                // Проверяем, не является ли вакансия недоступной (скрытой создателем)
                console.log('🔍 Этап B2: Проверка на недоступную вакансию...');
                const isUnavailable = detectUnavailableVacancy();
                console.log('🚫 Результат проверки недоступности:', isUnavailable);
                
                if (isUnavailable) {
                    console.log('🚫 ОБНАРУЖЕНА НЕДОСТУПНАЯ ВАКАНСИЯ - начинаем обработку...');
                    
                    try {
                        console.log('📤 Отправляем POST /api/vacancy/unavailable...');
                        // Отмечаем вакансию как недоступную
                        const unavailableResponse = await fetch(`${SERVER_URL}/api/vacancy/unavailable`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ vacancyId: vacancy.id })
                        });
                        const unavailableResult = await unavailableResponse.json();
                        console.log('✅ Результат unavailable запроса:', unavailableResult);
                        
                        console.log('🚫 Вакансия успешно помечена как недоступная!');
                    } catch (error) {
                        console.error('❌ Ошибка при пометке вакансии как недоступной:', error);
                    }
                    
                    console.log('🚪 Закрываем вкладку после обработки недоступной вакансии');
                    window.close();
                    return;
                } else {
                    console.log('✅ Вакансия доступна, продолжаем обработку');
                }
                
                // Если система была заблокирована, но страница нормальная - снимаем блокировку
                console.log('🔍 Проверяем нужно ли снять блокировку системы...');
                try {
                    const blockStatusResponse = await fetch(`${SERVER_URL}/api/is-blocked`);
                    const blockStatus = await blockStatusResponse.json();
                    
                    if (blockStatus.isBlocked) {
                        console.log('🎉 Система была заблокирована, но страница нормальная - снимаем блокировку!');
                        const clearResponse = await fetch(`${SERVER_URL}/api/clear-blocked`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        const clearResult = await clearResponse.json();
                        console.log('✅ Результат снятия блокировки:', clearResult);
                    } else {
                        console.log('✅ Система не была заблокирована, продолжаем обычную работу');
                    }
                } catch (error) {
                    console.error('❌ Ошибка при проверке/снятии блокировки:', error);
                }
            }
            
            // Ждём загрузки страницы и ищем кнопку "Откликнуться"
            console.log('🔍 Этап C: Проверка глобальной блокировки (если страница НЕ 403)...');
            
            // Теперь проверяем глобальную блокировку
            const blockStatusResponse = await fetch(`${SERVER_URL}/api/is-blocked`);
            const blockStatus = await blockStatusResponse.json();
            console.log('📊 Глобальный статус блокировки:', blockStatus);
            
            if (blockStatus.isBlocked) {
                console.log('🚫 Система глобально заблокирована, но это НЕ 403 страница');
                console.log('🚪 Закрываем вкладку - дожидаемся разблокировки');
                window.close();
                return;
            }
            
            console.log('✅ Переходим к поиску кнопки отклика...');
            const responseButton = await waitForElement('a[data-qa="vacancy-response-link-top"]');
            
            if (!responseButton) {
                console.log('❌ Кнопка "Откликнуться" не найдена');
                await markVacancyAsFailed(vacancy.id, 'Кнопка не найдена');
                window.close();
                return;
            }
            
            console.log('✓ Кнопка "Откликнуться" найдена, кликаем...');
            responseButton.click();
            
            // Активный мониторинг результата отклика (3 возможных состояния)
            console.log('🔍 Мониторим результат отклика...');
            
            // Функция проверки успешного отклика
            const checkSuccess = () => {
                return Array.from(document.querySelectorAll('*')).find(el => 
                    el.textContent && el.textContent.replace(/[\s\u00A0]+/g, ' ').trim() === 'Вы откликнулись'
                );
            };
            
            // Функция проверки редиректа на квиз
            const checkQuizRedirect = () => {
                return window.location.pathname.includes('/applicant/vacancy_response');
            };
            
            // Функция проверки модалки с сопроводительным письмом
            const checkCoverLetterModal = () => {
                return detectCoverLetterModal();
            };
            
            // Функция проверки 403 блокировки
            const check403Block = () => {
                const result = detect403Block();
                if (result) {
                    console.log('🚫 check403Block() вернул TRUE - 403 обнаружена!');
                }
                return result;
            };
            
            // Функция проверки недоступной вакансии
            const checkUnavailableVacancy = () => {
                const result = detectUnavailableVacancy();
                if (result) {
                    console.log('🚫 checkUnavailableVacancy() вернул TRUE - недоступная вакансия обнаружена!');
                }
                return result;
            };
            
            // Ждем одного из пяти состояний (максимум 60 секунд)
            let result = null;
            const maxAttempts = 600; // 60 секунд при интервале 100мс
            
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                if (attempt % 50 === 0) { // Логируем каждые 5 секунд
                    console.log(`🔍 Мониторинг состояния (${attempt}/600)...`);
                }
                
                if (checkSuccess()) {
                    console.log('✅ Обнаружен успешный отклик');
                    result = 'success';
                    break;
                } else if (checkQuizRedirect()) {
                    console.log('📝 Обнаружен редирект на квиз');
                    result = 'quiz';
                    break;
                } else if (checkCoverLetterModal()) {
                    console.log('📝 Обнаружена модалка с сопроводительным письмом');
                    result = 'cover_letter';
                    break;
                } else if (check403Block()) {
                    console.log('🚫 Обнаружена 403 блокировка');
                    result = 'blocked_403';
                    break;
                } else if (checkUnavailableVacancy()) {
                    console.log('🚫 Обнаружена недоступная вакансия');
                    result = 'unavailable';
                    break;
                }
                await sleep(100);
            }
            
            // Обрабатываем результат
            if (result === 'success') {
                console.log('🎉 Отклик отправлен успешно!');
                
                
                // Синхронный запрос: пометить completed + открыть следующую
                await fetch(`${SERVER_URL}/api/vacancy/completed-and-next`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vacancyId: vacancy.id })
                });
            } else if (result === 'quiz') {
                console.log('📝 Обнаружен редирект на квиз - переключаемся на обработку квиза');
                // handleQuizPage() будет вызван автоматически при перезагрузке страницы
                return;
            } else if (result === 'cover_letter') {
                console.log('📝 Обнаружена модалка с сопроводительным письмом');
                await fetch(`${SERVER_URL}/api/vacancy/requires-cover-letter`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vacancyId: vacancy.id })
                });
            } else if (result === 'blocked_403') {
                console.log('🚫 Обнаружена 403 блокировка - отправляем запросы на сервер');
                
                try {
                    // Отмечаем вакансию как заблокированную
                    console.log('📤 Отправляем POST /api/vacancy/blocked...');
                    const blockedResponse = await fetch(`${SERVER_URL}/api/vacancy/blocked`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ vacancyId: vacancy.id })
                    });
                    const blockedResult = await blockedResponse.json();
                    console.log('✅ Результат /api/vacancy/blocked:', blockedResult);
                    
                    // Устанавливаем глобальную блокировку
                    console.log('📤 Отправляем POST /api/set-blocked...');
                    const setBlockedResponse = await fetch(`${SERVER_URL}/api/set-blocked`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    const setBlockedResult = await setBlockedResponse.json();
                    console.log('✅ Результат /api/set-blocked:', setBlockedResult);
                    
                    console.log('🚫 Система успешно заблокирована!');
                } catch (error) {
                    console.error('❌ Ошибка при блокировке системы:', error);
                }
            } else if (result === 'unavailable') {
                console.log('🚫 Обнаружена недоступная вакансия - отправляем запрос на сервер');
                
                try {
                    // Отмечаем вакансию как недоступную
                    console.log('📤 Отправляем POST /api/vacancy/unavailable...');
                    const unavailableResponse = await fetch(`${SERVER_URL}/api/vacancy/unavailable`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ vacancyId: vacancy.id })
                    });
                    const unavailableResult = await unavailableResponse.json();
                    console.log('✅ Результат /api/vacancy/unavailable:', unavailableResult);
                    
                    console.log('🚫 Вакансия успешно помечена как недоступная!');
                } catch (error) {
                    console.error('❌ Ошибка при пометке вакансии как недоступной:', error);
                }
            } else {
                console.log('❌ Таймаут - не удалось определить результат отклика');
                await markVacancyAsFailed(vacancy.id, 'Таймаут обработки отклика');
            }
            
            // Закрываем вкладку сразу после обработки
            window.close();
            
        } catch (error) {
            console.error('❌ Ошибка автообработки:', error);
            window.close();
        }
    }
    
    // Получение следующей вакансии для обработки
    async function getNextVacancy() {
        try {
            const response = await fetch(`${SERVER_URL}/api/next-vacancy`);
            const data = await response.json();
            return data.vacancy;
        } catch (error) {
            console.error('❌ Ошибка получения следующей вакансии:', error);
            return null;
        }
    }
    
    // Отметить вакансию как "в обработке"
    async function markVacancyAsProcessing(vacancyId) {
        try {
            await fetch(`${SERVER_URL}/api/vacancy/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vacancyId })
            });
        } catch (error) {
            console.error('❌ Ошибка отметки вакансии как processing:', error);
        }
    }
    
    // Отметить вакансию как "откликнулись"
    async function markVacancyAsCompleted(vacancyId) {
        try {
            await fetch(`${SERVER_URL}/api/vacancy/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vacancyId })
            });
            console.log('✅ Отклик отправлен успешно');
        } catch (error) {
            console.error('❌ Ошибка отметки вакансии как completed:', error);
        }
    }
    
    // Отметить вакансию как "ошибка"
    async function markVacancyAsFailed(vacancyId, reason) {
        try {
            await fetch(`${SERVER_URL}/api/vacancy/failed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vacancyId, reason })
            });
            console.log('❌ Вакансия отмечена как проблемная:', reason);
        } catch (error) {
            console.error('❌ Ошибка отметки вакансии как failed:', error);
        }
    }
    
    // Ожидание появления элемента
    async function waitForElement(selector, maxAttempts = 20) {
        for (let i = 0; i < maxAttempts; i++) {
            const element = document.querySelector(selector);
            if (element) {
                return element;
            }
            await sleep(500);
        }
        return null;
    }
    
    // Обработка вакансии на её странице (только клик и проверка результата)
    async function processVacancyOnPage(vacancy) {
        console.log(`🎯 Обрабатываем вакансию на странице: ${vacancy.title}`);
        
        // Ждём загрузки страницы и ищем кнопку "Откликнуться"
        const responseButton = await waitForElement('a[data-qa="vacancy-response-link-top"]');
        
        if (!responseButton) {
            console.log('❌ Кнопка "Откликнуться" не найдена');
            await markVacancyAsFailed(vacancy.id, 'Кнопка не найдена');
            return false;
        }
        
        console.log('✓ Кнопка "Откликнуться" найдена, кликаем...');
        responseButton.click();
        
        // Ждём появления сообщения об успешном отклике
        await sleep(2000); // Ждём обработки клика
        const successElement = Array.from(document.querySelectorAll('*')).find(el => 
            el.textContent && el.textContent.replace(/[\s\u00A0]+/g, ' ').trim() === 'Вы откликнулись'
        );
        
        if (successElement) {
            console.log('🎉 Отклик отправлен успешно!');
            await markVacancyAsCompleted(vacancy.id);
            return true;
        } else {
            console.log('❌ Сообщение об успешном отклике не найдено');
            await markVacancyAsFailed(vacancy.id, 'Отклик не подтвердился');
            return false;
        }
    }
    
    
    // Функции для ручного управления
    window.menancingStart = startAutoParsing;
    window.menancingParse = parseCurrentPage;
    window.menancingStats = getStats;
    window.menancingScroll = scrollUntilAllCardsLoaded;
    window.menancingProcessVacancy = processVacancyFromDashboard; // Ручная обработка вакансии
    window.menancingStop = () => {
        isParsingActive = false;
        console.log('⏹️ Парсинг остановлен');
    };
    
    // Старые функции для совместимости
    window.menancingClickResponse = function() {
        console.log('🎯 Ищем кнопку "Откликнуться" на странице');
        const button = Array.from(document.querySelectorAll('span')).find(span => 
            span.textContent.trim() === 'Откликнуться' && 
            span.className.includes('magritte-button__label')
        );
        if (button) {
            const parentButton = button.closest('button') || button.closest('[role="button"]') || button.parentElement;
            if (parentButton) {
                console.log('✓ Кликаем по кнопке "Откликнуться"');
                parentButton.click();
                return true;
            }
        }
        console.log('❌ Кнопка не найдена');
        return false;
    };
    
    window.menancingFillTextarea = function(text = "Заинтересован в данной позиции") {
        const textarea = document.querySelector('textarea[data-qa="vacancy-response-popup-form-letter-input"]');
        if (textarea) {
            const nativeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            nativeValueSetter.call(textarea, text);
            const event = new Event('input', { bubbles: true });
            textarea.dispatchEvent(event);
            return true;
        }
        return false;
    };

    // Проверка глобального статуса блокировки
    async function checkIfBlocked() {
        try {
            const response = await fetch(`${SERVER_URL}/api/is-blocked`);
            const data = await response.json();
            
            if (data.isBlocked) {
                console.log('🚫 Система заблокирована - закрываем вкладку');
                window.close();
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    // Инициализация
    async function init() {
        const currentUrl = window.location.href;
        const pathname = window.location.pathname;
        
        console.log(`🚀 Menancing Client инициализирован на: ${pathname}`);
        console.log(`🔗 Полный URL: ${currentUrl}`);
        
        console.log('⚡ Этап 1: Определение типа страницы...');
        
        // СПЕЦИАЛЬНАЯ ОБРАБОТКА для страниц вакансий - сначала проверяем 403
        if (pathname.includes('/vacancy/') || currentUrl.includes('/vacancy/')) {
            console.log('🎯 ТИП СТРАНИЦЫ: Конкретная вакансия (/vacancy/)');
            console.log('✓ Специальный режим: проверяем 403 ПЕРЕД глобальной блокировкой');
            console.log('📍 URL:', currentUrl);
            console.log('📍 Pathname:', pathname);
            
            setTimeout(async () => {
                console.log('⚡ Этап 2: Специальная обработка вакансии (403 сначала)...');
                await processVacancyFromDashboard();
            }, 2000);
            return; // Выходим, чтобы не обрабатывать другие типы страниц
        }
        
        // Для всех остальных типов страниц - сначала проверяем глобальную блокировку
        console.log('⚡ Этап 2: Проверка статуса блокировки системы...');
        const isBlocked = await checkIfBlocked();
        if (isBlocked) {
            console.log('🛑 ВЫХОД: Система заблокирована, останавливаем инициализацию');
            return; // Выходим, если система заблокирована
        }
        
        console.log('⚡ Этап 3: Обработка других типов страниц...');
        
        if (pathname.includes('/applicant/vacancy_response') || currentUrl.includes('/applicant/vacancy_response')) {
            // Страница квиза - требует ручной обработки
            console.log('📝 ТИП СТРАНИЦЫ: Квиз (vacancy_response)');
            console.log('✓ Запускаем обработку через 2 секунды...');
            setTimeout(async () => {
                console.log('🎯 Запускаем обработку страницы квиза...');
                await handleQuizPage();
            }, 2000);
        } else if (pathname.includes('/search/vacancy') || currentUrl.includes('/search/vacancy')) {
            // Страница поиска вакансий
            console.log('🔍 ТИП СТРАНИЦЫ: Поиск вакансий (search/vacancy)');
            console.log('✓ Парсер инициализирован для страницы поиска');
            console.log('📋 Доступные команды:');
            console.log('- menancingStart() - запуск автопарсинга');
            console.log('- menancingParse() - парсинг текущей страницы');
            console.log('- menancingStats() - получение статистики');
            console.log('- menancingScroll() - тест прокрутки lazy loading');
            console.log('- menancingStop() - остановка всех процессов');
            
            // Автозапуск парсинга если включён
            if (config.autoStart) {
                setTimeout(() => {
                    console.log('🤖 Автозапуск парсинга через 3 секунды...');
                    setTimeout(startAutoParsing, 3000);
                }, 1000);
            }
        } else {
            console.log('❓ ТИП СТРАНИЦЫ: Неизвестный тип');
            console.log('✓ Скрипт загружен на поддерживаемом домене hh.ru');
            console.log('📍 Путь:', pathname);
            console.log('📋 Доступные команды:');
            console.log('- menancingStop() - остановка всех процессов');
        }
    }

    // Запуск при загрузке страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();