/**
 * Re-export of the shared DynamoDB document client
 * (backend/functions/shared/ddb.ts). Kept as a local module so the other
 * files in this function can keep importing `./ddb` unchanged.
 */

export { ddb } from "../../shared/ddb";
