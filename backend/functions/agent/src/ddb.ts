/**
 * One shared DynamoDB document client for the guardrail tables
 * (sessions, usage-counters, conversation-logs). Module-level so warm
 * containers reuse the connection pool.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
