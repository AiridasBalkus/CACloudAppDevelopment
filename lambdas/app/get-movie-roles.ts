import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  ddb,
  isRoleItem,
  isMovieItem,
  movieKey,
  parseId,
  tableName,
  toRole,
} from "../shared/db";
import { response } from "../shared/http";
import { logRequest } from "../shared/request-logger";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);

  const movieId = parseId(event.pathParameters?.movieID);
  if (movieId === undefined) {
    return response(400, { message: "movieID must be a positive integer" });
  }

  const actorParam = event.queryStringParameters?.actor;
  const actorId = parseId(actorParam);
  if (actorParam !== undefined && actorId === undefined) {
    return response(400, { message: "actor must be a positive integer" });
  }

  try {
    const queryResult = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": movieKey(movieId) },
      })
    );
    const items = queryResult.Items ?? [];
    if(!items.some(isMovieItem)) {
      return response(404, { message: `Movie ${movieId} not found` });
    }

    const roles = (queryResult.Items ?? []).filter(isRoleItem).map(toRole);
    if(actorId === undefined){
      return response(200, { data: roles });
    }
    // const matchingRoles = actorId === undefined ? roles : roles.filter((role) => role.actorId === actorId);
    const actorRoles = roles.filter((role) => role.actorId === actorId);
    if(actorRoles.length === 0) {
      return response(404, { message: `Actor ${actorId} not found in movie ${movieId}` });
    }
    return response(200, { data: actorRoles });
  } catch (err) {
    console.error("DynamoDB error:", err);
    return response(500, {
      message: "Internal server error",
      error: err,
    });
  }
};
