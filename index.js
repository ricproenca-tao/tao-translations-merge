const log = require('./src/log');
const runner = require('./src/runner')();

(async function start() {
    try {
        log.title('TAO Merge Translations!');
        await runner.loadConfig();

        await runner.selectTaoInstance();
        await runner.selectExtension();
        await runner.selectLanguage();
        await runner.selectTranslationsFolder();

        await runner.selectSearchModeEndsWith();

        await runner.verifyLocalChanges();
        await runner.proceed();

        await runner.prepareMerge();

        await runner.createBranch();
        await runner.mergeTranslations();
        await runner.bumpVersion();
        await runner.commitAndPush();

        await runner.initialiseGithubClient();
        await runner.createPullRequest();

        log.done('Don\'t forget to delete the branch!\nBye, bye! See you next time!');
    } catch (error) {
        log.error(error);
    }
})();
