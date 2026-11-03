if (process.argv.some((a) => a.startsWith('--input-helper='))) require('./input-helper');
else require('./main');
