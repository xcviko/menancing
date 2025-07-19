async function addAllSkillsSimple() {
    const skills = [
      "JavaScript",
      "TypeScript",
      "React",
      "Git",
      "HTML",
      "CSS",
      "CSS3",
      "HTML5",
      "REST API",
      "VueJS",
      "Redux",
      "Angular",
      "Vue.js",
      "Webpack",
      "Node.js",
      "Frontend",
      "Vue",
      "JS",
      "REST",
      "Docker",
      "Figma",
      "Sass",
      "SCSS",
      "Адаптивная верстка",
      "ООП",
      "GitHub",
      "Кроссбраузерная верстка",
      "API",
      "PostgreSQL",
      "React Native"
    ];

    const input = document.querySelector('[data-qa="chips-trigger-input"]');
    let success = 0;
    let failed = 0;

    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      console.log(`${i + 1}/${skills.length}: ${skill}`);

      try {
        // Ввод через React
        const reactKey = Object.keys(input).find(key => key.startsWith('__reactFiber'));

        if (reactKey) {
          input.value = '';
          input.focus();

          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          nativeInputValueSetter.call(input, skill);

          const event = new Event('input', { bubbles: true });
          event.simulated = true;

          const tracker = input._valueTracker;
          if (tracker) {
            tracker.setValue('');
          }

          input.dispatchEvent(event);
        }

        // Небольшая пауза для React
        await new Promise(resolve => setTimeout(resolve, 100));

        // Сразу жмем Enter
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true
        }));

        console.log(`✓ Добавлен: ${skill}`);
        success++;

        // Пауза между навыками
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (error) {
        console.log(`❌ Ошибка с ${skill}:`, error);
        failed++;
      }
    }

    console.log(`\n🎉 Готово! Успешно: ${success}, Неудачно: ${failed}`);
  }

  // Запуск
  addAllSkillsSimple();