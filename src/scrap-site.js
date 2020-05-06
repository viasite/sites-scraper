// see API - https://github.com/yujiosaka/headless-chrome-crawler/blob/master/docs/API.md#event-requeststarted
const fs = require('fs');
const saveAsXlsx = require('./save-as-xlsx');
const HCCrawler = require('@popstas/headless-chrome-crawler');
const CSVExporter = require('@popstas/headless-chrome-crawler/exporter/csv');
const url = require('url');
const {validateResults} = require('./validate');

const DEBUG = true; // выключить, если не нужны console.log на каждый запрос (не будет видно прогресс)

const color = {
  reset: '\x1b[0m',
  white: '\x1b[37m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

// запреты браузеру на подгрузку статики, ускоряет
let SKIP_IMAGES = true;
let SKIP_CSS = true;
let SKIP_JS = true;

// поля описаны в API по ссылке выше
const fields_presets = {
  default: ['response.url', 'depth'],
  minimal: ['response.url'],
  seo: [
    'response.url',
    'result.mixed_content_url',
    'result.canonical',
    'result.is_canonical',
    'previousUrl',
    'depth',
    'response.status',
    'result.request_time',
    'result.title',
    'result.h1',
    'result.description',
    'result.keywords',
    'result.og_title',
    'result.og_image',
    'result.schema_types',
    'result.h1_count',
    'result.h2_count',
    'result.h3_count',
    'result.h4_count',
    'result.images',
    'result.images_without_alt',
    'result.images_alt_empty',
    'result.images_outer',
    'result.links',
    'result.links_inner',
    'result.links_outer',
    'result.text_ratio_percent',
    'result.dom_size',
    'result.html_size'
  ],
  headers: [
    'response.url',
    'depth',
    'response.headers.content-type',
    'response.headers.',
    'response.headers.x-bitrix-composite',
    'response.headers.x-page-speed',
    'response.headers.x-cached-by',
    'response.headers.x-drupal-cache'
  ],
  parse: [
    'response.url',
    'result.title',
    'result.h1',
    'result.description',
    'result.keywords',
  ]
};

module.exports = async (baseUrl, options = {}) => {
  const domain = url.parse(baseUrl).hostname;
  const protocol = url.parse(baseUrl).protocol;
  const csvPath = `${options.outDir}/${domain}.csv`;
  const xlsxPath = `${options.outDir}/${domain}.xlsx`;

  if(!options.color) color.white = color.red = color.reset = color.yellow = '';

  if (!options.fields_preset || !fields_presets[options.fields_preset]){
    options.fields_preset = 'default';
  }
  let fields = fields_presets[options.fields_preset];

  if(options.fields) {
    //console.log('options.fields: ', options.fields);
    fields = [...Object.keys(options.fields).map(f => 'result.' + f), ...fields];
  }

  if (options.skipStatic !== undefined) {
    SKIP_IMAGES = SKIP_CSS = SKIP_JS = options.skipStatic;
  }

  const exporter = new CSVExporter({
    file: csvPath,
    fields: fields,
    separator: ';'
  });

  let crawler;
  const defaultOptions = {
    allowedDomains: options.limitDomain ? [domain] : undefined,
    skipRequestedRedirect: true, // all redirects marks as visited
    depthPriority: false, // without it find not all pages
    args: ['--no-sandbox'], // puppeteer freezes without it
    exporter,

    // url ignore rules
    preRequest: options => {
      // console.log(options.url);
      if (options.url.match(/\.(jpg|jpeg|png|gif)/i)) return false; // картинки
      if (options.url.match(/\?width=\d+&height=\d+/)) return false; // визитки, сотрудники
      if (options.url.includes('?vi=y')) return false; // версия для слабовидящих
      if (options.url.includes('gallery/?page=detail')) return false; // Битрикс Галерея 2.0
      if (options.url.includes('/?lightbox=')) return false; // lightbox
      if (options.url.includes('rk.php')) return false; // bitrix rk
      if (options.url.includes('/?catalog_view=')) return false; // bitrix display
      if (options.url.includes('/?SORT=')) return false; // bitrix sort
      if (options.url.includes('/filter/clear/apply/')) return false; // bitrix filter
      // if (options.url.match(/\?(category|age|usage|madein|season|brand)=/)) return false; // bitrix filter

      // http scan while first page was https
      if(url.parse(options.url).protocol != protocol) return false;

      return true;
    },

    // сюда можно дописывать сборщики данных со страницы
    // поля надо добавить в fields выше
    evaluatePage: async () => {
      try {
        const customFields = await window.__customFields();
        // console.log('window.__customFields(): ', JSON.stringify(customFields));

        let domainParts = location.host.split('.');
        const domain2level = domainParts.slice(domainParts.length-2).join('.');
        const canonical = $('link[rel="canonical"]').attr('href');
        const result = {
          request_time:
            window.performance.timing.responseEnd - window.performance.timing.requestStart,
          title: $('title').text(),
          h1: $('h1').text().trim(),
          h1_count: $('h1').length,
          h2_count: $('h2').length,
          h3_count: $('h3').length,
          h4_count: $('h4').length,
          dom_size: document.getElementsByTagName('*').length,
          head_size: document.head.innerHTML.length,
          body_size: document.body.innerHTML.length,
          html_size: document.head.innerHTML.length + document.body.innerHTML.length,
          text_ratio_percent: Math.round(document.body.innerText.length / document.body.innerHTML.length * 100),
          images: $('img').length,
          images_without_alt: $('img:not([alt]').length,
          images_alt_empty: $('img[alt=""]').length,
          images_outer: $('img[src^="http"]:not([src^="/"]):not([src*="'+domain2level+'"])').length,
          links: $('a[href]:not([href^="javascript"]):not([href^="#"])').length,
          links_inner: $('a[href^="/"], a[href*="'+domain2level+'"]').length,
          links_outer: $('a[href]:not([href^="javascript"]):not([href^="#"]):not([href^="/"]):not([href*="'+domain2level+'"])').length,
          // links_absolute: $('').length,
          description:
            ($('meta[name="description"]').attr('content') &&
              $('meta[name="description"]')
                .attr('content')
                .split('\n')
                .join(' ')) ||
            '',
          keywords: $('meta[name="keywords"]').attr('content'),
          canonical: canonical,
          is_canonical: canonical ? (canonical == decodeURI(window.location.href) ? 1 : 0) : '',
          og_title: $('meta[property="og:title"]').attr('content'),
          og_image: $('meta[property="og:image"]').attr('content'),
          schema_types: $.unique($('[itemtype]').map((i, item) => $(item).attr('itemType').replace(/https?:\/\/schema\.org\//, ''))).toArray().join(', ')
        };

        for(let name in customFields) {
          result[name] = eval(customFields[name].replace(/`/g, "'"));
          // if(name == 'section') result[name] = $('.views-field.views-field-field-section a').text();
        }

        return result;
      } catch (e) {
        return {
          error: JSON.stringify(e)
        };
      }
    },

    onSuccess: result => {
      if (!result.result) return;

      if (result.result.error) console.error(`${color.red}Error collect page data: result.result.error${color.reset}`);
      // console.log(`html_size: ${result.result.html_size}`);
    },

    customCrawl: async (page, crawl, crawler) => {
      // You can access the page object before requests
      await page.setRequestInterception(true);
      await page.setBypassCSP(true);

      //page.on('console', msg => console.log(msg.text()));
      await page.exposeFunction('__customFields', () => {
        return options.fields;
      });

      let mixedContentUrl = '';

      // это событие срабатывает, когда chrome подгружает статику на странице (и саму страницу)
      page.on('request', request => {
        //console.log('request.url(): ', request.url());

        // check for mixed content, thanks to https://github.com/busterc/mixed-content-crawler/
        if (protocol == 'https:' && ['image', 'stylesheet', 'script'].includes(request.resourceType()) && request.url().match(/^http:/)) {
          request.notHTTPS = true;
          mixedContentUrl = request.url();
          return request.abort();
        }

        const isDoc = options.docsExtensions.some(ext => request.url().includes(`.${ext}`));
        if(isDoc) {
          // досюда как-то доходит
          request.abort();
        } else if (SKIP_IMAGES && request.resourceType() == 'image') {
          request.abort();
        } else if (SKIP_CSS && request.resourceType() == 'stylesheet') {
          request.abort();
        } else if (SKIP_JS && request.resourceType() == 'script') {
          request.abort();
        } else {
          request.continue();
        }
      });

      page.on('requestfailed',  request => {
        if (request.notHTTPS) {
          console.error(`${color.red}mixed content: ${request.url()}${color.reset}`);
        }
      });

      /* page.on('error', function(err) {
        console.error(`${color.red}Page error:${color.reset} ` + err.toString()); 
      }); */

      /*page.on('close', function() {
        console.error(`${color.red}Page closed${color.reset} `); 
      });*/

      /* page.on('pegeerror', function(err) {
        console.error(`${color.red}pegeerror:${color.reset} ` + err.toString()); 
      }); */

      // console.log('co '+ crawler._options.url);

      // костыль, который возвращает фейково обойдённый документ, если он признан документом
      // нужно, чтобы доки не сканировались (выдают ошибку), но при этом добавлялись в csv
      // т.к. в этом контексте нет текущего урла, он задаётся в глобал через событие requeststarted
      const isDoc = crawler._options.url && options.docsExtensions.some(ext => crawler._options.url.includes(`.${ext}`));
      if (isDoc) {
        return{
          options: {},
          depth: 0,
          previousUrl: '',
          response: {
            url: crawler._options.url
          },
          redirectChain: [],
          result: {},
          screenshot: null,
          cookies: [],
          links: []
        };
      }

      // The result contains options, links, cookies and etc.
      const result = await crawl();

      result.result.mixed_content_url = mixedContentUrl;
      if(result.response.url) result.response.url = decodeURI(result.response.url);

      // console validate output
      // was in onSuccess(), but causes exception on docs
      const msgs = [];
      const validate = validateResults(result, fields); // TODO: fields declared implicitly
      for(let name in validate) {
        const res = validate[name];
        const msgColor = { warning: color.yellow, error: color.red }[res.type];
        msgs.push(`${name}: ${msgColor}${res.msg}${color.reset}`);
      }
      if(msgs.length > 0) console.log(msgs.join(', '));

      // You can access the page object after requests
      result.content = await page.content();
      // You need to extend and return the crawled result
      return result;
    }
  };

  const crawlerOptions = { ...defaultOptions, ...options };

  const start = Date.now();

  console.log(`${color.yellow}Scrapping ${baseUrl}...${color.reset}`);
  let requestedCount = 0;

  try {
    crawler = await HCCrawler.launch(crawlerOptions);
  } catch(e) {
    console.log(e);
  }

  crawler.on('requeststarted', async options => {
    const queueCount = await crawler.queueSize();
    requestedCount = crawler.requestedCount() + 1;
    if (DEBUG) console.log(`${requestedCount} ${decodeURI(options.url)} (${queueCount})`);
  });
  crawler.on('requestfailed', error => {
    console.error(`${color.red}Failed: ${decodeURI(error.options.url)}${color.reset}`);
  });
  crawler.on('requestdisallowed', options => {
    console.error(`${color.yellow}Disallowed in robots.txt: ${decodeURI(options.url)}${color.reset}`);
  });
  crawler.on('maxdepthreached', options => {
    console.log(`${color.yellow}Max depth reached${color.reset}`);
  });
  crawler.on('maxrequestreached', options => {
    console.log(`${color.yellow}Max requests reached\nPlease, ignore this error:${color.reset}`);
  });
  await crawler.queue(baseUrl);
  await crawler.onIdle();
  await crawler.close();

  // after scan
  const t = Math.round((Date.now() - start) / 1000);
  const perPage = Math.round((t / requestedCount) * 100) / 100;

  const finishScan = () => {
    if(options.removeCsv) {
      fs.unlinkSync(csvPath);
    }

    console.log(`\n${color.yellow}Saved to ${xlsxPath}${color.reset}`);
    console.log(`Finish: ${t} sec (${perPage} per page)`);
  };

  let isSuccess = true;
  try {
    saveAsXlsx(csvPath, xlsxPath);
  } catch (e) {
    if(e.code == 'EBUSY'){
      isSuccess = false;
      console.error(`${color.red}${xlsxPath} is busy, please close file in 10 seconds!`);
      setTimeout(() => {
        saveAsXlsx(csvPath, xlsxPath);
        finishScan();
      }, 10000)
    }
    else console.error(e);
  }

  if(isSuccess) finishScan();
};
