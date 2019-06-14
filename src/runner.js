const opn = require('opn');
const inquirer = require('inquirer');
const path = require('path');

const config = require('./config')();
const log = require('./log.js');
const taoInstanceFactory = require('./taoInstance.js');
const translationsFactory = require('./translations.js');

module.exports = function runner(wwwUser = 'www-data') {
    let data = {};
    let taoInstance;
    let translationsInstance;

    return {

        getData() {
            return data;
        },

        /**
         * Load configuration
         */
        async loadConfig() {
            data = Object.assign({}, await config.load());

            // Request github token if necessary
            if (!data.token) {
                setTimeout(() => opn('https://github.com/settings/tokens'), 2000);

                const {token} = await inquirer.prompt({
                    type: 'input',
                    name: 'token',
                    message: 'I need a Github token, with "repo" rights (check your browser)  : ',
                    validate: tk => /[a-z0-9]{32,48}/i.test(tk),
                    filter: tk => tk.trim()
                });

                data.token = token;

                await config.write(data);
            }
        },

        /**
         * Select and initialise tao instance
         */
        async selectTaoInstance() {
            const {taoRoot} = await inquirer.prompt({
                type: 'input',
                name: 'taoRoot',
                message: 'Path to the TAO instance : ',
                default: data.taoRoot || process.cwd()
            });

            taoInstance = taoInstanceFactory(path.resolve(taoRoot), true, wwwUser);

            const {dir, root} = await taoInstance.isRoot();

            if (!root) {
                log.exit(`${dir} is not a TAO instance`);
            }

            if (!await taoInstance.isInstalled()) {
                log.exit('It looks like the given TAO instance is not installed.');
            }

            data.taoRoot = dir;

            await config.write(data);
        },

        /**
         * Select and initialise the extension to release
         */
        async selectExtension() {
            const availableExtensions = await taoInstance.getExtensions();

            const {extension} = await inquirer.prompt({
                type: 'list',
                name: 'extension',
                message: 'Which extension you want to release ? ',
                pageSize: 12,
                choices: availableExtensions,
                default: data.extension && data.extension.name,
            });

            data.extension = {
                name: extension,
                path: path.normalize(`${data.taoRoot}/${extension}`),
            };

            await config.write(data);
        },

        /**
         * Select language from an extension
         */
        async selectLanguage() {
            const languagesData = await taoInstance.getLanguages(data.extension.path);
            const availableLanguages =
                languagesData
                    .filter(entry => entry.language)
                    .map(entry => path.basename(entry.dir));

            const {language} = await inquirer.prompt({
                type: 'list',
                name: 'language',
                message: 'Which language you want to choose ? ',
                pageSize: 12,
                choices: availableLanguages,
                default: data.language && data.language.name,
            });

            const lang = languagesData.filter((entry) => {
                return entry.name === language;
            });

            data.language = {
                name: language,
                path: path.normalize(`${data.extension.path}/locales/${language}`),
                files: lang[0].files
            };

            await config.write(data);
        },

        /**
         * Select the folder where are the new translations
         */
        async selectTranslationsFolder() {
            const {translation} = await inquirer.prompt({
                type: 'input',
                name: 'translation',
                message: `Path to the *.PO files for the "${data.language.name}" language : `,
                default: data.translation && data.translation.path || process.cwd(),
            });

            const isLanguage = await taoInstance.isLanguage(translation);

            if (!isLanguage.language) {
                log.error(`${translation} must be a valid language directory`);
                process.exit();
            }

            data.translation = {
                path: path.normalize(translation),
                files: isLanguage.files
            };

            await config.write(data);
        },

        async selectEmptyTranslationMode() {
            const {endsWith} = await inquirer.prompt({
                type: 'input',
                name: 'endsWith',
                message: 'Search files for messages that ends with',
                default: data.endsWith || ''
            });

            data.searchMode = {
                startsWith: 'msgstr ""',
                endsWith: `${endsWith}"`
            };

            await config.write(data);
        },

        /**
         * Recap of the user choices
         *
         * @returns {Promise<void>}
         */
        async proceed() {
            const {proceed} = await inquirer.prompt({
                type: 'confirm',
                name: 'proceed',
                message: `Extension: ${data.extension.name}\n  Language: ${data.language.name}\n  *.PO files: ${data.translation.path}\n  Messages should start with ${data.searchMode.startsWith} or ending with ${data.searchMode.endsWith}\n  Proceed?`,
                default: data.translation.path,
            });

            if (!proceed) {
                process.exit();
            }
        },

        /**
         * Merge empty translations
         *
         * @returns {Promise<void>}
         */
        async prepareMerge() {
            // taoInstance.updateTranslations(data.extension.name);

            translationsInstance = translationsFactory(data.language, data.translation);
            await translationsInstance.setupTranslationsContent(data.searchMode);
            await translationsInstance.prepareMerge();

            // log.warn(JSON.stringify(translationsInstance.getData('ready'), null, 2));
        },

        async proceedMerge() {
            const {proceed} = await inquirer.prompt({
                type: 'confirm',
                name: 'proceed',
                message: 'Are you sure you want to merge the translations?',
                default: true
            });

            if (!proceed) {
                process.exit();
            }
        },

        async mergeTranslations() {
            await translationsInstance.merge();
        }
    };
};
