// ==UserScript==
// @name         Menancing Client - HH.ru Parser
// @namespace    https://github.com/xcviko/menancing
// @version      2.1.0
// @description  Автоматический парсинг вакансий с hh.ru
// @author       xcviko
// @match        https://hh.ru/search/vacancy*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';
    
    const SERVER_URL = 'http://localhost:3000';
    const TARGET_LINKS = 300;
    let isParsingActive = false;
    
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
            const responseElement = card.querySelector('a[data-qa="vacancy-serp__vacancy_response"]');
            
            if (titleElement && responseElement) {
                links.push({
                    title: titleElement.textContent.trim(),
                    url: responseElement.href
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
                showCompletionMessage();
                return;
            }
            
            // НОВОЕ: Проверяем, не последняя ли это страница
            if (totalCards < config.targetCards || isLastPage()) {
                console.log('🏁 Достигнута последняя страница или недостаточно вакансий');
                console.log(`📊 Финальная статистика: ${newStats.total} ссылок собрано`);
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

    // Функции для ручного управления
    window.menancingStart = startAutoParsing;
    window.menancingParse = parseCurrentPage;
    window.menancingStats = getStats;
    window.menancingScroll = scrollUntilAllCardsLoaded; // Новая функция для тестирования прокрутки
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
        console.log('✓ Парсер инициализирован для hh.ru');
        console.log('📋 Доступные команды:');
        console.log('- menancingStart() - запуск автопарсинга');
        console.log('- menancingParse() - парсинг текущей страницы');
        console.log('- menancingStats() - получение статистики');
        console.log('- menancingScroll() - тест прокрутки lazy loading');
        console.log('- menancingStop() - остановка парсинга');
        
        // Автозапуск если включён
        if (config.autoStart) {
            setTimeout(() => {
                console.log('🤖 Автозапуск через 3 секунды...');
                setTimeout(startAutoParsing, 3000);
            }, 1000);
        }
    }

    // Запуск при загрузке страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();