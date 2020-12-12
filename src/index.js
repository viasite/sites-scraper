#!/usr/bin/env node
const process = require('process');
const program = require('./program');
const scrapSite = require('./scrap-site');
const color = require('./color');

program.parse(process.argv);

async function start() {
  if (!program.urls) {
    console.log(`${program.name()} ${program.version()}`);
    console.log(`Usage: ${program.name()} ${program.usage()}`);
    process.exit(1);
  }

  await program.postParse();

  outBrief(program);

  const sites = program.urls;
  const opts = {
    fieldsPreset: program.preset,              // варианты: default, seo, headers, minimal
    fieldsExclude: program.exclude,             // исключить поля
    maxDepth: program.maxDepth,                 // глубина сканирования
    maxConcurrency: parseInt(program.concurrency), // параллельно открываемые вкладки
    lighthouse: program.lighthouse,             // сканировать через lighthouse
    delay: parseInt(program.delay),             // задержка между запросами
    skipStatic: program.skipStatic,             // не пропускать подгрузку браузером статики (картинки, css, js)
    followSitemapXml: program.followXmlSitemap, // чтобы найти больше страниц
    limitDomain: program.limitDomain,           // не пропускать подгрузку браузером статики (картинки, css, js)
    urlList: program.urlList,                   // метка, что передаётся страница со списком url
    maxRequest: program.maxRequests,            // для тестов
    headless: program.headless,                 // на десктопе открывает браузер визуально
    docsExtensions: program.docsExtensions,     // расширения, которые будут добавлены в таблицу
    outDir: program.outDir,                     // папка, куда сохраняются csv
    outName: program.outName,                   // имя файла
    color: program.color,                       // раскрашивать консоль
    lang: program.lang,                         // язык
    openFile: program.openFile,                 // открыть файл после сканирования
    fields: program.fields,                     // дополнительные поля, --fields 'title=$("title").text()'
    defaultFilter: program.defaultFilter,       //
    removeCsv: program.removeCsv,               // удалять csv после генерации xlsx
    removeJson: program.removeJson,             // удалять json после поднятия сервера
    xlsx: program.xlsx,                         // сохранять в XLSX
    gdrive: program.gdrive,                     // публиковать на google docs
    json: program.json,                         // сохранять json файл
    upload: program.upload,                     // выгружать json на сервер
    consoleValidate: program.consoleValidate,   // выводить данные валидации в консоль
    obeyRobotsTxt: !program.ignoreRobotsTxt,    // не учитывать блокировки в robots.txt
  };

  for (let site of sites) {
    // console.log('program: ', program);
    await scrapSite(site, opts);
  }
}

function outBrief(options) {
  const brief = [
    {
      name: 'Preset',
      value: options.preset,
      comment: '--preset [minimal, seo, headers, parse, lighthouse, lighthouse-all]',
    },
    {
      name: 'Threads',
      value: options.concurrency,
      comment: '-c threads' +
        (options.concurrency > 1 && options.lighthouse ?
          `, ${color.yellow}recommended to set -c 1 when using lighthouse${color.reset}`
          : ''),
    },
    {
      name: 'Delay',
      value: options.delay,
      comment: '--delay ms',
    },
    {
      name: 'Ignore robots.txt',
      value: (options.ignoreRobotsTxt ? 'yes' : 'no'),
      comment: (!options.ignoreRobotsTxt ? '--ignore-robots-txt' : ''),
    },
    {
      name: 'Follow sitemap.xml',
      value: (options.followSitemapXml ? 'yes' : 'no'),
      comment: (!options.followSitemapXml ? '--follow-xml-sitemap' : ''),
    },
    {
      name: 'Max depth',
      value: options.maxDepth,
      comment: '-d 8',
    },
    {
      name: 'Max requests',
      value: options.maxRequests ? options.maxRequests : 'unlimited',
      comment: '-m 123',
    },
    /*{
      name: 'Lighthouse',
      value: (options.lighthouse ? 'yes' : 'no'),
    },*/
    {
      name: 'Headless',
      value: (options.headless ? 'yes' : 'no'),
      comment: (options.headless ? '--no-headless' : ''),
    },
    {
      name: 'Save as XLSX',
      value: (options.xlsx ? 'yes' : 'no'),
      comment: (!options.xlsx ? '--xlsx' : ''),
    },
    {
      name: 'Save as JSON',
      value: (options.json ? 'yes' : 'no'),
      comment: (options.json ? '--no-json' : ''),
    },
    {
      name: 'Upload JSON',
      value: (options.upload ? 'yes' : 'no'),
      comment: (!options.upload ? '--upload' : ''),
    },
    {
      name: 'Language',
      value: options.lang,
      comment: '--lang ' + (options.lang == 'ru' ? 'en' : 'ru'),
    },
    {
      name: 'Docs extensions',
      value: options.docsExtensions.join(','),
      comment: '--docs-extensions zip,rar',
    },
  ];

  console.log('');
  for (let line of brief) {
    const nameCol = line.name.padEnd(20, ' ');
    const valueCol = `${line.value}`.padEnd(10, ' ');
    console.log(color.white + nameCol + valueCol + color.reset
      + (line.comment ? ` ${line.comment}` : ''));
  }
  console.log('');
}

start();
