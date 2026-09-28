const http = require('http');

const data = JSON.stringify({ email: 'artisahu6880@gmail.com', password: 'asdfghjkl' });
const req = http.request({
  hostname: 'localhost', port: 3000, path: '/api/v2/admin/login',
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
}, res => {
  const cookie = res.headers['set-cookie'];
  console.log('Login status:', res.statusCode);
  if (!cookie) { console.log('No cookie'); return; }
  
  http.get({
    hostname: 'localhost', port: 3000, path: '/api/v2/admin/products?store=6aba5a2833ca7d2e247d7ea2',
    headers: { 'Cookie': cookie[0] }
  }, res2 => {
    let body = '';
    res2.on('data', c => body += c);
    res2.on('end', () => console.log('Products:', res2.statusCode, body));
  });
});
req.write(data);
req.end();
