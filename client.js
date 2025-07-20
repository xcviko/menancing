// ==UserScript==
// @name         Menancing Client - HH.ru Parser
// @namespace    https://github.com/xcviko/menancing
// @version      2.2.0
// @description  Автоматический парсинг вакансий с hh.ru
// @author       xcviko
// @match        https://hh.ru/*
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
    
    // Новая функция для обработки вакансии, открытой из дашборда
    async function processVacancyFromDashboard() {
        console.log('🎯 Автообработка вакансии, открытой из дашборда');
        
        try {
            // Получаем URL текущей страницы
            const currentUrl = window.location.href;
            
            // Извлекаем ID вакансии из URL
            const urlParts = currentUrl.match(/\/vacancy\/(\d+)/);
            const vacancyId = urlParts ? urlParts[1] : null;
            
            if (!vacancyId) {
                console.log('❌ Не удалось извлечь ID вакансии из URL');
                window.close();
                return;
            }
            
            console.log('🔍 Ищем вакансию с ID:', vacancyId);
            
            // Ищем вакансию в базе по ID
            const response = await fetch(`${SERVER_URL}/api/links`);
            const data = await response.json();
            
            const vacancy = data.links.find(link => 
                link.url.includes(`/vacancy/${vacancyId}`) || 
                link.url.includes(vacancyId)
            );
            
            if (!vacancy) {
                console.log('❌ Вакансия не найдена в базе данных');
                window.close();
                return;
            }
            
            console.log(`🎯 Обрабатываем вакансию: ${vacancy.title}`);
            
            // Ждём загрузки страницы и ищем кнопку "Откликнуться"
            const responseButton = await waitForElement('a[data-qa="vacancy-response-link-top"]');
            
            if (!responseButton) {
                console.log('❌ Кнопка "Откликнуться" не найдена');
                await markVacancyAsFailed(vacancy.id, 'Кнопка не найдена');
                window.close();
                return;
            }
            
            console.log('✓ Кнопка "Откликнуться" найдена, кликаем...');
            responseButton.click();
            
            // Ждём появления сообщения об успешном отклике
            await sleep(2000);
            const successElement = Array.from(document.querySelectorAll('*')).find(el => 
                el.textContent && el.textContent.replace(/[\s\u00A0]+/g, ' ').trim() === 'Вы откликнулись'
            );
            
            if (successElement) {
                console.log('🎉 Отклик отправлен успешно!');
                // Синхронный запрос: пометить completed + открыть следующую
                await fetch(`${SERVER_URL}/api/vacancy/completed-and-next`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vacancyId: vacancy.id })
                });
            } else {
                console.log('❌ Сообщение об успешном отклике не найдено');
                await markVacancyAsFailed(vacancy.id, 'Отклик не подтвердился');
            }
            
            // Закрываем вкладку
            setTimeout(() => {
                window.close();
            }, 1000);
            
        } catch (error) {
            console.error('❌ Ошибка автообработки:', error);
            setTimeout(() => {
                window.close();
            }, 1000);
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

    // Инициализация
    function init() {
        const currentUrl = window.location.href;
        const pathname = window.location.pathname;
        
        console.log(`🚀 Menancing Client инициализирован на: ${pathname}`);
        
        if (pathname.includes('/search/vacancy') || currentUrl.includes('/search/vacancy')) {
            // Страница поиска вакансий
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
        } else if (pathname.includes('/vacancy/') || currentUrl.includes('/vacancy/')) {
            // Страница конкретной вакансии - автоматически обрабатываем
            console.log('✓ Инициализирован для страницы вакансии - автообработка');
            console.log('📍 URL:', currentUrl);
            console.log('📍 Pathname:', pathname);
            
            setTimeout(async () => {
                console.log('🎯 Запускаем автообработку вакансии...');
                await processVacancyFromDashboard();
            }, 2000);
        } else {
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