async function test() {
  const r1 = await fetch('http://localhost:3000/api/v2/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'artisahu6880@gmail.com', password: 'asdfghjkl' })
  });
  const c = r1.headers.get('set-cookie');
  console.log('Cookie:', c);

  const r2 = await fetch('http://localhost:3000/api/v2/admin/products?store=6aba5a2833ca7d2e247d7ea2', {
    headers: { 'Cookie': c }
  });
  const j = await r2.json();
  console.log('Response:', j);
}
test();
