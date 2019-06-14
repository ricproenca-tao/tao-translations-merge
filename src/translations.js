const {createReadStream} = require('fs');
const {join, normalize} = require('path');
const readline = require('readline');
const replace = require('replace-in-file');

const log = require('./log.js');
const config = require('./config')(process.cwd(), '.content.json');

module.exports = function taoTranslationMergeFactory(origin, available) {
    let content = {
        missing: [],
        available: [],
        ready: []
    };

    return {

        getData(prop) {
            return prop ? content[prop] : content;
        },

        async setupTranslationsContent(searchMode) {
            log.info('Searching for missing translations');


            const promises = origin.files.map(async (file) => {
                const emptyMessages = await this.getMissingTranslations(join(origin.path, file), searchMode);
                if (emptyMessages.length) {
                    content.missing.push({
                        file: normalize(file),
                        messages: emptyMessages
                    });
                }
            });
            await Promise.all(promises);

            content.missing.map((entry) => {
                log.doing(`Found ${entry.messages.length} missing translations in ${entry.file}`);
            });

            log.info('Searching for available translations');
            const availableContentPromises = available.files.map(async (file) => {
                content.available.push({
                    file: normalize(file),
                    messages: await this.getAvailableTranslations(join(available.path, file))
                });
            });
            await Promise.all(availableContentPromises);

            content.available.map((entry) => {
                log.doing(`Found ${Object.keys(entry.messages).length} available translations in ${entry.file}`);
            });

            await config.write(content);
        },

        async getMissingTranslations(file, searchMode) {
            return new Promise(function (resolve, reject) {
                let emptyMessages = [];
                let lastIdLine = null;

                const readInterface = readline.createInterface({
                    input: createReadStream(file)
                });

                readInterface.on('line', (line) => {
                    if (line.startsWith('msgid ""')) {
                        lastIdLine = null;
                        return;
                    }

                    if (line.startsWith('msgid ')) {
                        lastIdLine = line;
                    }

                    //if ((line.startsWith('msgstr ""') || line.endsWith(searchMode.endsWith)) && lastIdLine) {
                    if (line.startsWith('msgstr ""') && lastIdLine) {
                        emptyMessages.push(lastIdLine);
                    }
                });

                readInterface.on('close', function () {
                    resolve(emptyMessages);
                });

                readInterface.on('error', function () {
                    reject(false);
                });
            });
        },

        async getAvailableTranslations(file) {
            return new Promise(function (resolve, reject) {
                let emptyMessages = {};
                let lastIdLine = null;

                const readInterface = readline.createInterface({
                    input: createReadStream(file)
                });

                readInterface.on('line', (line) => {
                    if (line.startsWith('msgstr ') && lastIdLine) {
                        emptyMessages[lastIdLine] = line;
                        lastIdLine = null;
                        return;
                    }

                    if (line.startsWith('msgid ""')) {
                        lastIdLine = null;
                    }

                    if (line.startsWith('msgid ')) {
                        lastIdLine = line;
                    }
                });

                readInterface.on('close', function () {
                    resolve(emptyMessages);
                });

                readInterface.on('error', function () {
                    reject(false);
                });
            });
        },

        async prepareMerge() {
            log.info('Preparing merge');

            content.missing.map((entry) => {
                const fileName = entry.file;
                if (entry.messages.length) {
                    // content.ready[fileName] = {};
                    const newEntry = {
                        file: fileName,
                        messages: []
                    };
                    entry.messages.map((msg) => {
                        const readyMsg = {};
                        readyMsg[msg] = this.getAvailableMessage(fileName, msg);
                        newEntry.messages.push(readyMsg);
                    });

                    content.ready.push(newEntry);
                }
            });

            content.ready.map((entry) => {
                log.doing(`Found ${Object.keys(entry.messages).length} messages ready to translate in "${entry.file}"`);
            });

            await config.write(content);
        },

        getAvailableMessage(fileName, msgId) {
            const found = content.available.filter((entry) => {
                return entry.file === fileName;
            })[0];

            if (found) {
                const msgStr = found.messages[msgId];
                if (!msgStr) {
                    log.warn(`Cannot found available translation for [${msgId}] in [${fileName}]`);
                }

                return msgStr || 'msgstr ""';
            }

            log.warn(`Cannot found [${fileName}] file in available translations`);
            return '';
        },

        async merge() {
            content.ready.map((entry) => {
                const options = {files: join(origin.path, entry.file)};
                log.info(`Merging file ${entry.file}`);

                entry.messages.forEach(msg => {
                    const msgKey = Object.keys(msg);
                    const msgValue = Object.values(msg);

                    options.from = `${msgKey}\nmsgstr ""`;
                    options.to = `${msgKey}\n${msgValue}`;

                    try {
                        const results = replace.sync(options)[0];
                        if (!results.hasChanged) {
                            log.warn(`Nothing has changed, when merging [${msgKey}] to [${msgValue}]`);
                        }
                    } catch (error) {
                        log.error(error);
                    }
                });
            });
        }
    };
};

