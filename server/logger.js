const util = require('util');
const minimist = require('minimist');

const rawCliArgs = process.argv.slice(1).filter((arg) => arg !== '--');
const cliArgs = rawCliArgs.length > 0 && !String(rawCliArgs[0] || '').startsWith('-')
    ? rawCliArgs.slice(1)
    : rawCliArgs;
const argv = minimist(cliArgs);

function parseLogLevel(rawValue) {
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 0 || value > 2) {
        return 1;
    }
    return value;
}

const logLevel = parseLogLevel(argv.log);

function shouldLog(levelName) {
    if (levelName === 'error' || levelName === 'warn') return true;
    if (levelName === 'debug') return logLevel >= 2;
    return logLevel >= 1;
}

function normalizeArgs(args) {
    return args.map((arg) => {
        if (arg instanceof Error) {
            return arg.stack || arg.message;
        }
        if (typeof arg === 'string') {
            return arg;
        }
        return util.inspect(arg, {
            depth: 6,
            colors: false,
            breakLength: Infinity,
            compact: false
        });
    });
}

function emit(levelName, args) {
    if (!shouldLog(levelName)) return;

    const parts = normalizeArgs(args);
    const message = util.format(...parts);
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${levelName.toUpperCase()}]`;
    const line = `${prefix} ${message}`;

    if (levelName === 'error') {
        process.stderr.write(`${line}\n`);
        return;
    }

    process.stdout.write(`${line}\n`);
}

const logger = {
    level: logLevel,
    error: (...args) => emit('error', args),
    warn: (...args) => emit('warn', args),
    info: (...args) => emit('info', args),
    debug: (...args) => emit('debug', args),
    patchGlobalConsole() {
        console.log = (...args) => logger.info(...args);
        console.info = (...args) => logger.info(...args);
        console.warn = (...args) => logger.warn(...args);
        console.error = (...args) => logger.error(...args);
        console.debug = (...args) => logger.debug(...args);
    }
};

module.exports = logger;
