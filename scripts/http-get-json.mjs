const [url, userAgent] = process.argv.slice(2);

if (!url || !userAgent) {
  console.error('Usage: node http-get-json.mjs <url> <user-agent>');
  process.exit(2);
}

try {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Api-User-Agent': userAgent,
      'User-Agent': userAgent,
    },
    signal: AbortSignal.timeout(30_000),
  });

  const body = await response.text();
  if (!response.ok) {
    console.error(`HTTP ${response.status}`);
    process.exit(3);
  }

  process.stdout.write(body);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(4);
}
