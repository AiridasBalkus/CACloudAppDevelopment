import type { APIGatewayProxyEvent } from 'aws-lambda';

export const logRequest = (event: APIGatewayProxyEvent): void => {
   const username =
    event.requestContext.authorizer?.username ??
    (event.requestContext.identity?.apiKey ? 'admin' : 'anonymous');
  const params = Object.entries(event.queryStringParameters ?? {}).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  const query = params.length ? `?${new URLSearchParams(params)}` : '';
  console.log(`${username}   ${event.path}${query}`);
};
