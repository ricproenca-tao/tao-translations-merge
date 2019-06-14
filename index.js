const log = require('./src/log');

// TODO: set user, check tao release
const runner = require('./src/runner')();

(async function start() {
    try {
        log.title('TAO Merge Translations!');
        await runner.loadConfig();
        await runner.selectTaoInstance();

        await runner.selectExtension();
        await runner.selectLanguage();
        await runner.selectTranslationsFolder();
        await runner.selectEmptyTranslationMode();
        await runner.proceed();

        // log.warn(JSON.stringify(runner.getData(), null, 2));

        await runner.prepareMerge();
        await runner.proceedMerge();
        await runner.mergeTranslations();

        log.done('See you next time!');
    } catch (error) {
        log.error(error);
    }
})();
