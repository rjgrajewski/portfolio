/**
 * One shared DynamoDB document client for the guardrail tables
 * (sessions, usage-counters, conversation-logs). Module-level so warm
 * containers reuse the connection pool.
 *
 * Lives in backend/functions/shared/ because both Lambdas need it: the
 * reasoning function (agent/) and the credential-vending function
 * (credentials/) both read/write `usage-counters` for their respective
 * circuit-breakers. See docs/ARCHITECTURE.md § Abuse protection and cost
 * control.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
