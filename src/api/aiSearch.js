const SEARCH_ENDPOINT =
  'https://fge585v7dk.execute-api.us-west-2.amazonaws.com/search';

async function parseResponse(response) {
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(text || 'REQUEST_FAILED');
    error.status = response.status;
    error.payload = text;
    throw error;
  }
  try {
    const json = JSON.parse(text);
    if (typeof json === 'string') {
      try {
        return { raw: json, parsed: JSON.parse(json) };
      } catch (error) {
        return { raw: json, parsed: null };
      }
    }
    return { raw: text, parsed: json };
  } catch (error) {
    return { raw: text, parsed: null };
  }
}

async function tryPost(query) {
  const response = await fetch(SEARCH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json,text/plain',
    },
    body: JSON.stringify({ query, q: query, text: query, input: query, prompt: query }),
  });
  return parseResponse(response);
}

async function tryGet(query) {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set('query', query);
  url.searchParams.set('q', query);
  url.searchParams.set('text', query);
  url.searchParams.set('input', query);
  const response = await fetch(url.toString());
  return parseResponse(response);
}

export async function runSearch(query) {
  if (!query) {
    return { results: [], raw: null };
  }
  try {
    return await tryPost(query);
  } catch (error) {
    return tryGet(query);
  }
}
