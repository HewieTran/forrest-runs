function handler(event) {
  var request = event.request;
  request.headers['x-forrest-beta-host'] = { value: request.headers.host.value };
  return request;
}
