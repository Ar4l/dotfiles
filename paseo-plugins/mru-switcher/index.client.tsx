import { getPaseoClient } from "@getpaseo/plugin/client";
import { start } from "./client/web";

export default function contribute() {
  return start(getPaseoClient);
}
