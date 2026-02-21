export function notFound(message = 'Not found') {
  return Response.json({ error: message }, { status: 404 });
}

export function badRequest(message = 'Bad request') {
  return Response.json({ error: message }, { status: 400 });
}

export function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export function serverError(message = 'Internal server error') {
  return Response.json({ error: message }, { status: 500 });
}
