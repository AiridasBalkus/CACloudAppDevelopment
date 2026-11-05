import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { actorKey, ddb, movieKey, type Role, tableName } from "../shared/db";
import { internalError, isResponse, parseJsonObject, response } from "../shared/http";
import { logRequest } from "../shared/request-logger";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);

  const body = parseJsonObject(event);
  if (isResponse(body)) return body;

  const errors = validateRole(body);
  if (errors.length > 0) {
    return response(400, { message: "Invalid request body", errors });
  }

  const role: Role = {
    movieId: body.movieId as number,
    actorId: body.actorId as number,
    roleName: body.roleName as string,
    roleDescription: body.roleDescription as string,
  };

  const movie = {PK: movieKey(role.movieId), SK: movieKey(role.movieId)};
  const actor = {PK: actorKey(role.actorId), SK: actorKey(role.actorId)};

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: tableName,
              Key: movie,
              ConditionExpression: "attribute_exists(PK)",
            },
          },
          {
            ConditionCheck: {
              TableName: tableName,
              Key: actor,
              ConditionExpression: "attribute_exists(PK)",
            },
          },
          {
            Put: {
              TableName: tableName,
              Item: { PK: movie.PK, SK: actor.SK, ...role },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          },
        ],
      })
    );
    return response(201, { message: "Role added", data: role });
  } catch (err) {
    if(err instanceof TransactionCanceledException) {
      return failedConditionResponse(err, role);
    }
    return internalError(err);
  }
};

const validateRole = (body: Record<string, unknown>): string[] => {
  const errors: string[] = [];
  for (const field of ["movieId", "actorId"]) {
    const value = body[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      errors.push(`${field} must be a positive integer`);
    }
  }
for (const field of ["roleName", "roleDescription"]) {
    const value = body[field];
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  return errors;
};

const failedConditionResponse = (
  err: TransactionCanceledException,
  role: Role
): APIGatewayProxyResult => {
  const failed = (err.CancellationReasons ?? []).map(
    (reason) => reason.Code === "ConditionalCheckFailed"
  );
  const [movieMissing, actorMissing, roleExists] = failed;

  const notFound: string[] = [];
  if (movieMissing) notFound.push(`Movie ${role.movieId} not found`);
  if (actorMissing) notFound.push(`Actor ${role.actorId} not found`);
  if (notFound.length > 0) {
    return response(404, { message: notFound.join("; ") });
  }
  if (roleExists) {
    return response(409, {
      message: `Actor ${role.actorId} already has a role in movie ${role.movieId}`,
    });
  }
  return internalError(err);
};