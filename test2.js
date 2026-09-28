const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/v2/admin/products?store=6aba5a2833ca7d2e247d7ea2&q=&page=1',
  method: 'GET',
  headers: {
    'Cookie': 'token=foo' // Fake token will result in 401
  }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(res.statusCode, data));
});
req.end();
